"""Daire Dizisi şablonuyla doldurulmuş sayfa okuma.

Çıktı yalnız staging kaydıdır; bu servis StudentAnswer oluşturmaz.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

from .daire_dizisi_detect import izleri_algila
from .daire_dizisi_schema import (
    TUR_CEVAP,
    TUR_KITAPCIK,
    TUR_METIN,
    TUR_TC,
    etiketler,
    satir_y,
)
from .daire_dizisi_tarama import _kayit

PX_PER_MM = 10


def _deps():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise ValueError('OMR için OpenCV ve NumPy kurulmalıdır.') from exc
    return cv2, np


def _page_warp(png: bytes, width_mm: float, height_mm: float):
    cv2, np = _deps()
    image = ImageOps.exif_transpose(Image.open(BytesIO(png))).convert('RGB')
    rgb = np.asarray(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    target_w = max(1, int(round(width_mm * PX_PER_MM)))
    target_h = max(1, int(round(height_mm * PX_PER_MM)))

    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 45, 140)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    page_area = gray.shape[0] * gray.shape[1]
    quad = None
    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:12]:
        if cv2.contourArea(contour) < page_area * 0.35:
            continue
        perimeter = cv2.arcLength(contour, True)
        candidate = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(candidate) == 4:
            c_cand = candidate.reshape(4, 2).astype('float32')
            # Tarama çıktısında veya optik formda iç çerçeve yakalanırsa kâğıt kenarını ve
            # sol zamanlama izlerini kesmemek için quad yok sayılır.
            min_x = float(np.min(c_cand[:, 0]))
            min_y = float(np.min(c_cand[:, 1]))
            border_white = (
                np.mean(gray[:, :max(1, int(gray.shape[1] * 0.02))]) > 170
                and np.mean(gray[:max(1, int(gray.shape[0] * 0.02)), :]) > 170
            )
            if border_white or min_x > gray.shape[1] * 0.03 or min_y > gray.shape[0] * 0.03:
                break
            quad = c_cand
            break

    registration = {'method': 'page_resize', 'confidence': 0.72}
    if quad is None:
        warped = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_AREA)
    else:
        sums = quad.sum(axis=1)
        diffs = np.diff(quad, axis=1).reshape(-1)
        ordered = np.array([
            quad[sums.argmin()],
            quad[diffs.argmin()],
            quad[sums.argmax()],
            quad[diffs.argmax()],
        ], dtype='float32')
        destination = np.array([
            [0, 0], [target_w - 1, 0],
            [target_w - 1, target_h - 1], [0, target_h - 1],
        ], dtype='float32')
        matrix = cv2.getPerspectiveTransform(ordered, destination)
        warped = cv2.warpPerspective(gray, matrix, (target_w, target_h), borderValue=255)
        registration = {
            'method': 'page_homography',
            'confidence': 0.92,
            'matrix': matrix.round(7).tolist(),
            'corners_px': quad.round(2).tolist(),
        }
    return warped, registration


def _cell_score(gray, x_mm: float, y_mm: float, cap_mm: float) -> float:
    _cv2, np = _deps()
    cx = int(round(x_mm * PX_PER_MM))
    cy = int(round(y_mm * PX_PER_MM))
    radius = max(3, int(round(cap_mm * PX_PER_MM / 2)))
    outer = max(radius + 3, int(round(radius * 1.5)))
    y0, y1 = max(0, cy - outer), min(gray.shape[0], cy + outer + 1)
    x0, x1 = max(0, cx - outer), min(gray.shape[1], cx + outer + 1)
    patch = gray[y0:y1, x0:x1]
    if patch.size == 0:
        return 0.0
    yy, xx = np.ogrid[y0 - cy:y1 - cy, x0 - cx:x1 - cx]
    distance = xx * xx + yy * yy
    inner_mask = distance <= (radius * 0.65) ** 2
    ring_mask = (distance >= (radius * 1.05) ** 2) & (distance <= (outer * 0.95) ** 2)
    if not inner_mask.any() or not ring_mask.any():
        return 0.0
    inner_vals = patch[inner_mask]
    top_half = patch[inner_mask & (yy < 0)]
    bot_half = patch[inner_mask & (yy > 0)]
    if top_half.size > 0 and bot_half.size > 0:
        asym = abs(float(np.mean(top_half)) - float(np.mean(bot_half)))
        # Kutu alt/üst çizgilerinin dairenin kenarına taşmasını filtrele
        if asym > 75 and (np.mean(top_half) > 190 or np.mean(bot_half) > 190):
            return 0.0
    inner = float(np.median(inner_vals))
    background = float(np.percentile(patch[ring_mask], 70))
    absolute_darkness = (255.0 - inner) / 255.0
    contrast = max(0.0, background - inner) / 255.0
    return round(min(1.0, contrast * 0.72 + absolute_darkness * 0.28), 4)


def _iz_kaydi(gray, belge: dict, width_mm: float, height_mm: float):
    """Şablon izini taramadaki ize çeker. (a, b, dx): form = a·tarama + b, x kayması dx."""
    iz = belge.get('iz') or {}
    if not iz.get('satirlar_mm'):
        return None
    found = izleri_algila(Image.fromarray(gray), width_mm, height_mm)
    if not found:
        return None
    try:
        return _kayit(iz, found)
    except ValueError:
        return None


def _tara_nokta(x_mm: float, y_mm: float, kayit) -> tuple[float, float]:
    if not kayit:
        return x_mm, y_mm
    a, b, dx = kayit
    if not a:
        return x_mm, y_mm
    return x_mm - dx, (y_mm - b) / a


def _resolve_cells(gray, belge: dict, alan: dict, kayit=None):
    cells = []
    for row in range(int(alan['satir'])):
        y = satir_y(alan, row, None)
        for col in range(int(alan['sutun'])):
            x = float(alan['x_mm']) + col * float(alan['aralik_x_mm'])
            sx, sy = _tara_nokta(x, y, kayit)
            cells.append({
                'satir': row,
                'sutun': col,
                'x_mm': round(x, 3),
                'y_mm': round(y, 3),
                'score': _cell_score(gray, sx, sy, float(alan['cap_mm'])),
            })
    return cells


def _decode_field(alan: dict, cells: list[dict]):
    labels = etiketler(alan)
    row_character = (alan.get('kodlama_yonu') or 'satir_karakter') == 'satir_karakter'
    character_count = int(alan['satir'] if row_character else alan['sutun'])
    symbol_count = int(alan['sutun'] if row_character else alan['satir'])
    if len(labels) != symbol_count:
        return '', [], [f"{alan.get('ad')}: seçenek sayısı geometriyle uyuşmuyor."], 0.0

    decoded = []
    states = []
    warnings = []
    confidences = []
    for char_index in range(character_count):
        options = []
        for symbol_index, label in enumerate(labels):
            row, col = (char_index, symbol_index) if row_character else (symbol_index, char_index)
            cell = next(item for item in cells if item['satir'] == row and item['sutun'] == col)
            options.append((cell['score'], label, cell))
        options.sort(reverse=True, key=lambda item: item[0])
        best = options[0]
        second = options[1] if len(options) > 1 else (0.0, '', {})
        jump = best[0] - second[0]
        # Soru içindeki sıçrama: en koyu daire ile sonrakinin farkı.
        # Sabit eşik açık kalem ve gölgede kırılır.
        dark = [item for item in options if item[0] >= 0.16 and item[0] >= best[0] - 0.05]
        coklu = bool((alan.get('cevap_bloku') or {}).get('coklu_isaret'))
        confidence = max(0.0, min(1.0, (best[0] - 0.12) / 0.28)) * max(0.0, min(1.0, jump / 0.1))
        if best[0] < 0.14:
            value, state = '', 'blank'
            if best[0] <= 0.10:
                confidence = 0.98
            else:
                confidence = max(0.40, 0.98 - ((best[0] - 0.10) / 0.04) * 0.45)
        elif len(dark) > 1 and jump < 0.08 and not coklu:
            value, state = '', 'multiple'
            confidence = max(0.20, min(0.60, jump / 0.08))
            warnings.append(f"{alan.get('ad')}: {char_index + 1}. sırada birden fazla işaret var.")
        elif jump < 0.07 and best[0] >= 0.16:
            value, state = '', 'ambiguous'
            confidence = max(0.25, min(0.55, jump / 0.07))
            warnings.append(f"{alan.get('ad')}: {char_index + 1}. sıra kararsız.")
        elif coklu and len(dark) > 1:
            value = ','.join(item[1] for item in reversed(dark))
            state = 'marked'
            confidence = max(0.65, min(1.0, (best[0] - 0.12) / 0.28))
        elif best[0] >= 0.16 and jump >= 0.07:
            value, state = best[1], 'marked'
            confidence = max(0.70, min(1.0, (best[0] - 0.12) / 0.28)) * max(0.70, min(1.0, jump / 0.1))
        else:
            value, state = '', 'blank'
            confidence = max(0.40, min(0.85, (0.16 - best[0]) / 0.16))
        decoded.append(value)
        states.append({
            'index': char_index,
            'value': value,
            'state': state,
            'confidence': round(confidence, 4),
            'candidates': [{'label': item[1], 'score': item[0]} for item in options],
        })
        confidences.append(confidence)
    return ''.join(decoded), states, warnings, (sum(confidences) / len(confidences) if confidences else 0.0)


def omr_oku(png: bytes, belge: dict, width_mm: float, height_mm: float) -> dict:
    """Bir raster sayfayı şablona kaydedip alanları güven puanıyla çözer."""
    gray, registration = _page_warp(png, width_mm, height_mm)
    kayit = _iz_kaydi(gray, belge, width_mm, height_mm)
    if kayit:
        registration = {
            'method': 'timing_track',
            'confidence': 0.97,
            'a': round(kayit[0], 5),
            'b': round(kayit[1], 3),
            'dx': round(kayit[2], 3),
            'page': registration,
        }
    elif (belge.get('iz') or {}).get('satirlar_mm'):
        registration = {**registration, 'confidence': min(float(registration['confidence']), 0.6)}
    decoded = {'alanlar': {}, 'cevaplar': {}}
    overlays = []
    warnings = []
    critical = []
    confidences = [float(registration['confidence'])]

    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True) or alan.get('tur') == TUR_METIN:
            continue
        cells = _resolve_cells(gray, belge, alan, kayit)
        value, states, field_warnings, confidence = _decode_field(alan, cells)
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
        if alan.get('tur') == TUR_CEVAP:
            meta = alan.get('cevap_bloku') or {}
            physical = meta.get('fiziksel_sira') or list(range(
                int(meta.get('soru_baslangic') or 1),
                int(meta.get('soru_baslangic') or 1) + int(meta.get('soru_sayisi') or len(states)),
            ))
            for index, state in enumerate(states):
                decoded['cevaplar'][str(physical[index])] = state['value']
        if alan.get('tur') == TUR_KITAPCIK:
            decoded['kitapcik'] = value
        overlays.extend([{**cell, 'alan_id': alan['id']} for cell in cells])
        warnings.extend(field_warnings)
        # Opsiyonel demografik alanlar (öğrencinin boş bıraktığı Okul Kodu, Sınıf, Şube, Oturum No, Alan vb.)
        # doldurulmadığında kritik hata üretmemeli ve genel sayfa güvenini düşürmemelidir.
        is_optional = alan.get('tur') not in (TUR_CEVAP, TUR_KITAPCIK, TUR_TC) and alan.get('veri_kaynagi') not in ('tc', 'ad_soyad', 'ogrenci_no')
        if not (is_optional and not value):
            confidences.append(confidence)
            if confidence < 0.35:
                critical.append(f"{alan.get('ad')}: güven çok düşük.")

    if registration['confidence'] < 0.65:
        critical.append('Sayfa şablona güvenilir biçimde kaydedilemedi.')
    if (belge.get('iz') or {}).get('satirlar_mm') and not kayit:
        critical.append('Sol iz taramada bulunamadı. Sayfa şablon milimetresine göre okundu.')
    return {
        'registration': registration,
        'decoded': decoded,
        'overlay': overlays,
        'confidence': round(sum(confidences) / len(confidences), 4),
        'warnings': list(dict.fromkeys(warnings)),
        'critical_warnings': list(dict.fromkeys(critical)),
    }
