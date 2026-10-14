"""Boş optik PDF üzerine öğrenci yazısını ve kimlik balonlarını basar.

Sayfa görseli olduğu gibi kalır. Metin alanları yazılır, balon alanlarının
doğru daireleri karalanır. Aynı form görseli sayfalar arasında paylaşılır.
"""
from __future__ import annotations

import re
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

_TOKEN_RE = re.compile(r'#\{([A-Za-z0-9_]+)\}|#([A-Za-z0-9_]+)#')
_CLASS_RE = re.compile(
    r'^(?P<sinif>\d{1,2}|mezun)\s*[-/ ]\s*(?P<sube>[0-9A-Za-zÇĞİÖŞÜçğıöşü]+)$',
    re.IGNORECASE,
)
_FONT_NAME = 'OptikYazi'
_MIN_PUNTO = 5.5

SAMPLE_VALUES = {
    'ad': 'Ayşe',
    'soyad': 'Yılmaz',
    'sinif': '11',
    'sube': 'A',
    'sinif_sube': '11 / A',
    'numara': '1042',
    'ogrenci_no': '1042',
    'okul': '3K Kampüs',
    'il': 'Ankara',
    'ilce': 'Çankaya',
    'il_ilce': 'Ankara / Çankaya',
    'salon': 'Salon 1 / 12',
    'sira': '12',
    'oturum': '1. Oturum',
    'deneme_adi': 'TYT Deneme 3',
    'sinav_no': '129',
    'tc': '10000000146',
    'telefon': '5550000000',
    'kurum': '3K Kampüs',
}


def tr_upper(text: str) -> str:
    return (text or '').replace('i', 'İ').replace('ı', 'I').upper()


def class_parts(sinif_ad: str) -> tuple[str, str, str]:
    raw = (sinif_ad or '').strip()
    match = _CLASS_RE.match(raw)
    if not match:
        return raw, '', raw
    sinif = match.group('sinif')
    sube = tr_upper(match.group('sube'))
    if sinif.lower() == 'mezun':
        sinif = 'Mezun'
    return sinif, sube, f'{sinif} / {sube}'


def fill_template(template: str, values: dict) -> str:
    def repl(match):
        key = (match.group(1) or match.group(2) or '').lower()
        return '' if values.get(key) is None else str(values.get(key))

    text = _TOKEN_RE.sub(repl, template or '')
    text = re.sub(r'\s*/\s*', ' / ', text)
    text = re.sub(r'(?:^\s*/\s*)|(?:\s*/\s*$)', '', text)
    return ' '.join(text.split())


def _font_file() -> Path:
    base = Path(settings.BASE_DIR)
    regular = base / 'static' / 'fonts' / 'Roboto-Regular.ttf'
    if regular.is_file():
        return regular
    import reportlab
    return Path(reportlab.__file__).parent / 'fonts' / 'Vera.ttf'


def _ensure_font() -> str:
    if _FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(_FONT_NAME, str(_font_file())))
    return _FONT_NAME


def _num(value) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _fit(text: str, font: str, punto: float, width_pt: float) -> tuple[str, float]:
    size = punto
    while size > _MIN_PUNTO and pdfmetrics.stringWidth(text, font, size) > width_pt:
        size = round(size - 0.25, 2)
    if pdfmetrics.stringWidth(text, font, size) <= width_pt:
        return text, size
    trimmed = text
    while trimmed and pdfmetrics.stringWidth(trimmed + '…', font, size) > width_pt:
        trimmed = trimmed[:-1]
    trimmed = trimmed.strip()
    return (trimmed + '…') if trimmed else '', size


def _charset_rows(charset: str) -> list[str]:
    text = charset or ''
    if ',' in text:
        return [part.strip() for part in text.split(',') if part.strip()]
    return list(text)


def _choice_key(raw: str) -> str:
    key = tr_upper(raw).strip()
    if key in ('MEZUN', 'M'):
        return 'M'
    return key


def bubble_cells(field, values: dict) -> list[str]:
    """Her sütun için karalanacak karakter. Boş string o sütunu boş bırakır."""
    rows = _charset_rows(getattr(field, 'karakter_kumesi', '') or '')
    cols = int(getattr(field, 'sutun_sayisi', 1) or 1)
    if not rows or cols < 1:
        return []
    raw = fill_template(getattr(field, 'sablon', ''), values)
    digit_rows = set(rows) <= set('0123456789') and bool(rows)
    if digit_rows:
        digits = ''.join(ch for ch in raw if ch.isdigit())
        if '#tc#' in (getattr(field, 'sablon', '') or '') and len(digits) != cols:
            return []
        if len(digits) > cols:
            digits = digits[-cols:]
        return list(digits)
    if cols == 1 and ',' in (getattr(field, 'karakter_kumesi', '') or ''):
        key = _choice_key(raw)
        return [key] if key else []
    text = tr_upper(raw)
    cells = []
    for ch in text:
        if len(cells) >= cols:
            break
        if ch == ' ':
            cells.append('')
            continue
        cells.append(ch if ch in rows else '')
    return cells


def layout_marks(fields, values: dict) -> list[dict]:
    """Karalanacak daire merkezleri, sayfanın sol üstünden milimetre."""
    marks = []
    for field in fields:
        if not getattr(field, 'aktif', True):
            continue
        if getattr(field, 'tur', 'metin') != 'balon':
            continue
        rows = _charset_rows(getattr(field, 'karakter_kumesi', '') or '')
        if not rows:
            continue
        pitch_x = _num(field.genislik_mm)
        pitch_y = _num(field.yukseklik_mm)
        x0 = _num(field.x_mm)
        y0 = _num(field.y_mm)
        for index, cell in enumerate(bubble_cells(field, values)):
            if not cell:
                continue
            key = _choice_key(cell) if ',' in (field.karakter_kumesi or '') else cell
            try:
                row = rows.index(key)
            except ValueError:
                continue
            marks.append({
                'x_mm': x0 + index * pitch_x,
                'y_mm': y0 + row * pitch_y,
            })
    return marks


def layout_lines(fields, values: dict) -> list[dict]:
    """Basılacak satırlar. Balon alanları metin olarak yazılmaz."""
    font = _ensure_font()
    lines = []
    for field in fields:
        if not getattr(field, 'aktif', True):
            continue
        if getattr(field, 'tur', 'metin') != 'metin':
            continue
        text = tr_upper(fill_template(getattr(field, 'sablon', ''), values))
        if not text:
            continue
        width_mm = _num(field.genislik_mm)
        width_pt = width_mm * 72 / 25.4
        fitted, size = _fit(text, font, _num(field.punto), width_pt)
        if not fitted:
            continue
        lines.append({
            'text': fitted,
            'x_mm': _num(field.x_mm),
            'y_mm': _num(field.y_mm),
            'size': size,
            'width_mm': width_mm,
        })
    return lines


def _mark_radius_pt(scale: float) -> float:
    """Dairenin içine oturan dolgu. 2.4 mm, 3.2 mm'lik balonu taşırmaz."""
    return (2.4 / 2) * scale


def _overlay_page(lines, marks, page_w_pt, page_h_pt, page_w_mm, page_h_mm):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w_pt, page_h_pt))
    font = _ensure_font()
    sx = page_w_pt / page_w_mm
    sy = page_h_pt / page_h_mm
    if marks:
        c.setFillColorRGB(0.1, 0.1, 0.12)
        radius = _mark_radius_pt((sx + sy) / 2)
        for mark in marks:
            x = mark['x_mm'] * sx
            y = page_h_pt - (mark['y_mm'] * sy)
            c.circle(x, y, radius, stroke=0, fill=1)
    c.setFillColorRGB(0.08, 0.09, 0.12)
    for line in lines:
        x = line['x_mm'] * sx
        y = page_h_pt - (line['y_mm'] * sy)
        c.setFont(font, line['size'])
        c.drawString(x, y, line['text'])
    c.save()
    buf.seek(0)
    from pypdf import PdfReader
    return PdfReader(buf).pages[0]


def _raw_content(page) -> bytes:
    """Sayfanın çizim akışı. ContentStream.get_data() bu formda boş döner."""
    from pypdf.generic import ArrayObject

    contents = page.get('/Contents')
    if contents is None:
        return b''
    obj = contents.get_object() if hasattr(contents, 'get_object') else contents
    if isinstance(obj, ArrayObject):
        chunks = []
        for item in obj:
            piece = item.get_object().get_data()
            if piece:
                chunks.append(piece)
        return b'\n'.join(chunks)
    data = obj.get_data()
    return data or b''


def _copy_resource_refs(resources):
    """Kaynak adlarını aynı PDF nesnelerine bağlar; görseli sayfa başına kopyalamaz."""
    from pypdf.generic import DictionaryObject

    copied = DictionaryObject()
    for key in resources.keys():
        copied[key] = resources.get(key)
    return copied


def _actual_size_print(writer) -> None:
    """Yazdır penceresi sayfayı kağıda sığdırmasın.

    Ekranda A4 üzerinde oturan işaret, sığdırma açıkken kağıtta kayar.
    """
    from pypdf.generic import BooleanObject, DictionaryObject, NameObject

    prefs = DictionaryObject()
    prefs[NameObject('/PrintScaling')] = NameObject('/None')
    prefs[NameObject('/PickTrayByPDFSize')] = BooleanObject(True)
    writer.root_object[NameObject('/ViewerPreferences')] = prefs
    header = getattr(writer, 'pdf_header', '')
    if isinstance(header, bytes):
        header = header.decode('ascii', 'ignore')
    if header.startswith('%PDF-1.') and header < '%PDF-1.6':
        writer.pdf_header = '%PDF-1.6'


def render_optik_pdf(pdf_bytes: bytes, form, value_rows: list[dict], formu_bas: bool = True) -> bytes:
    """Her öğrenci için bir sayfa üretir.

    formu_bas doğruysa yüklenen formun kendisi de basılır (örnek sayfa).
    Yanlışsa sayfa boştur; yalnız yazı ve karalama vardır. Yazıcıya hazır
    optik konduğu için form görseli tekrar çıkmaz. Sayfa ölçüsü formla aynı
    kalır, böylece yüzde 100 baskıda yerler tutar.
    """
    if not value_rows:
        raise ValueError('Basılacak öğrenci yok.')
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DecodedStreamObject, NameObject

    reader = PdfReader(BytesIO(pdf_bytes))
    if not reader.pages:
        raise ValueError('Form PDF boş.')
    source = reader.pages[0]
    box = source.mediabox
    page_w_pt = float(box.width)
    page_h_pt = float(box.height)
    page_w_mm = _num(form.sayfa_genislik_mm) or 210
    page_h_mm = _num(form.sayfa_yukseklik_mm) or 297
    fields = list(form.alanlar.all()) if hasattr(form, 'alanlar') else list(form.fields)
    writer = PdfWriter()

    if formu_bas:
        writer.add_page(source)
        template = writer.pages[0]
        base_ops = _raw_content(template)
        resources = template.get_object().get('/Resources')
        resources = resources.get_object() if resources is not None else None
    else:
        base_ops = b''
        resources = None

    for values in value_rows:
        page = writer.add_blank_page(width=page_w_pt, height=page_h_pt)
        if formu_bas and resources is not None:
            page[NameObject('/Resources')] = _copy_resource_refs(resources)
            stream = DecodedStreamObject()
            stream.set_data(base_ops)
            page[NameObject('/Contents')] = writer._add_object(stream)
        lines = layout_lines(fields, values)
        marks = layout_marks(fields, values)
        if lines or marks:
            page.merge_page(_overlay_page(
                lines, marks, page_w_pt, page_h_pt, page_w_mm, page_h_mm,
            ))
            if formu_bas:
                # pypdf bazı sürümlerde birleşince formun kendi çizimini siler.
                # Yazı, yüklenen formun üstünde kalsın diye form akışını öne alırız.
                painted = _raw_content(page)
                if base_ops and base_ops not in painted:
                    restored = DecodedStreamObject()
                    restored.set_data(base_ops + b'\n' + painted)
                    page[NameObject('/Contents')] = writer._add_object(restored)
    if formu_bas:
        del writer.pages[0]
    _actual_size_print(writer)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()
