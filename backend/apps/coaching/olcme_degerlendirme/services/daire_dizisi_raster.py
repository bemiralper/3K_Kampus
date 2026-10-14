"""Kaynak formu editör arka planına çevirir.

PDF sayfa ölçüsü mediabox'tan milimetreye çevrilir. Gömülü tarama varsa o
gösterilir. Vektör sayfada beyaz zemin döner; yerleştirme yine milimetreyle çalışır.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps


MAX_EDGE = 1800
A4_MM = (210.0, 297.0)


def normalize_page_mm(width_mm: float, height_mm: float) -> tuple[float, float]:
    width_mm, height_mm = float(width_mm), float(height_mm)
    if abs(width_mm - A4_MM[0]) <= 2 and abs(height_mm - A4_MM[1]) <= 2:
        return A4_MM
    if abs(width_mm - A4_MM[1]) <= 2 and abs(height_mm - A4_MM[0]) <= 2:
        return A4_MM[1], A4_MM[0]
    return round(width_mm, 2), round(height_mm, 2)


def _png(image: Image.Image) -> tuple[bytes, int, int]:
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    edge = max(image.size)
    if edge > MAX_EDGE:
        scale = MAX_EDGE / edge
        image = image.resize(
            (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    buf = BytesIO()
    image.save(buf, format='PNG')
    return buf.getvalue(), image.width, image.height


def _blank(width_mm: float, height_mm: float) -> tuple[bytes, int, int]:
    width = 1200
    height = max(1, int(round(width * height_mm / width_mm)))
    return _png(Image.new('RGB', (width, height), (255, 255, 255)))


def pdf_sayfa_mm(raw: bytes, sayfa_no: int) -> tuple[float, float, int]:
    try:
        import pymupdf

        document = pymupdf.open(stream=raw, filetype='pdf')
        count = document.page_count
        index = int(sayfa_no) - 1
        if count < 1:
            raise ValueError('Form PDF boş.')
        if index < 0 or index >= count:
            raise ValueError('Seçilen sayfa formda yok.')
        rect = document.load_page(index).rect
        return round(rect.width * 25.4 / 72, 2), round(rect.height * 25.4 / 72, 2), count
    except ImportError:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(raw))
        count = len(reader.pages)
        if count < 1:
            raise ValueError('Form PDF boş.')
        index = int(sayfa_no) - 1
        if index < 0 or index >= count:
            raise ValueError('Seçilen sayfa formda yok.')
        page = reader.pages[index]
        box = page.cropbox
        width_mm = float(box.width) * 25.4 / 72
        height_mm = float(box.height) * 25.4 / 72
        rotation = int(page.get('/Rotate', 0) or 0) % 360
        if rotation in (90, 270):
            width_mm, height_mm = height_mm, width_mm
        return round(width_mm, 2), round(height_mm, 2), count


def _en_buyuk_gorsel(page):
    images = list(getattr(page, 'images', []) or [])
    best = None
    best_area = 0
    for item in images:
        try:
            image = item.image
        except Exception:
            continue
        if image is None:
            continue
        area = image.size[0] * image.size[1]
        if area > best_area:
            best = image
            best_area = area
    return best


def raster_pdf(raw: bytes, sayfa_no: int) -> dict:
    width_mm, height_mm, count = pdf_sayfa_mm(raw, sayfa_no)
    width_mm, height_mm = normalize_page_mm(width_mm, height_mm)
    uyari = ''
    try:
        import pymupdf

        document = pymupdf.open(stream=raw, filetype='pdf')
        page = document.load_page(int(sayfa_no) - 1)
        scale = min(MAX_EDGE / max(page.rect.width, page.rect.height), 3.0)
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
        png, px_w, px_h = _png(image)
    except ImportError:
        from pypdf import PdfReader

        page = PdfReader(BytesIO(raw)).pages[int(sayfa_no) - 1]
        image = _en_buyuk_gorsel(page)
        if image is None:
            png, px_w, px_h = _blank(width_mm, height_mm)
            uyari = 'Vektör PDF önizlemesi için PyMuPDF kurulamadı; boş arka plan gösteriliyor.'
        else:
            png, px_w, px_h = _png(image.convert('RGB'))
    return {
        'png': png,
        'genislik_px': px_w,
        'yukseklik_px': px_h,
        'genislik_mm': width_mm,
        'yukseklik_mm': height_mm,
        'sayfa_sayisi': count,
        'uyari': uyari,
    }


def _gorsel_mm(image: Image.Image) -> tuple[float, float, str]:
    dpi = image.info.get('dpi') or (72, 72)
    if isinstance(dpi, (int, float)):
        dx = dy = float(dpi)
    else:
        dx = float(dpi[0] or 72)
        dy = float(dpi[1] or 72)
    uyari = ''
    buyuk_tarama = max(image.size) >= 1500 and (dx < 150 or dy < 150)
    if buyuk_tarama or dx <= 0 or dy <= 0:
        # Çözünürlüğü yazılmamış A4 taraması. En-boy oranı korunur.
        if image.width >= image.height:
            width_mm, height_mm = 297.0, 297.0 * image.height / image.width
        else:
            height_mm, width_mm = 297.0, 297.0 * image.width / image.height
        uyari = 'Görselde baskı çözünürlüğü yok; sayfa A4 oranına göre ölçüldü.'
        return round(width_mm, 2), round(height_mm, 2), uyari
    width_mm = image.width / dx * 25.4
    height_mm = image.height / dy * 25.4
    if width_mm < 50 or height_mm < 50 or width_mm > 600 or height_mm > 600:
        if image.width >= image.height:
            width_mm, height_mm = 297.0, 297.0 * image.height / image.width
        else:
            height_mm, width_mm = 297.0, 297.0 * image.width / image.height
        uyari = 'Görsel ölçüsü sayfa sınırının dışındaydı; A4 oranına göre ölçüldü.'
    return round(width_mm, 2), round(height_mm, 2), uyari


def raster_gorsel(raw: bytes) -> dict:
    image = ImageOps.exif_transpose(Image.open(BytesIO(raw)))
    image.load()
    width_mm, height_mm, uyari = _gorsel_mm(image)
    width_mm, height_mm = normalize_page_mm(width_mm, height_mm)
    png, px_w, px_h = _png(image)
    return {
        'png': png,
        'genislik_px': px_w,
        'yukseklik_px': px_h,
        'genislik_mm': width_mm,
        'yukseklik_mm': height_mm,
        'sayfa_sayisi': 1,
        'uyari': uyari,
    }


def kaynak_olcusu(raw: bytes, tur: str, sayfa_no: int = 1) -> dict:
    if tur == 'pdf':
        width_mm, height_mm, count = pdf_sayfa_mm(raw, sayfa_no)
        width_mm, height_mm = normalize_page_mm(width_mm, height_mm)
        return {
            'genislik_mm': width_mm,
            'yukseklik_mm': height_mm,
            'sayfa_sayisi': count,
            'uyari': '',
        }
    info = raster_gorsel(raw)
    return {
        'genislik_mm': info['genislik_mm'],
        'yukseklik_mm': info['yukseklik_mm'],
        'sayfa_sayisi': 1,
        'uyari': info['uyari'],
    }


def raster_kaynak(raw: bytes, tur: str, sayfa_no: int = 1) -> dict:
    if tur == 'pdf':
        return raster_pdf(raw, sayfa_no)
    if tur in ('png', 'jpg', 'jpeg'):
        return raster_gorsel(raw)
    raise ValueError('Kaynak PDF, PNG veya JPG olmalıdır.')
