"""İsteğe bağlı daire algılama.

Sonuç öneridir. Şablon ancak kullanıcı onaylarsa değişir. Algılama olmazsa
elle daire dizisi oluşturma etkilenmez.
"""
from __future__ import annotations

from io import BytesIO
from math import atan, degrees
from statistics import median

from PIL import Image


def _median(values: list[float]) -> float:
    if not values:
        return 0
    return float(median(values))


def _bilesenler(image: Image.Image) -> list[dict]:
    gray = image.convert('L')
    scale = min(1.0, 720 / max(gray.size))
    if scale < 1:
        gray = gray.resize(
            (max(1, int(gray.width * scale)), max(1, int(gray.height * scale))),
            Image.Resampling.BILINEAR,
        )
    width, height = gray.size
    pixels = gray.load()
    samples = [pixels[x, y] for y in range(0, height, 3) for x in range(0, width, 3)]
    samples.sort()
    paper = samples[int(len(samples) * 0.82)] if samples else 255
    thresh = paper - 30
    dark = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if pixels[x, y] <= thresh:
                dark[row + x] = 1
    visited = bytearray(width * height)
    found = []
    for y in range(height):
        row = y * width
        for x in range(width):
            start = row + x
            if not dark[start] or visited[start]:
                continue
            stack = [(x, y)]
            visited[start] = 1
            count = 0
            minx = maxx = x
            miny = maxy = y
            while stack:
                cx, cy = stack.pop()
                count += 1
                if cx < minx:
                    minx = cx
                elif cx > maxx:
                    maxx = cx
                if cy < miny:
                    miny = cy
                elif cy > maxy:
                    maxy = cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    ni = ny * width + nx
                    if dark[ni] and not visited[ni]:
                        visited[ni] = 1
                        stack.append((nx, ny))
            bw = maxx - minx + 1
            bh = maxy - miny + 1
            if count < 10 or bw < 4 or bh < 4:
                continue
            aspect = bw / bh if bh else 0
            if aspect < 0.72 or aspect > 1.4:
                continue
            extent = count / (bw * bh)
            if extent < 0.06 or extent > 0.9:
                continue
            found.append({
                'cx': (minx + maxx) / 2 / scale,
                'cy': (miny + maxy) / 2 / scale,
                'cap_px': ((bw + bh) / 2) / scale,
            })
    return found


def _hough_daireler(image: Image.Image, genislik_mm: float, yukseklik_mm: float) -> list[dict]:
    """İçinde rakam/harf olan veya taramada parçalanan halkaları da yakala."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []
    gray = np.asarray(image.convert('L'))
    px_per_mm = (image.width / genislik_mm + image.height / yukseklik_mm) / 2
    circles = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(8, int(round(px_per_mm * 2.7))),
        param1=120,
        param2=30,
        minRadius=max(3, int(round(px_per_mm * 1.1))),
        maxRadius=max(5, int(round(px_per_mm * 3.0))),
    )
    if circles is None:
        return []
    return [
        {
            'cx': float(x),
            'cy': float(y),
            'cap_px': float(radius * 2),
        }
        for x, y, radius in circles[0]
    ]


def _tek_dizi(circles: list[dict]) -> list[dict]:
    if len(circles) < 4:
        return []
    yatay = []
    dikey = []
    for i, circle in enumerate(circles):
        near_x = None
        near_y = None
        for j, other in enumerate(circles):
            if i == j:
                continue
            dx = other['x_mm'] - circle['x_mm']
            dy = other['y_mm'] - circle['y_mm']
            if dx > 0.6 and abs(dy) <= max(1.2, abs(dx) * 0.35):
                if near_x is None or dx < near_x:
                    near_x = dx
            if dy > 0.6 and abs(dx) <= max(1.2, abs(dy) * 0.35):
                if near_y is None or dy < near_y:
                    near_y = dy
        if near_x:
            yatay.append(near_x)
        if near_y:
            dikey.append(near_y)
    if not yatay or not dikey:
        return []
    pitch_x = _median(yatay)
    pitch_y = _median(dikey)
    if pitch_x < 0.8 or pitch_y < 0.8:
        return []
    origin = min(circles, key=lambda item: (item['y_mm'], item['x_mm']))
    tol_x = pitch_x * 0.35
    tol_y = pitch_y * 0.35
    members = []
    for circle in circles:
        col = round((circle['x_mm'] - origin['x_mm']) / pitch_x)
        row = round((circle['y_mm'] - origin['y_mm']) / pitch_y)
        if col < 0 or row < 0:
            continue
        expect_x = origin['x_mm'] + col * pitch_x
        expect_y = origin['y_mm'] + row * pitch_y
        if abs(circle['x_mm'] - expect_x) <= tol_x and abs(circle['y_mm'] - expect_y) <= tol_y:
            members.append((row, col))
    if len(members) < 4:
        return []
    unique = set(members)
    def contiguous(values):
        runs = []
        for value in sorted(values):
            if not runs or value > runs[-1][-1] + 1:
                runs.append([value])
            else:
                runs[-1].append(value)
        return runs

    row_runs = contiguous({row for row, _col in unique})
    col_runs = contiguous({col for _row, col in unique})
    cap = _median([circle['cap_mm'] for circle in circles])
    grids = []
    for rows in row_runs:
        for cols in col_runs:
            cells = {
                (row, col) for row, col in unique
                if rows[0] <= row <= rows[-1] and cols[0] <= col <= cols[-1]
            }
            expect = len(rows) * len(cols)
            if len(cells) < max(4, int(expect * 0.55)):
                continue
            points = []
            for circle in circles:
                col = round((circle['x_mm'] - origin['x_mm']) / pitch_x)
                row = round((circle['y_mm'] - origin['y_mm']) / pitch_y)
                if (row, col) not in cells:
                    continue
                points.append((col, row, circle))
            x0, fit_x = _eksen_otur([item[0] for item in points], [item[2]['x_mm'] for item in points])
            y0, fit_y = _eksen_otur([item[1] for item in points], [item[2]['y_mm'] for item in points])
            use_x = fit_x if 0.8 <= fit_x <= pitch_x * 1.4 else pitch_x
            use_y = fit_y if 0.8 <= fit_y <= pitch_y * 1.4 else pitch_y
            if not (0.8 <= fit_x <= pitch_x * 1.4):
                x0 = origin['x_mm']
            if not (0.8 <= fit_y <= pitch_y * 1.4):
                y0 = origin['y_mm']
            grids.append({
                'x_mm': round(x0 + cols[0] * use_x, 3),
                'y_mm': round(y0 + rows[0] * use_y, 3),
                'satir': len(rows),
                'sutun': len(cols),
                'cap_mm': round(cap, 2),
                'aralik_x_mm': round(use_x, 3),
                'aralik_y_mm': round(use_y, 3),
            })
    return grids


def _eksen_otur(indices: list[int], values: list[float]) -> tuple[float, float]:
    """index 0'daki merkez ve eşit aralık. Dairelerin kendi ölçüsüdür."""
    if not indices:
        return 0.0, 0.0
    if len(indices) == 1:
        return values[0], 0.0
    n = len(indices)
    mean_i = sum(indices) / n
    mean_v = sum(values) / n
    spread = sum((index - mean_i) ** 2 for index in indices)
    if spread < 1e-6:
        return mean_v, 0.0
    pitch = sum((index - mean_i) * (value - mean_v) for index, value in zip(indices, values)) / spread
    return mean_v - pitch * mean_i, pitch


def _diziler(circles: list[dict]) -> list[dict]:
    """Birbirinden uzak düzenli kümeleri ayrı ızgara önerileri olarak bulur."""
    if len(circles) < 4:
        return []
    yatay, dikey = [], []
    for index, circle in enumerate(circles):
        same_row = [
            abs(other['x_mm'] - circle['x_mm'])
            for pos, other in enumerate(circles)
            if pos != index and abs(other['y_mm'] - circle['y_mm']) <= 1.4
            and abs(other['x_mm'] - circle['x_mm']) > 0.8
        ]
        same_col = [
            abs(other['y_mm'] - circle['y_mm'])
            for pos, other in enumerate(circles)
            if pos != index and abs(other['x_mm'] - circle['x_mm']) <= 1.4
            and abs(other['y_mm'] - circle['y_mm']) > 0.8
        ]
        if same_row:
            yatay.append(min(same_row))
        if same_col:
            dikey.append(min(same_col))
    pitch_x, pitch_y = _median(yatay), _median(dikey)
    if pitch_x < 0.8 or pitch_y < 0.8:
        return _tek_dizi(circles)

    adjacency = [set() for _ in circles]
    for i, circle in enumerate(circles):
        for j in range(i + 1, len(circles)):
            other = circles[j]
            dx = abs(other['x_mm'] - circle['x_mm'])
            dy = abs(other['y_mm'] - circle['y_mm'])
            horizontal = dy <= max(1.2, pitch_y * 0.28) and dx <= pitch_x * 2.2
            vertical = dx <= max(1.2, pitch_x * 0.28) and dy <= pitch_y * 2.2
            if horizontal or vertical:
                adjacency[i].add(j)
                adjacency[j].add(i)
    components = []
    seen = set()
    for start in range(len(circles)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            current = stack.pop()
            component.append(circles[current])
            for neighbour in adjacency[current]:
                if neighbour not in seen:
                    seen.add(neighbour)
                    stack.append(neighbour)
        if len(component) >= 4:
            components.append(component)
    grids = []
    for component in components:
        grids.extend(_tek_dizi(component))
    grids.sort(key=lambda item: (item['y_mm'], item['x_mm']))
    return grids


def izleri_algila(png: bytes, genislik_mm: float, yukseklik_mm: float) -> dict | None:
    """Sol kenardaki siyah kesikli zaman izleri.

    Optik formda daire satırları bu izlerin aralığına oturur. İz bulunamazsa None.
    """
    source = png if isinstance(png, Image.Image) else Image.open(BytesIO(png))
    image = source.convert('L')
    image.load()
    if genislik_mm <= 0 or yukseklik_mm <= 0 or image.width < 40 or image.height < 40:
        return None
    width, height = image.size
    pixels = image.load()
    band = min(max(40, int(width * 0.08)), 140)
    samples = [pixels[x, y] for y in range(0, height, 4) for x in range(0, band, 2)]
    samples.sort()
    paper = samples[int(len(samples) * 0.9)] if samples else 255
    thresh = min(100, paper - 140)
    need = max(12, band // 8)

    def dark_span(row: int):
        xs = [x for x in range(band) if pixels[x, row] <= thresh]
        if len(xs) < need:
            return None
        return min(xs), max(xs)

    rows = []
    y = 0
    while y < height:
        span = dark_span(y)
        if span is None:
            y += 1
            continue
        y0 = y
        minx, maxx = span
        while y < height:
            nxt = dark_span(y)
            if nxt is None:
                break
            minx = min(minx, nxt[0])
            maxx = max(maxx, nxt[1])
            y += 1
        bh = y - y0
        bw = maxx - minx + 1
        if 6 <= bh <= 40 and bw >= bh:
            rows.append({'y': (y0 + y - 1) / 2, 'x0': minx, 'x1': maxx, 'h': bh})
        y += 1
    if len(rows) < 8:
        return None
    gaps = [rows[i + 1]['y'] - rows[i]['y'] for i in range(len(rows) - 1) if rows[i + 1]['y'] > rows[i]['y']]
    pitch = _median(gaps)
    if pitch <= 0:
        return None
    chains = [[rows[0]]]
    for row in rows[1:]:
        gap = row['y'] - chains[-1][-1]['y']
        if pitch * 0.7 <= gap <= pitch * 1.35:
            chains[-1].append(row)
        else:
            chains.append([row])
    kept = max(chains, key=len)
    if len(kept) < 8:
        return None
    core = min(40, thresh)

    def core_span(item):
        top = max(0, int(item['y'] - item['h'] / 2))
        bottom = min(height, int(item['y'] + item['h'] / 2) + 1)
        counts = [
            sum(1 for yy in range(top, bottom) if pixels[x, yy] <= core)
            for x in range(band)
        ]
        peak = max(counts) if counts else 0
        if peak < 3:
            return item['x0'], item['x1']
        xs = [index for index, count in enumerate(counts) if count >= peak * 0.5]
        return (min(xs), max(xs)) if xs else (item['x0'], item['x1'])

    spans = [core_span(item) for item in kept]
    pitch = _median([kept[i + 1]['y'] - kept[i]['y'] for i in range(len(kept) - 1)])
    sx = genislik_mm / width
    sy = yukseklik_mm / height
    centers = [(start + end) / 2 for start, end in spans]
    mean_y = sum(item['y'] for item in kept) / len(kept)
    mean_x = sum(centers) / len(centers)
    denom = sum((item['y'] - mean_y) ** 2 for item in kept)
    slope = (
        sum((item['y'] - mean_y) * (center - mean_x) for item, center in zip(kept, centers)) / denom
        if denom else 0
    )
    return {
        'x_mm': round(_median([span[1] for span in spans]) * sx, 2),
        'genislik_mm': round(_median([span[1] - span[0] for span in spans]) * sx, 2),
        'y0_mm': round(kept[0]['y'] * sy, 2),
        'aralik_mm': round(pitch * sy, 3),
        'adet': len(kept),
        'satirlar_mm': [round(item['y'] * sy, 2) for item in kept],
        'egim_derece': round(degrees(atan(slope)), 3),
    }


def izleri_algila_coklu(png: bytes, genislik_mm: float, yukseklik_mm: float) -> list[dict]:
    source = png if isinstance(png, Image.Image) else Image.open(BytesIO(png))
    source.load()
    tracks = []
    left = izleri_algila(source, genislik_mm, yukseklik_mm)
    if left:
        tracks.append({**left, 'id': 'sol-1', 'kenar': 'sol'})
    mirrored = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    right_raw = izleri_algila(mirrored, genislik_mm, yukseklik_mm)
    if right_raw:
        right_edge = genislik_mm - right_raw['x_mm'] + right_raw['genislik_mm']
        right = {**right_raw, 'id': 'sag-1', 'kenar': 'sag', 'x_mm': round(right_edge, 2)}
        duplicate = left and all(
            abs(a - b) < 0.3
            for a, b in zip(left.get('satirlar_mm') or [], right.get('satirlar_mm') or [])
        ) and abs(right['x_mm'] - left['x_mm']) < genislik_mm * 0.15
        if not duplicate:
            tracks.append(right)
    return tracks


def daireleri_algila(png: bytes, genislik_mm: float, yukseklik_mm: float) -> dict:
    image = Image.open(BytesIO(png))
    image.load()
    if genislik_mm <= 0 or yukseklik_mm <= 0 or image.width < 8 or image.height < 8:
        return {'daireler': [], 'diziler': [], 'uyari': 'Görüntü algılama için yetersiz.'}
    raw = _hough_daireler(image, genislik_mm, yukseklik_mm) or _bilesenler(image)
    if not raw:
        return {
            'daireler': [],
            'diziler': [],
            'uyari': 'Daire bulunamadı. Diziyi araç çubuğundan elle oluşturabilirsiniz.',
        }
    px_w = image.width
    px_h = image.height
    circles = []
    for item in raw:
        cap_mm = item['cap_px'] / px_w * genislik_mm
        if cap_mm < 1 or cap_mm > 12:
            continue
        circles.append({
            'x_mm': round(item['cx'] / px_w * genislik_mm, 2),
            'y_mm': round(item['cy'] / px_h * yukseklik_mm, 2),
            'cap_mm': round(cap_mm, 2),
        })
    if not circles:
        return {
            'daireler': [],
            'diziler': [],
            'uyari': 'Daire bulunamadı. Diziyi araç çubuğundan elle oluşturabilirsiniz.',
        }
    if len(circles) > 2500:
        circles = circles[:2500]
    grids = _diziler(circles)
    uyari = '' if grids else 'Düzenli dizi seçilemedi. İşaretler hizalama için duruyor; diziyi elle de kurabilirsiniz.'
    return {'daireler': circles, 'diziler': grids, 'uyari': uyari}
