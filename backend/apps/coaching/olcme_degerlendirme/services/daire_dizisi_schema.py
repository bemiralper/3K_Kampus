"""Daire dizisi belgesi: daire-dizisi-v1.

Geometri parametrik saklanır (başlangıç, satır, sütun, çap, aralık).
Çap ile merkez aralığı birbirine bağlanmaz. Ekran pikseli kaydedilmez.
Kalibrasyon geometriden ayrıdır ve yalnız baskı dönüşümünde uygulanır.
"""
from __future__ import annotations

import uuid
from decimal import Decimal, InvalidOperation

SURUM = 'daire-dizisi-v1'

TUR_METIN = 'metin'
TUR_DAIRE = 'daire_dizisi'
TUR_SAYISAL = 'sayisal_kodlama'
TUR_TEK = 'tek_secim'
TUR_COKLU = 'coklu_secim'
TUR_KITAPCIK = 'kitapcik_turu'
TUR_OGRENCI_NO = 'ogrenci_numarasi'
TUR_TC = 'tc_kimlik'
TUR_SINAV_NO = 'sinav_numarasi'
TUR_CEVAP = 'cevap_bloku'

DAIRE_TURLERI = {
    TUR_DAIRE, TUR_SAYISAL, TUR_TEK, TUR_COKLU,
    TUR_KITAPCIK, TUR_OGRENCI_NO, TUR_TC, TUR_SINAV_NO, TUR_CEVAP,
}
SAYISAL_TURLER = {TUR_SAYISAL, TUR_OGRENCI_NO, TUR_TC, TUR_SINAV_NO}
TURLER = DAIRE_TURLERI | {TUR_METIN}

YON_SATIR = 'satir_karakter'
YON_SUTUN = 'sutun_karakter'
YONLER = {YON_SATIR, YON_SUTUN}

RAKAMLAR = list('0123456789')
KITAPCIK = list('ABCD')
# YKS ad-soyad sırası. 29 harf; Q, W, X yok.
HARFLER = list('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ')
AD_KAYNAKLARI = {'ad', 'soyad', 'ad_soyad'}

VERI_KAYNAKLARI = (
    ('ad', 'Öğrenci adı', 'ogrenci.ad'),
    ('soyad', 'Öğrenci soyadı', 'ogrenci.soyad'),
    ('ad_soyad', 'Ad soyad', 'ogrenci.ad + ogrenci.soyad'),
    ('tc', 'T.C. kimlik numarası', 'ogrenci.tc_kimlik_no'),
    ('ogrenci_no', 'Öğrenci numarası', 'ogrenci_kayit.okul_no'),
    ('numara', 'Öğrenci numarası', 'ogrenci_kayit.okul_no'),
    ('sinif', 'Sınıf', 'ogrenci_kayit.sinif'),
    ('sube', 'Şube', 'ogrenci_kayit.sinif'),
    ('sinif_sube', 'Sınıf / şube', 'ogrenci_kayit.sinif'),
    ('okul', 'Okul', 'ogrenci_kayit.school veya kurum'),
    ('il', 'İl', 'şube.il, yoksa kurum.il'),
    ('ilce', 'İlçe', 'şube.ilce, yoksa kurum.ilce'),
    ('il_ilce', 'İl / ilçe', 'şube.il + şube.ilce, yoksa kurum'),
    ('telefon', 'Öğrenci telefonu', 'ogrenci.telefon'),
    ('email', 'Öğrenci e-posta', 'ogrenci.email'),
    ('veli_ad_soyad', 'Veli ad soyad', 'ogrenci.veli_ad_soyad'),
    ('veli_telefon', 'Veli telefon', 'ogrenci.veli_telefon'),
    ('salon', 'Salon ve sıra', 'sinav katılımcı salonu'),
    ('sira', 'Sıra', 'sinav katılımcı sıra no'),
    ('oturum', 'Oturum', 'sinav oturumu'),
    ('deneme_adi', 'Sınav adı', 'exam.name'),
    ('sinav_no', 'Sınav numarası', 'exam.id'),
    ('kurum', 'Kurum', 'kurum.ad'),
    ('kitapcik', 'Kitapçık türü', 'sabit değer; katılımcıda kitapçık alanı yok'),
)


def veri_kaynagi_listesi():
    return [
        {'kod': kod, 'etiket': etiket, 'kaynak': kaynak}
        for kod, etiket, kaynak in VERI_KAYNAKLARI
    ]


def bos_belge():
    return {
        'surum': SURUM,
        'kalibrasyon': {'ofset_x_mm': 0.0, 'ofset_y_mm': 0.0, 'olcek': 1.0},
        'alanlar': [],
    }


def _num(value, label, places='0.01'):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f'{label} sayı olmalıdır.')
    return float(number.quantize(Decimal(places)))


def tr_upper(text: str) -> str:
    return (text or '').replace('i', 'İ').replace('ı', 'I').upper()


def kisalt_ad_soyad(text: str) -> str:
    """İlk ismin baş harfi, boşluk, sonraki isimler ve soyad.

    Harf kodlamasında nokta yoktur; baş harften sonra boşluk kalır.
    Kısaltılamazsa metin aynı kalır.
    """
    parts = (text or '').split()
    if len(parts) < 2 or len(parts[0]) < 2:
        return (text or '').strip()
    short = f'{tr_upper(parts[0][0])} ' + ' '.join(parts[1:])
    if len(tr_upper(short)) >= len(tr_upper(text or '')):
        return (text or '').strip()
    return short


def ad_soyad_sigdir(text: str, kapasite: int) -> str:
    """Karakter sığmazsa adı kısalt. Sığıyorsa olduğu gibi bırak."""
    raw = (text or '').strip()
    if kapasite <= 0 or len(tr_upper(raw)) <= kapasite:
        return raw
    return kisalt_ad_soyad(raw)


def karakter_sayisi(alan: dict) -> int:
    if alan.get('kodlama_yonu') == YON_SUTUN:
        return int(alan.get('sutun') or 1)
    return int(alan.get('satir') or 1)


def sembol_sayisi(alan: dict) -> int:
    if alan.get('kodlama_yonu') == YON_SUTUN:
        return int(alan.get('satir') or 1)
    return int(alan.get('sutun') or 1)


def varsayilan_etiketler(tur: str) -> list[str]:
    if tur in SAYISAL_TURLER:
        return list(RAKAMLAR)
    if tur == TUR_KITAPCIK:
        return list(KITAPCIK)
    return []


def etiketler(alan: dict) -> list[str]:
    raw = alan.get('etiketler') or []
    cleaned = []
    for item in raw:
        text = str(item).strip()
        if text:
            cleaned.append(text)
    if cleaned:
        return cleaned
    if alan.get('tur') == TUR_CEVAP:
        return [
            str(item).strip()
            for item in (alan.get('cevap_bloku') or {}).get('secenekler', [])
            if str(item).strip()
        ]
    return varsayilan_etiketler(alan.get('tur') or '')


def kod_etiketleri(alan: dict) -> list[str]:
    """Kodlamada kullanılacak semboller.

    Ad soyad ızgarasında kayıtlı etiketler harf sayısına uymuyorsa YKS
    alfabesi kullanılır. Böylece Ğ.H gibi birleşmiş etiketler kodu düşürmez.
    """
    labels = etiketler(alan)
    n_sym = sembol_sayisi(alan)
    tek = bool(labels) and len(labels) == n_sym and all(len(tr_upper(item)) == 1 for item in labels)
    if tek:
        return labels
    if alan.get('tur') == TUR_DAIRE and alan.get('veri_kaynagi') in AD_KAYNAKLARI and n_sym == len(HARFLER):
        return list(HARFLER)
    return labels


def geometri_hatalari(alan: dict) -> list[str]:
    """Aktif ve basılacak bir dairenin türüne uymayan ızgarası."""
    tur = alan.get('tur')
    if tur == TUR_METIN or not alan.get('aktif', True):
        return []
    ad = alan.get('ad') or 'Alan'
    source = alan.get('veri_kaynagi') or ''
    if tur == TUR_DAIRE:
        return []
    labels = etiketler(alan)
    n_char = karakter_sayisi(alan)
    n_sym = sembol_sayisi(alan)
    errors = []
    if n_sym != len(labels):
        errors.append(f'{ad}: seçenek sayısı ({len(labels)}) sembol ekseniyle ({n_sym}) aynı olmalıdır.')
    if len(labels) != len({tr_upper(item) for item in labels}):
        errors.append(f'{ad}: seçenek etiketleri tekrar edemez.')
    if tur == TUR_TC:
        if source and source != 'tc':
            errors.append(f'{ad}: T.C. alanı T.C. kimlik kaynağına bağlanmalıdır.')
        if n_char != 11:
            errors.append(f'{ad}: T.C. kimlik numarası 11 karakter sırası ister.')
        if labels != RAKAMLAR:
            errors.append(f'{ad}: T.C. sütunları 0-9 rakamları olmalıdır.')
    elif tur in SAYISAL_TURLER:
        allowed = {
            TUR_OGRENCI_NO: {'ogrenci_no', 'numara'},
            TUR_SINAV_NO: {'sinav_no'},
            TUR_SAYISAL: set(),
        }.get(tur, set())
        if source and allowed and source not in allowed:
            errors.append(f'{ad}: seçilen veri kaynağı bu sayısal alan türüyle uyumlu değil.')
        if any(len(item) != 1 or item not in '0123456789' for item in labels):
            errors.append(f'{ad}: sayısal seçenekler tek rakam olmalıdır.')
        if n_char < 1:
            errors.append(f'{ad}: en az bir karakter sırası gerekir.')
    elif tur == TUR_KITAPCIK:
        if source and source != 'kitapcik':
            errors.append(f'{ad}: kitapçık alanı kitapçık kaynağına bağlanmalıdır.')
        if n_char != 1:
            errors.append(f'{ad}: kitapçık türü tek sıra olmalıdır.')
        if not labels:
            errors.append(f'{ad}: kitapçık seçenekleri gerekir.')
    elif tur == TUR_TEK:
        if n_char != 1:
            errors.append(f'{ad}: tek seçim tek sıra olmalıdır.')
        if not labels:
            errors.append(f'{ad}: seçenek etiketleri gerekir.')
    elif tur == TUR_COKLU:
        if n_char != 1:
            errors.append(f'{ad}: çoklu seçim seçenekleri tek sırada durur.')
        if not labels:
            errors.append(f'{ad}: seçenek etiketleri gerekir.')
    elif tur == TUR_CEVAP:
        cevap = alan.get('cevap_bloku') or {}
        if n_char < 1:
            errors.append(f'{ad}: cevap bloğunda en az bir soru olmalıdır.')
        if not labels:
            errors.append(f'{ad}: cevap seçenekleri gerekir.')
        if int(cevap.get('soru_sayisi') or 0) != n_char:
            errors.append(f'{ad}: soru sayısı karakter ekseniyle ({n_char}) aynı olmalıdır.')
    return errors


def _esles(raw: str, labels: list[str]) -> str | None:
    key = tr_upper((raw or '').strip())
    if not key:
        return None
    for label in labels:
        if tr_upper(label) == key:
            return label
    return None


def kodla(alan: dict, raw) -> tuple[list[str] | None, str]:
    """İşaretlenecek semboller.

    Dönüş (None, empty|invalid) basılmaz. Sayı metin olarak kalır; baştaki
    sıfırlar atılmaz, değer int'e çevrilmez.
    Sayısal sonuç, karakter sırası uzunluğunda bir listedir (boş slot '').
    Seçim sonucu, işaretlenecek etiket listesidir.
    """
    tur = alan.get('tur')
    if tur == TUR_METIN:
        return None, 'empty'
    text = '' if raw is None else str(raw)
    stripped = text.strip()
    labels = kod_etiketleri(alan)
    slots = karakter_sayisi(alan)
    if not stripped:
        return None, 'empty'
    if tur == TUR_DAIRE:
        if alan.get('veri_kaynagi') not in AD_KAYNAKLARI:
            return None, 'empty'
        return _kodla_harf(alan, stripped, labels, slots)

    if tur in SAYISAL_TURLER:
        if any(ch not in '0123456789' for ch in stripped):
            return None, 'invalid'
        if tur == TUR_TC and len(stripped) != slots:
            return None, 'invalid'
        if len(stripped) > slots:
            return None, 'invalid'
        if any(ch not in labels for ch in stripped):
            return None, 'invalid'
        cells = list(stripped)
        pad = slots - len(cells)
        if (alan.get('kod_hizasi') or 'sol') == 'sag':
            cells = [''] * pad + cells
        else:
            cells = cells + [''] * pad
        return cells, 'ok'

    if tur in (TUR_TEK, TUR_KITAPCIK):
        found = _esles(stripped, labels)
        if not found:
            return None, 'invalid'
        return [found], 'ok'

    if tur == TUR_COKLU:
        if ',' in stripped:
            parts = [part.strip() for part in stripped.split(',') if part.strip()]
        elif any(len(label) > 1 for label in labels):
            parts = [stripped]
        else:
            parts = [ch for ch in tr_upper(stripped) if not ch.isspace()]
        chosen = []
        for part in parts:
            found = _esles(part, labels)
            if not found:
                return None, 'invalid'
            if found not in chosen:
                chosen.append(found)
        if not chosen:
            return None, 'empty'
        return chosen, 'ok'
    return None, 'invalid'


def _kodla_harf(alan: dict, text: str, labels: list[str], slots: int):
    """Her karakter bir sıra. Boşluk daire kodlamaz; sonraki harfi kaydırmaz."""
    if alan.get('veri_kaynagi') == 'ad_soyad':
        text = ad_soyad_sigdir(text, slots)
    chars = list(tr_upper(text))
    if len(chars) > slots:
        chars = chars[:slots]
    cells = []
    for ch in chars:
        if ch.isspace():
            cells.append('')
            continue
        cells.append(_esles(ch, labels) or '')
    pad = slots - len(cells)
    if (alan.get('kod_hizasi') or 'sol') == 'sag':
        cells = [''] * pad + cells
    else:
        cells = cells + [''] * pad
    if not any(cells):
        return None, 'empty'
    return cells, 'ok'


def daire_merkezleri(alan: dict) -> list[tuple[float, float]]:
    x0 = float(alan['x_mm'])
    y0 = float(alan['y_mm'])
    ax = float(alan['aralik_x_mm'])
    ay = float(alan['aralik_y_mm'])
    points = []
    for row in range(int(alan['satir'])):
        for col in range(int(alan['sutun'])):
            points.append((x0 + col * ax, y0 + row * ay))
    return points


def isaret_merkezleri(alan: dict, raw) -> tuple[list[tuple[float, float]], str]:
    """Kalibrasyonsuz daire merkezleri ve durum."""
    encoded, status = kodla(alan, raw)
    if not encoded:
        return [], status
    labels = kod_etiketleri(alan)
    index = {label: i for i, label in enumerate(labels)}
    x0 = float(alan['x_mm'])
    y0 = float(alan['y_mm'])
    ax = float(alan['aralik_x_mm'])
    ay = float(alan['aralik_y_mm'])
    yon = alan.get('kodlama_yonu') or YON_SATIR

    def yer(char_i: int, sym_i: int) -> tuple[float, float]:
        if yon == YON_SUTUN:
            return (x0 + char_i * ax, y0 + sym_i * ay)
        return (x0 + sym_i * ax, y0 + char_i * ay)

    if alan.get('tur') in (TUR_TEK, TUR_COKLU, TUR_KITAPCIK):
        return [yer(0, index[label]) for label in encoded], 'ok'
    return [yer(i, index[label]) for i, label in enumerate(encoded) if label], 'ok'


def satir_y(alan: dict, row: int, iz: dict | None = None) -> float:
    """Satırın Y'si, alanın kayıtlı başlangıcı ve dikey aralığıdır.

    Sol iz baskı koordinatını kilitlemez. İz, dolu tarama okunurken sayfayı
    şablona çekmek için kullanılır.
    """
    del iz
    y0 = float(alan['y_mm'])
    ay = float(alan.get('aralik_y_mm') or 0)
    return y0 + int(row) * ay


def kalibrasyon_uygula(x_mm: float, y_mm: float, kalibrasyon: dict) -> tuple[float, float]:
    olcek = float(kalibrasyon.get('olcek') or 1)
    olcek_y = kalibrasyon.get('olcek_y')
    if olcek_y in (None, ''):
        olcek_y = olcek
    return (
        x_mm * olcek + float(kalibrasyon.get('ofset_x_mm') or 0),
        y_mm * float(olcek_y) + float(kalibrasyon.get('ofset_y_mm') or 0),
    )


def _kalibrasyon(raw) -> dict:
    raw = raw or {}
    if not isinstance(raw, dict):
        raise ValueError('Kalibrasyon geçersiz.')
    ofset_x = _num(raw.get('ofset_x_mm', 0), 'Yatay ofset')
    ofset_y = _num(raw.get('ofset_y_mm', 0), 'Dikey ofset')
    olcek = _num(raw.get('olcek', 1), 'Ölçek', '0.0001')
    olcek_y = _num(raw.get('olcek_y', olcek), 'Dikey ölçek', '0.0001')
    if ofset_x < -30 or ofset_x > 30 or ofset_y < -30 or ofset_y > 30:
        raise ValueError('Baskı ofseti -30 ile 30 mm arasında olmalıdır.')
    if olcek < 0.85 or olcek > 1.15 or olcek_y < 0.85 or olcek_y > 1.15:
        raise ValueError('Baskı ölçeği 0,85 ile 1,15 arasında olmalıdır.')
    return {'ofset_x_mm': ofset_x, 'ofset_y_mm': ofset_y, 'olcek': olcek, 'olcek_y': olcek_y}


def kalibrasyon_dogrula(raw) -> dict:
    return _kalibrasyon(raw)


def _iz(raw, *, index=0) -> dict | None:
    if not isinstance(raw, dict) or not raw:
        return None
    aralik = _num(raw.get('aralik_mm'), 'İz aralığı', '0.001')
    adet = int(raw.get('adet') or 0)
    if aralik < 2 or aralik > 20 or adet < 4 or adet > 200:
        raise ValueError('Sol iz aralığı veya sayısı geçersiz.')
    y0 = _num(raw.get('y0_mm'), 'İlk iz')
    gelen = raw.get('satirlar_mm') or []
    if gelen:
        if len(gelen) != adet:
            raise ValueError('Sol iz satır sayısı uyuşmuyor.')
        satirlar = [_num(y, 'İz satırı', '0.01') for y in gelen]
    else:
        satirlar = [round(y0 + i * aralik, 2) for i in range(adet)]
    return {
        'id': str(raw.get('id') or f'iz-{index + 1}')[:40],
        'kenar': raw.get('kenar') if raw.get('kenar') in ('sol', 'sag') else 'sol',
        'x_mm': _num(raw.get('x_mm'), 'İz sağı'),
        'genislik_mm': _num(raw.get('genislik_mm', 4), 'İz genişliği'),
        'y0_mm': y0,
        'aralik_mm': aralik,
        'adet': adet,
        'satirlar_mm': satirlar,
    }


def _izler(raw) -> list[dict]:
    if raw in (None, ''):
        return []
    if not isinstance(raw, list) or len(raw) > 12:
        raise ValueError('İz listesi geçersiz.')
    out = []
    seen = set()
    for index, item in enumerate(raw):
        iz = _iz(item, index=index)
        if iz is None:
            continue
        if iz['id'] in seen:
            raise ValueError('İz kimlikleri benzersiz olmalıdır.')
        seen.add(iz['id'])
        out.append(iz)
    return out


def _metin_kutusu(raw, ad: str, page_w: float, page_h: float):
    """Her daire dilimine yapışık, isteğe bağlı yazı kutuları. Yoksa None."""
    del page_w, page_h
    if raw in (None, '', False):
        return None
    if not isinstance(raw, dict) or not raw:
        raise ValueError(f'{ad}: metin kutusu geçersiz.')
    veri = (raw.get('veri_kaynagi') or '').strip()
    bilinen = {kod for kod, _etiket, _kaynak in VERI_KAYNAKLARI}
    if veri and veri not in bilinen:
        raise ValueError(f'{ad}: metin kutusu veri kaynağı tanınmıyor.')
    sabit = (raw.get('sabit_deger') or '').strip()
    if len(sabit) > 80:
        raise ValueError(f'{ad}: metin kutusu sabiti çok uzun.')
    hiza = (raw.get('hizalama') or 'orta').strip()
    if hiza not in ('sol', 'orta', 'sag'):
        raise ValueError(f'{ad}: metin kutusu hizalaması geçersiz.')
    yon = (raw.get('yon') or 'ust').strip()
    if yon not in ('ust', 'alt', 'sol', 'sag'):
        raise ValueError(f'{ad}: metin kutusu üst, alt, sol veya sağ olmalıdır.')
    olcu = _num(raw.get('olcu_mm', 5), f'{ad} metin kutusu ölçüsü')
    if olcu < 1.5 or olcu > 40:
        raise ValueError(f'{ad}: metin kutusu ölçüsü 1,5 ile 40 mm arasında olmalıdır.')
    bosluk = _num(raw.get('bosluk_mm', 0), f'{ad} metin kutusu boşluğu')
    if bosluk < 0 or bosluk > 30:
        raise ValueError(f'{ad}: daire boşluğu 0 ile 30 mm arasında olmalıdır.')
    punto = _num(raw.get('punto', 8), f'{ad} metin kutusu punto', '0.1')
    if punto < 5 or punto > 18:
        raise ValueError(f'{ad}: metin kutusu puntosu 5 ile 18 arasında olmalıdır.')
    aralik = _num(raw.get('karakter_araligi', 0), f'{ad} metin kutusu aralık')
    if aralik < -1 or aralik > 6:
        raise ValueError(f'{ad}: metin kutusu karakter aralığı geçersiz.')
    return {
        'aktif': bool(raw.get('aktif', False)),
        'yon': yon,
        'olcu_mm': olcu,
        'bosluk_mm': bosluk,
        'punto': punto,
        'hizalama': hiza,
        'karakter_araligi': aralik,
        'veri_kaynagi': veri,
        'sabit_deger': sabit,
    }


def kutu_dilimleri(alan: dict, text: str, iz: dict | None = None) -> list[dict]:
    """Üst ve altta sütun başına, sağ ve solda satır başına bir kutu.

    Komşu kutular kenar kenara değer. Şeridin daireye uzaklığı bosluk_mm'dir.
    """
    kutu = alan.get('metin_kutusu')
    if not isinstance(kutu, dict) or not kutu.get('aktif'):
        return []
    cap = float(alan.get('cap_mm') or 0)
    if cap <= 0:
        return []
    yon = kutu.get('yon') or 'ust'
    olcu = float(kutu.get('olcu_mm') or 5)
    bosluk = float(kutu.get('bosluk_mm') or 0)
    x0 = float(alan.get('x_mm') or 0)
    y0 = float(alan.get('y_mm') or 0)
    aralik_x = float(alan.get('aralik_x_mm') or 0)
    aralik_y = float(alan.get('aralik_y_mm') or 0)
    satir = int(alan.get('satir') or 1)
    sutun = int(alan.get('sutun') or 1)
    chars = list(tr_upper(text or ''))
    dilimler = []
    if yon in ('ust', 'alt'):
        pitch = aralik_x
        ilk_y = satir_y(alan, 0, iz)
        son_y = satir_y(alan, satir - 1, iz)
        for col in range(sutun):
            cx = x0 + col * aralik_x
            top = ilk_y - cap / 2 - bosluk - olcu if yon == 'ust' else son_y + cap / 2 + bosluk
            dilimler.append({
                'x_mm': cx - pitch / 2,
                'y_mm': top,
                'genislik_mm': pitch,
                'yukseklik_mm': olcu,
                'metin': chars[col] if col < len(chars) else '',
            })
        return dilimler
    row_ys = [satir_y(alan, row, iz) for row in range(satir)]
    for row in range(satir):
        cy = row_ys[row]
        onceki = row_ys[row - 1] if row else cy - (row_ys[1] - cy if satir > 1 else aralik_y)
        sonraki = row_ys[row + 1] if row + 1 < satir else cy + (cy - row_ys[row - 1] if satir > 1 else aralik_y)
        top = (onceki + cy) / 2
        bottom = (cy + sonraki) / 2
        left = x0 - cap / 2 - bosluk - olcu if yon == 'sol' else x0 + (sutun - 1) * aralik_x + cap / 2 + bosluk
        dilimler.append({
            'x_mm': left,
            'y_mm': top,
            'genislik_mm': olcu,
            'yukseklik_mm': round(bottom - top, 6),
            'metin': chars[row] if row < len(chars) else '',
        })
    return dilimler


def _etiket_listesi(raw, ad: str) -> list[str]:
    if raw in (None, ''):
        return []
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(',')]
    if not isinstance(raw, list):
        raise ValueError(f'{ad}: etiketler liste olmalıdır.')
    cleaned = []
    for item in raw:
        text = str(item).strip()
        if not text:
            continue
        if len(text) > 8:
            raise ValueError(f'{ad}: etiket çok uzun.')
        cleaned.append(text)
    if len(cleaned) > 80:
        raise ValueError(f'{ad}: en fazla 80 etiket olabilir.')
    return cleaned


def _cevap_bloku(raw, ad: str, karakter: int) -> dict | None:
    if raw in (None, ''):
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError(f'{ad}: cevap bloğu ayarı geçersiz.')
    try:
        baslangic = int(raw.get('soru_baslangic') or 1)
        sayi = int(raw.get('soru_sayisi') or karakter)
    except (TypeError, ValueError):
        raise ValueError(f'{ad}: soru başlangıcı ve sayısı tam sayı olmalıdır.')
    if baslangic < 1 or sayi < 1 or sayi > 500:
        raise ValueError(f'{ad}: soru aralığı geçersiz.')
    secenekler = _etiket_listesi(raw.get('secenekler') or [], ad)
    if not secenekler:
        secenekler = list('ABCDE')
    fiziksel = raw.get('fiziksel_sira') or []
    if fiziksel:
        if not isinstance(fiziksel, list) or len(fiziksel) != sayi:
            raise ValueError(f'{ad}: fiziksel soru sırası soru sayısıyla aynı olmalıdır.')
        try:
            fiziksel = [int(item) for item in fiziksel]
        except (TypeError, ValueError):
            raise ValueError(f'{ad}: fiziksel soru sırası tam sayı olmalıdır.')
        if len(set(fiziksel)) != len(fiziksel):
            raise ValueError(f'{ad}: fiziksel soru sırası tekrar edemez.')
    return {
        'bolum_id': str(raw.get('bolum_id') or '')[:40],
        'soru_baslangic': baslangic,
        'soru_sayisi': sayi,
        'secenekler': secenekler,
        'fiziksel_sira': fiziksel,
        'coklu_isaret': bool(raw.get('coklu_isaret', False)),
    }


def _alan(raw, index: int, page_w: float, page_h: float) -> dict:
    if not isinstance(raw, dict):
        raise ValueError(f'{index}. alan geçersiz.')
    ad = (raw.get('ad') or '').strip()
    if not ad or len(ad) > 80:
        raise ValueError(f'{index}. alanın adı zorunludur.')
    tur = (raw.get('tur') or TUR_DAIRE).strip()
    if tur not in TURLER:
        raise ValueError(f'{ad}: alan türü tanınmıyor.')
    veri = (raw.get('veri_kaynagi') or '').strip()
    bilinen = {kod for kod, _etiket, _kaynak in VERI_KAYNAKLARI}
    if veri and veri not in bilinen:
        raise ValueError(f'{ad}: veri kaynağı tanınmıyor.')
    sabit = (raw.get('sabit_deger') or '').strip()
    if len(sabit) > 80:
        raise ValueError(f'{ad}: sabit değer çok uzun.')
    yon = (raw.get('kodlama_yonu') or YON_SATIR).strip()
    if yon not in YONLER:
        raise ValueError(f'{ad}: kodlama yönü geçersiz.')
    hiza = (raw.get('hizalama') or 'sol').strip()
    if hiza not in ('sol', 'orta', 'sag'):
        raise ValueError(f'{ad}: hizalama geçersiz.')
    kod_hiza = (raw.get('kod_hizasi') or 'sol').strip()
    if kod_hiza not in ('sol', 'sag'):
        raise ValueError(f'{ad}: kod hizası sol veya sağ olmalıdır.')
    try:
        satir = int(raw.get('satir') if raw.get('satir') not in (None, '') else 1)
        sutun = int(raw.get('sutun') if raw.get('sutun') not in (None, '') else 1)
    except (TypeError, ValueError):
        raise ValueError(f'{ad}: satır ve sütun sayı olmalıdır.')
    if tur == TUR_METIN:
        satir, sutun = 1, 1
    if satir < 1 or sutun < 1 or satir > 80 or sutun > 80:
        raise ValueError(f'{ad}: satır ve sütun 1 ile 80 arasında olmalıdır.')
    x_mm = _num(raw.get('x_mm', 0), f'{ad} X')
    y_mm = _num(raw.get('y_mm', 0), f'{ad} Y')
    cap = _num(raw.get('cap_mm', 3.2), f'{ad} çap')
    isaret_cap = _num(
        raw.get('isaret_cap_mm', round(float(cap) * 0.68, 2)),
        f'{ad} baskı işareti çapı',
    )
    aralik_x = _num(raw.get('aralik_x_mm', 4.5), f'{ad} yatay aralık', '0.001')
    aralik_y = _num(raw.get('aralik_y_mm', 4.5), f'{ad} dikey aralık', '0.001')
    if x_mm < 0 or y_mm < 0 or x_mm > page_w or y_mm > page_h:
        raise ValueError(f'{ad}: başlangıç sayfa içinde olmalıdır.')
    if tur != TUR_METIN:
        if cap < 0.8 or cap > 15:
            raise ValueError(f'{ad}: daire çapı 0,8 ile 15 mm arasında olmalıdır.')
        if isaret_cap < 0.4 or isaret_cap > cap:
            raise ValueError(f'{ad}: baskı işareti çapı 0,4 mm ile daire çapı arasında olmalıdır.')
        if aralik_x < 0.8 or aralik_y < 0.8 or aralik_x > 40 or aralik_y > 40:
            raise ValueError(f'{ad}: daire aralığı 0,8 ile 40 mm arasında olmalıdır.')
    else:
        cap = 0
        isaret_cap = 0
        aralik_x = 0
        aralik_y = 0
    punto = _num(raw.get('punto', 8), f'{ad} punto', '0.1')
    if punto < 5 or punto > 18:
        raise ValueError(f'{ad}: punto 5 ile 18 arasında olmalıdır.')
    genislik = _num(raw.get('genislik_mm', 40), f'{ad} genişlik')
    yukseklik = _num(raw.get('yukseklik_mm', 6), f'{ad} yükseklik')
    if genislik <= 0 or genislik > page_w:
        raise ValueError(f'{ad}: genişlik geçersiz.')
    if yukseklik <= 0 or yukseklik > page_h:
        raise ValueError(f'{ad} yükseklik geçersiz.')
    aralik_harf = _num(raw.get('karakter_araligi', 0), f'{ad} karakter aralığı')
    if aralik_harf < -1 or aralik_harf > 6:
        raise ValueError(f'{ad}: karakter aralığı -1 ile 6 punto arasında olmalıdır.')
    iz_satir = raw.get('iz_satir')
    if iz_satir in (None, ''):
        iz_satir = None
    else:
        try:
            iz_satir = int(iz_satir)
        except (TypeError, ValueError):
            raise ValueError(f'{ad}: iz satırı sayı olmalıdır.')
        if iz_satir < 0 or iz_satir > 200:
            raise ValueError(f'{ad}: iz satırı geçersiz.')
    iz_satirlar = raw.get('iz_satirlar') or []
    if iz_satirlar:
        if not isinstance(iz_satirlar, list) or len(iz_satirlar) != satir:
            raise ValueError(f'{ad}: açık iz satır haritası satır sayısıyla aynı olmalıdır.')
        try:
            iz_satirlar = [int(item) for item in iz_satirlar]
        except (TypeError, ValueError):
            raise ValueError(f'{ad}: iz satır haritası tam sayı olmalıdır.')
        if any(item < 0 or item > 200 for item in iz_satirlar):
            raise ValueError(f'{ad}: iz satır haritası geçersiz.')
    alan_id = (raw.get('id') or '').strip() or uuid.uuid4().hex[:12]
    if len(alan_id) > 40:
        raise ValueError(f'{ad}: kimlik çok uzun.')
    karakter = sutun if yon == YON_SUTUN else satir
    cevap_bloku = _cevap_bloku(raw.get('cevap_bloku'), ad, karakter) if tur == TUR_CEVAP else None
    if cevap_bloku:
        if cevap_bloku['soru_sayisi'] != karakter:
            raise ValueError(f'{ad}: soru sayısı karakter ekseniyle ({karakter}) aynı olmalıdır.')
        secenek_sayisi = satir if yon == YON_SUTUN else sutun
        if len(cevap_bloku['secenekler']) != secenek_sayisi:
            raise ValueError(f'{ad}: seçenek sayısı sembol ekseniyle ({secenek_sayisi}) aynı olmalıdır.')
    sayfa_no = int(raw.get('sayfa_no') or 1)
    if sayfa_no < 1 or sayfa_no > 999:
        raise ValueError(f'{ad}: sayfa numarası geçersiz.')
    labels = _etiket_listesi(raw.get('etiketler'), ad)
    sembol_adedi = satir if yon == YON_SUTUN else sutun
    tek_harf = len(labels) == sembol_adedi and all(len(tr_upper(item)) == 1 for item in labels)
    if tur == TUR_DAIRE and veri in AD_KAYNAKLARI and sembol_adedi == len(HARFLER) and not tek_harf:
        labels = list(HARFLER)
    result = {
        'id': alan_id,
        'ad': ad,
        'tur': tur,
        'veri_kaynagi': veri,
        'sabit_deger': sabit,
        'aktif': bool(raw.get('aktif', True)),
        'x_mm': x_mm,
        'y_mm': y_mm,
        'satir': satir,
        'sutun': sutun,
        'cap_mm': cap,
        'isaret_cap_mm': isaret_cap,
        'aralik_x_mm': aralik_x,
        'aralik_y_mm': aralik_y,
        'kodlama_yonu': yon,
        'kod_hizasi': kod_hiza,
        'etiketler': labels,
        'punto': punto,
        'hizalama': hiza,
        'genislik_mm': genislik,
        'yukseklik_mm': yukseklik,
        'karakter_araligi': aralik_harf,
        'iz_satir': iz_satir,
        'iz_id': str(raw.get('iz_id') or '')[:40],
        'iz_satirlar': iz_satirlar,
        'sayfa_no': sayfa_no,
        'cevap_bloku': cevap_bloku,
        'metin_kutusu': None if tur == TUR_METIN else _metin_kutusu(raw.get('metin_kutusu'), ad, page_w, page_h),
    }
    if tur == TUR_METIN:
        if x_mm + genislik > page_w or y_mm + yukseklik > page_h:
            raise ValueError(f'{ad}: metin kutusunun tamamı sayfa içinde olmalıdır.')
    else:
        radius = cap / 2
        max_x = x_mm + (sutun - 1) * aralik_x + radius
        max_y = y_mm + (satir - 1) * aralik_y + radius
        if x_mm - radius < 0 or y_mm - radius < 0 or max_x > page_w or max_y > page_h:
            raise ValueError(f'{ad}: daire dizisinin tamamı sayfa içinde olmalıdır.')
    return result


def alan_izi(belge: dict, alan: dict) -> dict | None:
    """Alan için açıkça seçilen izi; yoksa eski tek `iz` kaydını döndürür."""
    iz_id = alan.get('iz_id')
    izler = belge.get('izler') or []
    if iz_id:
        for iz in izler:
            if iz.get('id') == iz_id:
                return iz
        return None
    return belge.get('iz') or (izler[0] if len(izler) == 1 else None)


def baskiya_hazir_hatalari(belge: dict, page_w: float, page_h: float) -> list[str]:
    """Kaydedilen geometriyi baskı ve OMR için son kez eksiksiz denetler."""
    errors = []
    iz_ids = {iz.get('id') for iz in (belge.get('izler') or [])}
    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True):
            continue
        errors.extend(geometri_hatalari(alan))
        ad = alan.get('ad') or 'Alan'
        if alan.get('iz_id') and alan.get('iz_id') not in iz_ids:
            errors.append(f'{ad}: seçilen zaman izi bulunamadı.')
        iz = alan_izi(belge, alan)
        rows = int(alan.get('satir') or 1)
        if iz and (alan.get('iz_satir') is not None or alan.get('iz_satirlar')):
            ys = iz.get('satirlar_mm') or []
            indices = alan.get('iz_satirlar') or [
                int(alan.get('iz_satir') or 0) + row for row in range(rows)
            ]
            if any(index < 0 or index >= len(ys) for index in indices):
                errors.append(f'{ad}: zaman izi bu alanın tüm satırlarını kapsamıyor.')
                continue
            radius = float(alan.get('cap_mm') or 0) / 2
            if any(float(ys[index]) - radius < 0 or float(ys[index]) + radius > page_h for index in indices):
                errors.append(f'{ad}: zaman izine hizalanan daireler sayfa dışına taşıyor.')
        if (alan.get('metin_kutusu') or {}).get('aktif'):
            for box in kutu_dilimleri(alan, '', iz):
                if (
                    float(box['x_mm']) < 0
                    or float(box['y_mm']) < 0
                    or float(box['x_mm']) + float(box['genislik_mm']) > page_w
                    or float(box['y_mm']) + float(box['yukseklik_mm']) > page_h
                ):
                    errors.append(f'{ad}: metin kutusu sayfa dışına taşıyor.')
                    break
        if alan.get('tur') == TUR_METIN:
            if float(alan['x_mm']) + float(alan['genislik_mm']) > page_w:
                errors.append(f'{ad}: metin alanı sağ kenardan taşıyor.')
            if float(alan['y_mm']) + float(alan['yukseklik_mm']) > page_h:
                errors.append(f'{ad}: metin alanı alt kenardan taşıyor.')
    return list(dict.fromkeys(errors))


def _fmt_kaydi(raw):
    """FMT okumasının ızgara kökeni. Alan koordinatları ayrıca durur."""
    if not isinstance(raw, dict):
        return None
    try:
        satir = int(raw.get('satir') or 0)
        sutun = int(raw.get('sutun') or 0)
    except (TypeError, ValueError):
        return None
    if satir < 1 or sutun < 1 or satir > 200 or sutun > 200:
        return None
    try:
        kayit = {
            'dosya': str(raw.get('dosya') or '')[:120],
            'satir': satir,
            'sutun': sutun,
            'x0_mm': _num(raw.get('x0_mm', 0), 'FMT X', '0.001'),
            'y0_mm': _num(raw.get('y0_mm', 0), 'FMT Y', '0.001'),
            'aralik_x_mm': _num(raw.get('aralik_x_mm', 4.3), 'FMT yatay', '0.001'),
            'aralik_y_mm': _num(raw.get('aralik_y_mm', 4.3), 'FMT dikey', '0.001'),
            'cap_mm': _num(raw.get('cap_mm', 3.2), 'FMT çap'),
            'bagli': str(raw.get('bagli') or '')[:80],
        }
    except ValueError:
        return None
    metin = raw.get('metin')
    if isinstance(metin, str) and metin.strip() and len(metin) <= 8000:
        kayit['metin'] = metin.replace('\x00', '')
    return kayit


def _sayfalar(raw, page_w: float, page_h: float) -> list[dict]:
    if raw in (None, ''):
        return []
    if not isinstance(raw, list) or len(raw) > 100:
        raise ValueError('Sayfa yerleşimleri geçersiz.')
    out = []
    seen = set()
    for index, page in enumerate(raw, start=1):
        if not isinstance(page, dict):
            raise ValueError(f'{index}. sayfa yerleşimi geçersiz.')
        number = int(page.get('sayfa_no') or index)
        if number < 1 or number in seen:
            raise ValueError('Sayfa yerleşimi numaraları benzersiz ve pozitif olmalıdır.')
        seen.add(number)
        width = _num(page.get('genislik_mm', page_w), f'{number}. sayfa genişliği')
        height = _num(page.get('yukseklik_mm', page_h), f'{number}. sayfa yüksekliği')
        alanlar = page.get('alanlar') or []
        if not isinstance(alanlar, list) or len(alanlar) > 80:
            raise ValueError(f'{number}. sayfanın alan listesi geçersiz.')
        legacy_iz = _iz(page.get('iz'))
        tracks = _izler(page.get('izler'))
        out.append({
            'sayfa_no': number,
            'genislik_mm': width,
            'yukseklik_mm': height,
            'iz': legacy_iz,
            'izler': tracks,
            'alanlar': [_alan(item, pos, width, height) for pos, item in enumerate(alanlar, 1)],
        })
    return out


def belge_dogrula(raw, page_w: float, page_h: float) -> tuple[dict, list[str]]:
    """Kayıt için belgeyi temizler. Geometri tür uyarıları kaydı engellemez."""
    if not isinstance(raw, dict):
        raise ValueError('Belge geçersiz.')
    surum = (raw.get('surum') or SURUM).strip()
    if surum != SURUM:
        raise ValueError('Bu şablon daire dizisi düzenleyicisine ait değil.')
    alanlar_raw = raw.get('alanlar')
    if alanlar_raw is None:
        alanlar_raw = []
    if not isinstance(alanlar_raw, list):
        raise ValueError('Alan listesi geçersiz.')
    if len(alanlar_raw) > 80:
        raise ValueError('En fazla 80 alan tanımlanabilir.')
    alanlar = [_alan(row, i, page_w, page_h) for i, row in enumerate(alanlar_raw, start=1)]
    seen = set()
    for alan in alanlar:
        if alan['id'] in seen:
            alan['id'] = uuid.uuid4().hex[:12]
        seen.add(alan['id'])
    belge = {
        'surum': SURUM,
        'kalibrasyon': _kalibrasyon(raw.get('kalibrasyon')),
        'iz': _iz(raw.get('iz')),
        'izler': _izler(raw.get('izler')),
        'alanlar': alanlar,
        'sayfalar': _sayfalar(raw.get('sayfalar'), page_w, page_h),
    }
    fmt = _fmt_kaydi(raw.get('fmt'))
    if fmt:
        belge['fmt'] = fmt
    hatalar = baskiya_hazir_hatalari(belge, page_w, page_h)
    if hatalar:
        raise ValueError(' '.join(hatalar))
    return belge, []


def alan_degeri(alan: dict, values: dict) -> str:
    if alan.get('veri_kaynagi'):
        raw = values.get(alan['veri_kaynagi'])
        return '' if raw is None else str(raw)
    return alan.get('sabit_deger') or ''


def kutu_kapasite(alan: dict, kutu: dict) -> int:
    yon = (kutu or {}).get('yon') or 'ust'
    if yon in ('ust', 'alt'):
        return int(alan.get('sutun') or 1)
    return int(alan.get('satir') or 1)


def _kutu_karakter_ekseninde(alan: dict, kutu: dict) -> bool:
    """Şerit, karakter sırasıyla aynı eksendeyse rakamlar daireyle hizalanır."""
    yon = (kutu or {}).get('yon') or 'ust'
    sutun_karakter = (alan.get('kodlama_yonu') or YON_SATIR) == YON_SUTUN
    if yon in ('ust', 'alt'):
        return sutun_karakter
    return not sutun_karakter


def kutu_metni(alan: dict, values: dict) -> str:
    """Kutuya basılacak ad veya rakam.

    Kutunun kendi kaynağı yoksa dizinin kaynağı kullanılır. Sayı, karakter
    kutularında dairedeki hizayla aynı yere oturur.
    """
    kutu = alan.get('metin_kutusu') or {}
    if kutu.get('veri_kaynagi') or (kutu.get('sabit_deger') or '').strip():
        kaynak = kutu.get('veri_kaynagi') or ''
        text = alan_degeri(kutu, values)
    else:
        kaynak = alan.get('veri_kaynagi') or ''
        text = alan_degeri(alan, values)
    slots = kutu_kapasite(alan, kutu)
    if kaynak == 'ad_soyad':
        return ad_soyad_sigdir(text, slots)
    raw = (text or '').strip()
    if (
        alan.get('tur') in SAYISAL_TURLER
        and raw.isdigit()
        and _kutu_karakter_ekseninde(alan, kutu)
        and len(raw) <= slots
    ):
        pad = ' ' * (slots - len(raw))
        if (alan.get('kod_hizasi') or 'sol') == 'sag':
            return pad + raw
        return raw + pad
    return text or ''
