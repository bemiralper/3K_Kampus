"""Basılmış ve taranmış formdan yazıcı kalibrasyonu.

Tarama, formun sol zaman izleriyle şablon görseline oturtulur. Her siyah
işaretin basılması istenen yer ile kâğıtta düştüğü yer karşılaştırılır.
Yazıcının eksen başına ölçek ve kaymasından yeni kalibrasyon önerilir.
Şablon geometrisi değişmez; sonuç yalnız öneridir.
"""
from __future__ import annotations

from io import BytesIO
from statistics import median

from PIL import Image, ImageChops, ImageOps

from .daire_dizisi_detect import izleri_algila
from .daire_dizisi_raster import _gorsel_mm, pdf_sayfa_mm, raster_pdf
from .daire_dizisi_schema import TUR_METIN, kalibrasyon_uygula, satir_y

_KUCULT = 2


def tarama_oku(raw: bytes) -> tuple[Image.Image, float, float]:
    """Taramayı tam çözünürlükte açar. PDF'te en büyük gömülü görsel alınır."""
    if raw.startswith(b'%PDF'):
        width_mm, height_mm, _count = pdf_sayfa_mm(raw, 1)
        raster = raster_pdf(raw, 1)
        image = Image.open(BytesIO(raster['png']))
        image.load()
        return image.convert('RGB'), width_mm, height_mm
    image = ImageOps.exif_transpose(Image.open(BytesIO(raw)))
    image.load()
    width_mm, height_mm, _uyari = _gorsel_mm(image)
    return image.convert('RGB'), width_mm, height_mm


def _kayit(iz_form: dict, iz_tarama: dict) -> tuple[float, float, float]:
    """Tarama mm -> form mm. y = a*y + b, x = x + dx."""
    form = iz_form['satirlar_mm']
    tarama = iz_tarama['satirlar_mm']
    yarim = iz_form['aralik_mm'] / 2

    # Düzenli ızgara kayma korelasyonu: üstten veya alttan kaçan izler satırları kaydırmasın
    best_pairs = []
    best_score = 1e9
    for s in range(-4, 5):
        cand = []
        diffs = []
        for i, ty in enumerate(tarama):
            fi = i + s
            if 0 <= fi < len(form):
                fy = form[fi]
                d = abs(ty - fy)
                if d < yarim * 1.2:
                    cand.append((ty, fy))
                    diffs.append(d)
        if len(cand) >= 12:
            med_diff = sorted(diffs)[len(diffs) // 2]
            score = med_diff - (len(cand) / len(form)) * 0.5
            if score < best_score:
                best_score = score
                best_pairs = cand

    if len(best_pairs) >= 8:
        pairs = best_pairs
    else:
        pairs = []
        for y in tarama:
            near = min(form, key=lambda v: abs(v - y))
            if abs(near - y) < yarim:
                pairs.append((y, near))
    if len(pairs) < 8:
        raise ValueError('Taramadaki sol izler şablonla eşleşmedi.')
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    sxx = sum((p[0] - mx) ** 2 for p in pairs)
    a = sum((p[0] - mx) * (p[1] - my) for p in pairs) / sxx if sxx else 1.0
    b = my - a * mx
    left_form = float(iz_form['x_mm']) - float(iz_form.get('genislik_mm') or 0.0)
    left_tarama = float(iz_tarama['x_mm']) - float(iz_tarama.get('genislik_mm') or 0.0)
    if left_form > 0 and left_tarama > 0 and abs(left_form - left_tarama) < 15:
        dx = left_form - left_tarama
    else:
        dx = float(iz_form['x_mm']) - float(iz_tarama['x_mm'])
        if abs(dx) > 15:
            dx = 0.0
    return a, b, dx


def _lekeler(image: Image.Image, kutu_mm, px_mm: float, cap_mm: float) -> list[tuple[float, float]]:
    """Gri/siyah, yuvarlak dolgular. Pembe form baskısı doygun olduğu için elenir."""
    x0, y0, x1, y1 = (int(round(v * px_mm)) for v in kutu_mm)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(image.width, x1), min(image.height, y1)
    if x1 - x0 < 10 or y1 - y0 < 10:
        return []
    hue, sat, val = image.crop((x0, y0, x1, y1)).convert('HSV').split()
    del hue
    koyu = val.point(lambda p: 255 if p < 150 else 0)
    gri = sat.point(lambda p: 255 if p < 90 else 0)
    mask = ImageChops.multiply(koyu, gri)
    mask = mask.reduce(_KUCULT).point(lambda p: 1 if p >= 128 else 0)
    width, height = mask.size
    data = bytearray(mask.tobytes())
    birim = px_mm / _KUCULT
    beklenen = cap_mm * 0.75 * birim
    out = []
    for start in range(width * height):
        if not data[start]:
            continue
        data[start] = 0
        stack = [start]
        sx = sy = count = 0
        minx = maxx = start % width
        miny = maxy = start // width
        while stack:
            idx = stack.pop()
            px, py = idx % width, idx // width
            sx += px
            sy += py
            count += 1
            minx, maxx = min(minx, px), max(maxx, px)
            miny, maxy = min(miny, py), max(maxy, py)
            for nxt in (idx - 1, idx + 1, idx - width, idx + width):
                if 0 <= nxt < width * height and data[nxt]:
                    if abs((nxt % width) - px) > 1:
                        continue
                    data[nxt] = 0
                    stack.append(nxt)
        w = maxx - minx + 1
        h = maxy - miny + 1
        if not (0.6 * beklenen <= w <= 1.6 * beklenen and 0.6 * beklenen <= h <= 1.6 * beklenen):
            continue
        if not 0.7 <= w / h <= 1.4:
            continue
        doluluk = count / (w * h)
        if not 0.55 <= doluluk <= 0.92:
            continue
        cx = (sx / count + 0.5) / birim + x0 / px_mm
        cy = (sy / count + 0.5) / birim + y0 / px_mm
        out.append((cx, cy))
    return out


def _hucreler(belge: dict) -> tuple[list[dict], float]:
    """Kodlanan her dairenin istenen yeri (p) ve baskıya gönderilen yeri (q)."""
    kalibrasyon = belge.get('kalibrasyon') or {}
    iz = belge.get('iz')
    out = []
    caps = []
    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True) or alan.get('tur') == TUR_METIN:
            continue
        caps.append(float(alan['cap_mm']))
        x0 = float(alan['x_mm'])
        ax = float(alan['aralik_x_mm'])
        for row in range(int(alan['satir'])):
            y = satir_y(alan, row, iz)
            for col in range(int(alan['sutun'])):
                x = x0 + col * ax
                qx, qy = kalibrasyon_uygula(x, y, kalibrasyon)
                out.append({'p': (x, y), 'q': (qx, qy)})
    cap = median(caps) if caps else 3.2
    return out, cap * float(kalibrasyon.get('olcek') or 1)


def _eksen(qs: list[float], inks: list[float]) -> tuple[float, float]:
    n = len(qs)
    mq = sum(qs) / n
    mi = sum(inks) / n
    sqq = sum((q - mq) ** 2 for q in qs)
    if sqq < 1e-6:
        return 1.0, mi - mq
    s = sum((q - mq) * (i - mi) for q, i in zip(qs, inks)) / sqq
    return s, mi - s * mq


def _adaylar(lekeler, hucreler, pencere=8.0):
    out = []
    for lx, ly in lekeler:
        near = [h for h in hucreler if abs(h['q'][0] - lx) < pencere and abs(h['q'][1] - ly) < pencere]
        out.append(((lx, ly), near))
    return out


def _eslestir(adaylar, model, tol):
    sx, ox, sy, oy = model
    pairs = []
    for (lx, ly), near in adaylar:
        best = None
        for hucre in near:
            qx, qy = hucre['q']
            d = ((sx * qx + ox - lx) ** 2 + (sy * qy + oy - ly) ** 2) ** 0.5
            if best is None or d < best[0]:
                best = (d, hucre)
        if best and best[0] <= tol:
            pairs.append((best[1], (lx, ly)))
    return pairs


def tarama_kalibrasyon(raw: bytes, belge: dict, form_w_mm: float, form_h_mm: float) -> dict:
    iz_form = belge.get('iz')
    if not iz_form or not iz_form.get('satirlar_mm'):
        raise ValueError('Önce “Sol ize hizala” ile şablonun sol izlerini ölçün.')
    image, scan_w, scan_h = tarama_oku(raw)
    if abs(scan_w - form_w_mm) > 6 or abs(scan_h - form_h_mm) > 6:
        raise ValueError('Tarama A4 sayfanın tamamı olmalı. Kenarları kırpmadan tarayın.')
    iz_tarama = izleri_algila(image, scan_w, scan_h)
    if not iz_tarama:
        raise ValueError('Taramada sol kenardaki siyah izler bulunamadı. Formun düz ve tam tarandığından emin olun.')
    a, b, dx = _kayit(iz_form, iz_tarama)
    px_mm = image.width / scan_w

    hucreler, cap = _hucreler(belge)
    if not hucreler:
        raise ValueError('Şablonda kodlanan daire alanı yok.')
    xs = [h['p'][0] for h in hucreler]
    ys = [h['p'][1] for h in hucreler]
    sol = max(min(xs) - 6, float(iz_form['x_mm']) + 1.5)
    kutu_form = (sol, min(ys) - 6, max(xs) + 6, max(ys) + 6)
    kutu_tarama = (
        kutu_form[0] - dx,
        (kutu_form[1] - b) / a,
        kutu_form[2] - dx,
        (kutu_form[3] - b) / a,
    )
    lekeler = [
        (x + dx, a * y + b)
        for x, y in _lekeler(image, kutu_tarama, px_mm, cap)
    ]
    if len(lekeler) < 6:
        raise ValueError('Taramada yeterli dolu daire bulunamadı. Test baskısını ön baskılı forma basıp tarayın.')

    adaylar = _adaylar(lekeler, hucreler)
    # Kaba model: kayma ve ölçek birlikte. Eşik gevşek kalırsa sıfır kayma da
    # bütün işaretleri "tutar" ve ince ayar yanlış harfe düşen satırı kaçırır.
    # Sıra, önce eşleşen sayı, sonra medyan hata.
    best_rank = None
    model = (1.0, 0.0, 1.0, 0.0)
    for sx_i in range(94, 109):
        sx = sx_i / 100
        for sy_i in range(97, 108):
            sy = sy_i / 100
            for ox_i in range(-8, 9):
                ox = ox_i * 0.5
                for oy_i in range(-8, 9):
                    oy = oy_i * 0.5
                    pairs = _eslestir(adaylar, (sx, ox, sy, oy), 2.2)
                    if len(pairs) < 6:
                        continue
                    dists = [
                        ((sx * h['q'][0] + ox - ink[0]) ** 2 + (sy * h['q'][1] + oy - ink[1]) ** 2) ** 0.5
                        for h, ink in pairs
                    ]
                    rank = (len(pairs), -median(dists))
                    if best_rank is None or rank > best_rank:
                        best_rank = rank
                        model = (sx, ox, sy, oy)
    pairs = []
    for tol in (1.0, 0.8, 0.6, 0.6):
        pairs = _eslestir(adaylar, model, tol)
        if len(pairs) < 6:
            break
        qx = [h['q'][0] for h, _ in pairs]
        qy = [h['q'][1] for h, _ in pairs]
        sx, ox = _eksen(qx, [ink[0] for _, ink in pairs])
        sy, oy = _eksen(qy, [ink[1] for _, ink in pairs])
        if max(qx) - min(qx) < 25:
            sx, ox = 1.0, median(ink[0] - q for q, (_, ink) in zip(qx, pairs))
        if max(qy) - min(qy) < 40:
            sy, oy = 1.0, median(ink[1] - q for q, (_, ink) in zip(qy, pairs))
        model = (sx, ox, sy, oy)
    if len(pairs) < 6:
        raise ValueError('İşaretler dairelerle eşleşmedi. Taramanın test baskısı olduğundan emin olun.')

    sx, ox, sy, oy = model
    once = [((ink[0] - h['p'][0]) ** 2 + (ink[1] - h['p'][1]) ** 2) ** 0.5 for h, ink in pairs]
    kalan = [
        ((ink[0] - (sx * h['q'][0] + ox)) ** 2 + (ink[1] - (sy * h['q'][1] + oy)) ** 2) ** 0.5
        for h, ink in pairs
    ]
    oneri = {
        'olcek': round(1 / sx, 4),
        'olcek_y': round(1 / sy, 4),
        'ofset_x_mm': round(-ox / sx, 2),
        'ofset_y_mm': round(-oy / sy, 2),
    }
    uyari = ''
    if not (0.85 <= oneri['olcek'] <= 1.15 and 0.85 <= oneri['olcek_y'] <= 1.15):
        raise ValueError('Ölçülen yazıcı ölçeği çok farklı. Yazdırırken ölçeği %100 yapın, sayfaya sığdırmayı kapatın.')
    if abs(oneri['ofset_x_mm']) > 30 or abs(oneri['ofset_y_mm']) > 30:
        raise ValueError('Ölçülen kayma çok büyük. Kâğıdın tepsiye düz girdiğini kontrol edin.')
    if abs(sx - 1) > 0.01 or abs(sy - 1) > 0.01:
        uyari = (
            f'Yazıcı çıktıyı yatayda %{(sx - 1) * 100:+.1f}, dikeyde %{(sy - 1) * 100:+.1f} '
            'büyütüyor. Yazdırma ayarında kenarlıksız baskı veya ölçek varsa kapatın; '
            'kapatırsanız yeniden ölçün.'
        )
    egim = float(iz_tarama.get('egim_derece') or 0)
    if abs(egim) > 0.2:
        extra = f'Tarama yaklaşık {egim:+.2f}° eğri. Kâğıdı düz tarayıp yeniden ölçmeniz önerilir.'
        uyari = f'{uyari} {extra}'.strip()
    quality = max(0.0, min(1.0, 1 - median(kalan) / 1.5 - abs(egim) / 5))
    return {
        'kalibrasyon': oneri,
        'isaret': len(pairs),
        'leke': len(lekeler),
        'once_mm': {'medyan': round(median(once), 2), 'en_cok': round(max(once), 2)},
        'sonra_mm': {'medyan': round(median(kalan), 2), 'en_cok': round(max(kalan), 2)},
        'yazici': {
            'olcek_x': round(sx, 4),
            'olcek_y': round(sy, 4),
            'kayma_x_mm': round(ox, 2),
            'kayma_y_mm': round(oy, 2),
            'donus_derece': round(egim, 3),
        },
        'kalite': round(quality, 3),
        'uyari': uyari,
    }
