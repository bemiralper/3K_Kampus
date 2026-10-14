"""Daire dizisi şablonundan gerçek sayfa ölçüsünde baskı PDF'i.

Kaynak formun görseli sınav çıktısına konmaz. Önizlemede istenirse konur.
Kalibrasyon, kayıtlı daire geometrisini değiştirmeden bu dönüşümde uygulanır.
"""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.conf import settings
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from .daire_dizisi_schema import (
    TUR_METIN,
    alan_izi,
    alan_degeri,
    geometri_hatalari,
    isaret_merkezleri,
    kalibrasyon_uygula,
    kisalt_ad_soyad,
    kutu_dilimleri,
    kutu_metni,
    tr_upper,
)
_FONT_NAME = 'OptikDaireYazi'
_MIN_PUNTO = 5.5


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


def _fit(text: str, font: str, punto: float, width_pt: float, char_space: float) -> tuple[str, float]:
    size = punto

    def width(value: str, font_size: float) -> float:
        if not value:
            return 0
        extra = char_space * max(len(value) - 1, 0)
        return pdfmetrics.stringWidth(value, font, font_size) + extra

    while size > _MIN_PUNTO and width(text, size) > width_pt:
        size = round(size - 0.25, 2)
    if width(text, size) <= width_pt:
        return text, size
    trimmed = text
    while trimmed and width(trimmed + '…', size) > width_pt:
        trimmed = trimmed[:-1]
    trimmed = trimmed.strip()
    return (trimmed + '…') if trimmed else '', size


def _yazi_genisligi(text: str, font: str, punto: float, char_space: float) -> float:
    if not text:
        return 0
    extra = char_space * max(len(text) - 1, 0)
    return pdfmetrics.stringWidth(text, font, punto) + extra


def _ad_soyad_metni(kaynak: str, text: str, *, font: str, punto: float, width_pt: float, char_space: float) -> str:
    if kaynak != 'ad_soyad':
        return text
    raw = (text or '').strip()
    if _yazi_genisligi(tr_upper(raw), font, punto, char_space) <= width_pt:
        return raw
    return kisalt_ad_soyad(raw)


def _yazi_satiri(lines, *, text, x_mm, y_mm, genislik_mm, yukseklik_mm, punto, hizalama, karakter_araligi, kalibrasyon, font):
    """Kutu sol-üstten ölçülür. Baskı satırı kutunun içinde, dikey ortaya yakın durur."""
    text = tr_upper(text)
    if not text:
        return
    olcek = float(kalibrasyon.get('olcek') or 1)
    width_mm = float(genislik_mm) * olcek
    height_mm = float(yukseklik_mm or 8) * olcek
    width_pt = width_mm * 72 / 25.4
    char_space = float(karakter_araligi or 0) * olcek
    fitted, size = _fit(text, font, float(punto) * olcek, width_pt, char_space)
    if not fitted:
        return
    x, top = kalibrasyon_uygula(float(x_mm), float(y_mm), kalibrasyon)
    em = size * 25.4 / 72
    baseline = top + max((height_mm - em) / 2.0, 0.0) + em * 0.78
    lines.append({
        'text': fitted,
        'x_mm': x,
        'y_mm': baseline,
        'size': size,
        'width_mm': width_mm,
        'hizalama': hizalama or 'sol',
        'karakter_araligi': char_space,
    })


def layout_daire(belge: dict, values: dict) -> tuple[list[dict], list[dict], list[str]]:
    """Baskı öncesi satırlar ve daire merkezleri. Konumlar kalibrasyonludur."""
    kalibrasyon = belge.get('kalibrasyon') or {}
    olcek = float(kalibrasyon.get('olcek') or 1)
    font = _ensure_font()
    lines = []
    marks = []
    uyarilar = []
    hatalar = []
    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True):
            continue
        hatalar.extend(geometri_hatalari(alan))
    if hatalar:
        raise ValueError(' '.join(hatalar))

    for alan in belge.get('alanlar') or []:
        if not alan.get('aktif', True):
            continue
        raw = alan_degeri(alan, values)
        if alan.get('tur') == TUR_METIN:
            olcek_yazi = float(kalibrasyon.get('olcek') or 1)
            raw = _ad_soyad_metni(
                alan.get('veri_kaynagi') or '',
                raw,
                font=font,
                punto=float(alan['punto']) * olcek_yazi,
                width_pt=float(alan['genislik_mm']) * olcek_yazi * 72 / 25.4,
                char_space=float(alan.get('karakter_araligi') or 0) * olcek_yazi,
            )
            _yazi_satiri(
                lines,
                text=raw,
                x_mm=alan['x_mm'],
                y_mm=alan['y_mm'],
                genislik_mm=alan['genislik_mm'],
                yukseklik_mm=alan.get('yukseklik_mm') or 8,
                punto=alan['punto'],
                hizalama=alan.get('hizalama') or 'sol',
                karakter_araligi=alan.get('karakter_araligi') or 0,
                kalibrasyon=kalibrasyon,
                font=font,
            )
            continue
        kutu = alan.get('metin_kutusu')
        iz = alan_izi(belge, alan)
        if isinstance(kutu, dict) and kutu.get('aktif'):
            yazi = kutu_metni(alan, values)
            for dilim in kutu_dilimleri(alan, yazi, iz):
                if not (dilim['metin'] or '').strip():
                    continue
                _yazi_satiri(
                    lines,
                    text=dilim['metin'],
                    x_mm=dilim['x_mm'],
                    y_mm=dilim['y_mm'],
                    genislik_mm=dilim['genislik_mm'],
                    yukseklik_mm=dilim['yukseklik_mm'],
                    punto=kutu.get('punto', 8),
                    hizalama=kutu.get('hizalama') or 'orta',
                    karakter_araligi=kutu.get('karakter_araligi') or 0,
                    kalibrasyon=kalibrasyon,
                    font=font,
                )
        points, status = isaret_merkezleri(alan, raw)
        if status == 'invalid':
            uyarilar.append(f"{alan.get('ad')}: veri bu alana basılmadı.")
            continue
        cap = _num(alan.get('isaret_cap_mm') or (_num(alan['cap_mm']) * 0.68)) * olcek
        for x_mm, y_mm in points:
            mx, my = kalibrasyon_uygula(x_mm, y_mm, kalibrasyon)
            marks.append({'x_mm': mx, 'y_mm': my, 'cap_mm': cap})
    return lines, marks, uyarilar


def _mm_to_pt(x_mm, y_mm, page_w_pt, page_h_pt, page_w_mm, page_h_mm):
    """Sayfadaki milimetre, kâğıdın gerçek milimetresidir. 1 mm = 72/25,4 punto.

    210 mm'yi 595 puntoya gerdirmek daireyi formun halkasından kaydırır.
    """
    del page_w_mm, page_h_mm
    x = float(x_mm) * _MM_PT
    y = float(page_h_pt) - float(y_mm) * _MM_PT
    return x, y


def _overlay_page(lines, marks, page_w_pt, page_h_pt, page_w_mm, page_h_mm):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w_pt, page_h_pt))
    font = _ensure_font()
    if marks:
        c.setFillColorRGB(0.1, 0.1, 0.12)
        for mark in marks:
            x, y = _mm_to_pt(mark['x_mm'], mark['y_mm'], page_w_pt, page_h_pt, page_w_mm, page_h_mm)
            radius = (mark['cap_mm'] / 2) * _MM_PT
            c.circle(x, y, radius, stroke=0, fill=1)
    c.setFillColorRGB(0.08, 0.09, 0.12)
    for line in lines:
        x, y = _mm_to_pt(line['x_mm'], line['y_mm'], page_w_pt, page_h_pt, page_w_mm, page_h_mm)
        width_pt = line['width_mm'] * _MM_PT
        text_width = pdfmetrics.stringWidth(line['text'], font, line['size'])
        extra = line['karakter_araligi'] * max(len(line['text']) - 1, 0)
        text_width += extra
        if line['hizalama'] == 'orta':
            x += max((width_pt - text_width) / 2, 0)
        elif line['hizalama'] == 'sag':
            x += max(width_pt - text_width, 0)
        if line['karakter_araligi']:
            text_obj = c.beginText(x, y)
            text_obj.setFont(font, line['size'])
            text_obj.setCharSpace(line['karakter_araligi'])
            text_obj.textOut(line['text'])
            c.drawText(text_obj)
        else:
            c.setFont(font, line['size'])
            c.drawString(x, y, line['text'])
    c.save()
    buf.seek(0)
    from pypdf import PdfReader
    return PdfReader(buf).pages[0]


def _raw_content(page) -> bytes:
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
    from pypdf.generic import DictionaryObject

    copied = DictionaryObject()
    for key in resources.keys():
        copied[key] = resources.get(key)
    return copied


_MM_PT = 72 / 25.4
_A4_MM = (210.0, 297.0)
# macOS ve yazdırma penceresi A4'ü tam bu punto kutusuna bağlar.
# 210 × 72 / 25,4 = 595,28 × 841,89 özel boyut sayılır ve yeniden çizilir.
_A4_PT = (595.0, 842.0)


def _baski_olcusu(width_mm: float, height_mm: float) -> tuple[float, float, float, float]:
    """A4'e yakın sayfa, sürücünün tanıdığı 595 × 842 punto kutusuna yazılır.

    İşaretin yeri bu kutuya gerdirilmez. Milimetre 72/25,4 punto olarak basılır.
    """
    width_mm = float(width_mm)
    height_mm = float(height_mm)
    if abs(width_mm - _A4_MM[0]) <= 2 and abs(height_mm - _A4_MM[1]) <= 2:
        return _A4_MM[0], _A4_MM[1], _A4_PT[0], _A4_PT[1]
    if abs(width_mm - _A4_MM[1]) <= 2 and abs(height_mm - _A4_MM[0]) <= 2:
        return _A4_MM[1], _A4_MM[0], _A4_PT[1], _A4_PT[0]
    return width_mm, height_mm, width_mm * _MM_PT, height_mm * _MM_PT


def _sayfaya_sigdir(base_ops: bytes, source_w: float, source_h: float, page_w: float, page_h: float) -> bytes:
    """Kaynak formun çizimini baskı kutusuyla aynı ölçeğe alır."""
    if not base_ops or source_w <= 0 or source_h <= 0:
        return base_ops
    if abs(source_w - page_w) < 0.4 and abs(source_h - page_h) < 0.4:
        return base_ops
    sx = page_w / source_w
    sy = page_h / source_h
    prefix = f'q\n{sx:.8f} 0 0 {sy:.8f} 0 0 cm\n'.encode('ascii')
    return prefix + base_ops + b'\nQ\n'


def _sayfa_kutulari(page, width_pt: float, height_pt: float) -> None:
    from pypdf.generic import RectangleObject

    box = RectangleObject((0, 0, float(width_pt), float(height_pt)))
    page.mediabox = box
    page.cropbox = RectangleObject((0, 0, float(width_pt), float(height_pt)))
    page.trimbox = RectangleObject((0, 0, float(width_pt), float(height_pt)))
    page.bleedbox = RectangleObject((0, 0, float(width_pt), float(height_pt)))
    page.artbox = RectangleObject((0, 0, float(width_pt), float(height_pt)))


def _actual_size_print(writer) -> None:
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


def _page_box(pdf_bytes: bytes, sayfa_no: int):
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(pdf_bytes))
    if not reader.pages:
        raise ValueError('Form PDF boş.')
    index = max(1, int(sayfa_no)) - 1
    if index >= len(reader.pages):
        raise ValueError('Seçilen sayfa formda yok.')
    page = reader.pages[index]
    box = page.mediabox
    return reader, page, float(box.width), float(box.height)


def render_daire_pdf(source_bytes: bytes, sablon, value_rows: list[dict], formu_bas: bool = False) -> tuple[bytes, list[str]]:
    """Her değer satırı için bir sayfa. Sayfa ölçüsü kaynak formla aynıdır."""
    if not value_rows:
        raise ValueError('Basılacak öğrenci yok.')
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, NameObject

    page_w_mm = _num(sablon.sayfa_genislik_mm) or 210
    page_h_mm = _num(sablon.sayfa_yukseklik_mm) or 297
    kaynak_tur = (getattr(sablon, 'kaynak_tur', '') or '').lower()
    belge = deepcopy(sablon.belge) if isinstance(sablon.belge, dict) else {}
    profil = getattr(sablon, 'yazici_profili', None)
    if profil is not None and getattr(profil, 'aktif', False):
        belge['kalibrasyon'] = deepcopy(profil.kalibrasyon)
    if formu_bas:
        # Önizleme formun kendi dairelerini gösterir. Yazıcı ölçeği yalnız
        # gerçek forma basılan işaret sayfasında uygulanır.
        belge['kalibrasyon'] = {'ofset_x_mm': 0, 'ofset_y_mm': 0, 'olcek': 1, 'olcek_y': 1}
    page_w_mm, page_h_mm, page_w_pt, page_h_pt = _baski_olcusu(page_w_mm, page_h_mm)

    source_w_pt = source_h_pt = 0.0
    if kaynak_tur == 'pdf':
        _reader, source, source_w_pt, source_h_pt = _page_box(source_bytes, getattr(sablon, 'sayfa_no', 1) or 1)
    else:
        source = None

    layout_daire(belge, value_rows[0])

    writer = PdfWriter()
    base_ops = b''
    resources = None
    if formu_bas and source is not None:
        writer.add_page(source)
        template = writer.pages[0]
        base_ops = _sayfaya_sigdir(_raw_content(template), source_w_pt, source_h_pt, page_w_pt, page_h_pt)
        resources = template.get_object().get('/Resources')
        resources = resources.get_object() if resources is not None else None

    uyarilar = []
    image = None
    if formu_bas and kaynak_tur in ('png', 'jpg', 'jpeg'):
        from PIL import Image
        image = Image.open(BytesIO(source_bytes))
        image.load()

    for values in value_rows:
        lines, marks, row_notes = layout_daire(belge, values)
        uyarilar.extend(row_notes)
        if formu_bas and image is not None:
            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=(page_w_pt, page_h_pt))
            from reportlab.lib.utils import ImageReader
            c.drawImage(ImageReader(image), 0, 0, width=page_w_pt, height=page_h_pt, preserveAspectRatio=False, mask='auto')
            c.save()
            buf.seek(0)
            from pypdf import PdfReader
            writer.add_page(PdfReader(buf).pages[0])
            page = writer.pages[-1]
        else:
            page = writer.add_blank_page(width=page_w_pt, height=page_h_pt)
            if formu_bas and resources is not None:
                page[NameObject('/Resources')] = _copy_resource_refs(resources)
                stream = DecodedStreamObject()
                stream.set_data(base_ops)
                page[NameObject('/Contents')] = writer._add_object(stream)
        _sayfa_kutulari(page, page_w_pt, page_h_pt)
        if lines or marks:
            page.merge_page(_overlay_page(lines, marks, page_w_pt, page_h_pt, page_w_mm, page_h_mm))
            if formu_bas and base_ops:
                painted = _raw_content(page)
                if base_ops not in painted:
                    restored = DecodedStreamObject()
                    restored.set_data(base_ops + b'\n' + painted)
                    page[NameObject('/Contents')] = writer._add_object(restored)
    if formu_bas and source is not None:
        del writer.pages[0]
    _actual_size_print(writer)
    out = BytesIO()
    writer.write(out)
    pdf = out.getvalue()
    if formu_bas:
        pdf = _tek_resme_yapistir(pdf)
    return pdf, uyarilar


def _tek_resme_yapistir(pdf_bytes: bytes) -> bytes:
    """Form görseli ile işaretleri tek resimde birleştirir.

    Ayrı katmanlar yazdırma penceresinde birbirinden kayabiliyor. Önizleme
    bu yüzden sayfanın kendi hizasıyla boyanmış tek bir görseldir.
    """
    import pymupdf
    from pypdf import PdfReader, PdfWriter

    src = pymupdf.open(stream=pdf_bytes, filetype='pdf')
    out = pymupdf.open()
    for page in src:
        rect = page.rect
        pix = page.get_pixmap(matrix=pymupdf.Matrix(300 / 72, 300 / 72), alpha=False)
        yeni = out.new_page(width=rect.width, height=rect.height)
        yeni.insert_image(rect, stream=pix.tobytes('jpeg', jpg_quality=90))
    ham = BytesIO()
    out.save(ham, deflate=True)
    ham.seek(0)
    reader = PdfReader(ham)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    _actual_size_print(writer)
    packed = BytesIO()
    writer.write(packed)
    return packed.getvalue()
