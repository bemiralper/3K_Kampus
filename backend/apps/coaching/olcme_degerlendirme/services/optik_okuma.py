"""Tarama okuma.

Form milimetresi, yazıcı profili ve tarama kaydı ayrı kalır. Bu modül daire
koordinatını ve yazıcı profilini değiştirmez. Sayfayı sol ize oturtur, koyu
işaretin daire içine düştüğü kaydırmayı seçer, her dairede kısa bir arama yapar.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image

from .daire_dizisi_detect import izleri_algila
from .daire_dizisi_schema import TUR_KITAPCIK, TUR_METIN, TUR_TC, etiketler, satir_y
from .daire_dizisi_tarama import _kayit
from .omr_engine import PX_PER_MM, _cell_score, _decode_field, _page_warp, _tara_nokta

ARAMA_MM = 0.8


def tc_gecerli(value: str) -> bool:
    """T.C. kimlik kontrol hanesi. 11 hane ve ilk hane sıfır olamaz."""
    digits = ''.join(ch for ch in (value or '') if ch.isdigit())
    if len(digits) != 11 or digits[0] == '0':
        return False
    d = [int(ch) for ch in digits]
    tenth = ((sum(d[0:9:2]) * 7) - sum(d[1:8:2])) % 10
    eleventh = sum(d[:10]) % 10
    return d[9] == tenth and d[10] == eleventh


def _pitch(belge: dict) -> float:
    iz = belge.get('iz') or {}
    if iz.get('aralik_mm'):
        return float(iz['aralik_mm'])
    pitches = []
    for alan in belge.get('alanlar') or []:
        if alan.get('tur') == TUR_METIN or not alan.get('aktif', True):
            continue
        pitch = float(alan.get('aralik_y_mm') or 0)
        if pitch > 0:
            pitches.append(pitch)
    if not pitches:
        return 4.3
    pitches.sort()
    return pitches[len(pitches) // 2]


def _alanlar(belge: dict) -> list[dict]:
    return [
        alan for alan in (belge.get('alanlar') or [])
        if alan.get('aktif', True) and alan.get('tur') != TUR_METIN
    ]


def _hizalama_alanlari(belge: dict) -> list[dict]:
    """Satır kaydı, cevap ızgarasından değil kimlik ve kısa kod alanlarından kurulur."""
    return [
        alan for alan in _alanlar(belge)
        if alan.get('tur') != 'cevap_bloku'
    ]


def hizalama_skoru(gray, belge: dict, kayit, noktalar=None) -> float:
    """Her sütunda tek koyu dairenin komşusundan sıçramasını toplar.

    Boş dairelerin ortalaması basılı yazıya kayar. Burada yalnız net işaret sayılır.
    """
    del noktalar
    total = 0.0
    for alan in _hizalama_alanlari(belge):
        labels = etiketler(alan)
        row_character = (alan.get('kodlama_yonu') or 'satir_karakter') == 'satir_karakter'
        character_count = int(alan['satir'] if row_character else alan['sutun'])
        symbol_count = int(alan['sutun'] if row_character else alan['satir'])
        if len(labels) != symbol_count:
            continue
        scores = {}
        cap = float(alan.get('cap_mm') or 3.2)
        for row in range(int(alan['satir'])):
            y = satir_y(alan, row, None)
            for col in range(int(alan['sutun'])):
                x = float(alan['x_mm']) + col * float(alan['aralik_x_mm'])
                sx, sy = _tara_nokta(x, y, kayit)
                _ox, _oy, score = yerel_merkez(gray, sx, sy, cap)
                scores[(row, col)] = score
        for char_index in range(character_count):
            options = []
            for symbol_index in range(symbol_count):
                row, col = (char_index, symbol_index) if row_character else (symbol_index, char_index)
                options.append(scores[(row, col)])
            options.sort(reverse=True)
            best = options[0]
            second = options[1] if len(options) > 1 else 0.0
            if best >= 0.30 and best - second >= 0.12:
                total += best - second
    return total


def aday_kayitlar(gray, belge: dict, width_mm: float, height_mm: float) -> list[tuple]:
    """İz kaydının çevresinde birkaç satırlık kaydırma dener."""
    pitch = _pitch(belge)
    iz = belge.get('iz') or {}
    base = None
    if iz.get('satirlar_mm'):
        found = izleri_algila(Image.fromarray(gray), width_mm, height_mm)
        if found:
            try:
                base = _kayit(iz, found)
            except ValueError:
                base = None
    adaylar = []
    if base:
        a, b, dx = base
        for shift in range(-6, 7):
            adaylar.append((a, b + shift * pitch, dx, shift))
    else:
        for shift in range(-4, 5):
            adaylar.append((1.0, shift * pitch, 0.0, shift))
    return adaylar


def sec_kayit(gray, belge: dict, adaylar, noktalar) -> dict:
    """Koyu işaretleri daire merkezine oturtan kaydırmayı seçer.

    Skorlar birbirine çok yakınsa veya sayfada işaret yoksa izin kendi
    kaydına (kaydırma 0) dönülür. Güven, iz bulundu diye sabitlenmez.
    """
    if not adaylar:
        adaylar = [(1.0, 0.0, 0.0, 0)]
    scored = []
    for aday in adaylar:
        scored.append((hizalama_skoru(gray, belge, aday[:3], noktalar), aday))
    scored.sort(key=lambda item: (-item[0], abs(item[1][3])))
    best_score, best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    neutral = next((item for item in scored if item[1][3] == 0), scored[0])
    # İz kaydından ancak açık ara daha koyu bir satır varsa ayrıl.
    override = best[3] != 0 and best_score >= neutral[0] * 1.15 + 0.4
    if override:
        chosen_score, chosen = best_score, best
        kararsiz = False
    else:
        chosen_score, chosen = neutral
        kararsiz = best[3] != 0 and best_score > neutral[0] + 0.2
    if chosen_score < 0.4:
        confidence = 0.35
        kararsiz = True
    elif kararsiz:
        confidence = 0.55
    else:
        margin = (chosen_score - second) / chosen_score if chosen_score else 0.0
        confidence = round(min(0.95, 0.55 + margin * 0.4), 4)
    return {
        'kayit': chosen[:3],
        'satir_kaydirma': int(chosen[3]),
        'skor': round(chosen_score, 4),
        'en_iyi_skor': round(best_score, 4),
        'ikinci_skor': round(second, 4),
        'confidence': confidence,
        'kararsiz': kararsiz or chosen_score < 0.04,
    }


def yerel_merkez(gray, x_mm: float, y_mm: float, cap_mm: float) -> tuple[float, float, float]:
    """Beklenen merkezin çevresinde en koyu içi arar. Aralık bir satırdan kısadır."""
    best = (x_mm, y_mm, _cell_score(gray, x_mm, y_mm, cap_mm))
    for dx in (-ARAMA_MM, 0.0, ARAMA_MM):
        for dy in (-ARAMA_MM, 0.0, ARAMA_MM):
            if dx == 0 and dy == 0:
                continue
            score = _cell_score(gray, x_mm + dx, y_mm + dy, cap_mm)
            if score > best[2]:
                best = (x_mm + dx, y_mm + dy, score)
    return best


def dropout_gray(scan, blank):
    """Boş formdaki basılı halkayı düşürür. Yalnız taramada daha koyu olan kalır."""
    import numpy as np

    if blank is None or getattr(blank, 'shape', None) != getattr(scan, 'shape', None):
        return scan, False
    darker = np.clip(blank.astype('int16') - scan.astype('int16'), 0, 255)
    return (255 - darker).astype('uint8'), True


def _png_bytes(gray) -> bytes:
    output = BytesIO()
    Image.fromarray(gray).save(output, format='PNG')
    return output.getvalue()


def _warp_array(png: bytes, width_mm: float, height_mm: float):
    gray, registration = _page_warp(png, width_mm, height_mm)
    return gray, registration


def sayfa_oku(png: bytes, belge: dict, width_mm: float, height_mm: float, blank_png: bytes | None = None) -> dict:
    """Bir sayfayı okur. Dönüş, sınav sonucuna yazılmaz."""
    gray, page_registration = _warp_array(png, width_mm, height_mm)
    adaylar = aday_kayitlar(gray, belge, width_mm, height_mm)
    secim = sec_kayit(gray, belge, adaylar, None)
    kayit = secim['kayit']
    read_gray = gray
    dropout = False
    if blank_png:
        blank, _blank_registration = _warp_array(blank_png, width_mm, height_mm)
        read_gray, dropout = dropout_gray(gray, blank)
    registration = {
        'method': 'timing_track' if (belge.get('iz') or {}).get('satirlar_mm') else 'page_resize',
        'confidence': secim['confidence'],
        'a': round(kayit[0], 5),
        'b': round(kayit[1], 3),
        'dx': round(kayit[2], 3),
        'satir_kaydirma': secim['satir_kaydirma'],
        'skor': secim['skor'],
        'ikinci_skor': secim['ikinci_skor'],
        'dropout': dropout,
        'page': {key: value for key, value in page_registration.items() if key != 'matrix'},
    }
    decoded = {'alanlar': {}, 'cevaplar': {}}
    overlays = []
    warnings = []
    critical = []
    confidences = [float(registration['confidence'])]
    if secim['kararsiz']:
        critical.append('Satır kaydı zayıf. İşaretleri sayfanın üzerinde kontrol edin.')

    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True) or alan.get('tur') == TUR_METIN:
            continue
        labels = etiketler(alan)
        row_character = (alan.get('kodlama_yonu') or 'satir_karakter') == 'satir_karakter'
        cells = []
        for row in range(int(alan['satir'])):
            y = satir_y(alan, row, None)
            for col in range(int(alan['sutun'])):
                x = float(alan['x_mm']) + col * float(alan['aralik_x_mm'])
                sx, sy = _tara_nokta(x, y, kayit)
                ox, oy, score = yerel_merkez(read_gray, sx, sy, float(alan.get('cap_mm') or 3.2))
                if row_character:
                    karakter, etiket_index = row, col
                else:
                    karakter, etiket_index = col, row
                etiket = labels[etiket_index] if etiket_index < len(labels) else ''
                cells.append({
                    'satir': row,
                    'sutun': col,
                    'karakter': karakter,
                    'etiket': etiket,
                    'x_mm': round(x, 3),
                    'y_mm': round(y, 3),
                    'okuma_x_mm': round(ox, 3),
                    'okuma_y_mm': round(oy, 3),
                    'score': score,
                })
        value, states, field_warnings, confidence = _decode_field(alan, cells)
        for state in states:
            top = ((state.get('candidates') or [{}])[0]).get('score') or 0
            if state.get('value') and top < 0.22:
                state['value'] = ''
                state['state'] = 'ambiguous'
                field_warnings.append(f"{alan.get('ad')}: {state['index'] + 1}. sıradaki işaret soluk, sayfada kontrol edin.")
        value = ''.join(state.get('value') or '' for state in states)
        chosen = {state['index']: state for state in states}
        for cell in cells:
            state = chosen.get(cell['karakter']) or {}
            if state.get('value') and cell['etiket'] == state.get('value'):
                durum = 'secili'
            elif cell['score'] >= 0.16:
                durum = 'dolu'
            else:
                durum = 'bos'
            cell['durum'] = durum
            cell['karakter_durumu'] = state.get('state') or 'blank'
        field = {
            'id': alan['id'],
            'ad': alan.get('ad') or '',
            'tur': alan.get('tur'),
            'veri_kaynagi': alan.get('veri_kaynagi') or '',
            'value': value,
            'confidence': round(confidence, 4),
            'states': states,
        }
        decoded['alanlar'][alan['id']] = field
        if alan.get('veri_kaynagi'):
            decoded[alan['veri_kaynagi']] = value
        if alan.get('tur') == 'cevap_bloku':
            meta = alan.get('cevap_bloku') or {}
            physical = meta.get('fiziksel_sira') or list(range(
                int(meta.get('soru_baslangic') or 1),
                int(meta.get('soru_baslangic') or 1) + int(meta.get('soru_sayisi') or len(states)),
            ))
            field['cevap_esleme'] = [physical[index] for index in range(min(len(states), len(physical)))]
            for index, state in enumerate(states):
                if index < len(physical):
                    decoded['cevaplar'][str(physical[index])] = state['value']
        if alan.get('tur') == TUR_KITAPCIK:
            decoded['kitapcik'] = value
        if (alan.get('tur') == TUR_TC or alan.get('veri_kaynagi') == 'tc') and value:
            gecerli = tc_gecerli(value)
            decoded['tc_gecerli'] = gecerli
            if not gecerli:
                critical.append('T.C. kontrol hanesi tutmuyor. Sayfayı inceleyin.')
                confidence = min(confidence, 0.4)
                field['confidence'] = round(confidence, 4)
        overlays.extend([{**cell, 'alan_id': alan['id'], 'ad': alan.get('ad') or ''} for cell in cells])
        warnings.extend(field_warnings)
        is_optional = (
            alan.get('tur') not in ('cevap_bloku', TUR_KITAPCIK, TUR_TC)
            and alan.get('veri_kaynagi') not in ('tc', 'ad_soyad', 'ogrenci_no')
        )
        if not (is_optional and not value):
            confidences.append(confidence)
            if confidence < 0.35:
                critical.append(f"{alan.get('ad')}: güven çok düşük.")

    return {
        'registration': registration,
        'decoded': decoded,
        'overlay': overlays,
        'confidence': round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
        'warnings': list(dict.fromkeys(warnings)),
        'critical_warnings': list(dict.fromkeys(critical)),
        'preview_png': _png_bytes(gray),
    }


def etkin_alanlar(decoded: dict, secimler: dict | None) -> dict:
    """İncelemede tıklanan daire, otomatik okumanın önüne geçer."""
    secimler = secimler or {}
    output = {}
    alanlar = (decoded or {}).get('alanlar') or {}
    for alan_id, field in alanlar.items():
        overrides = secimler.get(alan_id) or secimler.get(str(alan_id)) or {}
        chars = []
        for state in field.get('states') or []:
            key = str(state.get('index'))
            if key in overrides and overrides[key] is not None:
                chars.append(str(overrides[key]))
            elif state.get('index') in overrides and overrides[state.get('index')] is not None:
                chars.append(str(overrides[state.get('index')]))
            else:
                chars.append(state.get('value') or '')
        output[alan_id] = {**field, 'value': ''.join(chars)}
    return output


def dogrula(decoded: dict, secimler: dict | None, beklenen: dict) -> dict:
    """Basılan bilinen değer ile okunan değeri karşılaştırır."""
    alanlar = etkin_alanlar(decoded, secimler)
    by_source = {}
    for field in alanlar.values():
        if field.get('veri_kaynagi'):
            by_source[field['veri_kaynagi']] = field['value']
    farklar = []
    for key in ('tc', 'ad_soyad', 'ogrenci_no', 'kitapcik'):
        expected = beklenen.get(key)
        if expected in (None, ''):
            continue
        actual = by_source.get(key, '')
        if str(expected).replace(' ', '').upper() != str(actual).replace(' ', '').upper():
            farklar.append({'alan': key, 'basilan': expected, 'okunan': actual})
    expected_answers = beklenen.get('cevaplar') or ''
    if isinstance(expected_answers, str) and expected_answers.strip():
        actual_map = dict((decoded or {}).get('cevaplar') or {})
        for field in alanlar.values():
            for index, question in enumerate(field.get('cevap_esleme') or []):
                value = field.get('value') or ''
                actual_map[str(question)] = value[index] if index < len(value) else ''
        expected = expected_answers.replace(' ', '').upper()
        actual = ''.join(actual_map.get(str(index + 1), '') for index in range(len(expected)))
        if actual.upper() != expected:
            farklar.append({'alan': 'cevaplar', 'basilan': expected_answers, 'okunan': actual})
    return {'uyumlu': not farklar, 'farklar': farklar}
