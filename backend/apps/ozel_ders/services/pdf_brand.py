"""Özel ders PDF’lerinde ortak marka başlığı / altlık."""
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, Table, TableStyle

BRAND = '#0262A7'
BRAND_DARK = '#014A7F'
INK = '#0F172A'
LINE = '#DCE5EF'
MUTED = '#94A3B8'

PAGE_W, PAGE_H = A4
SIDE = 14 * mm
CONTENT_W = PAGE_W - 2 * SIDE


def _logo_path() -> Path | None:
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'img' / 'beyaz-logo.png',
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / 'beyaz-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _font_dirs() -> list[Path]:
    base = Path(settings.BASE_DIR)
    return [
        base / 'static' / 'fonts',
        base.parent / 'frontend' / 'public' / 'fonts',
    ]


def register_fonts() -> tuple[str, str]:
    """Roboto varsa onu, yoksa ReportLab Vera ailesini kaydeder."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    registered = pdfmetrics.getRegisteredFontNames()
    if 'Roboto' in registered and 'Roboto-Bold' in registered:
        return 'Roboto', 'Roboto-Bold'

    for directory in _font_dirs():
        regular = directory / 'Roboto-Regular.ttf'
        bold = directory / 'Roboto-Bold.ttf'
        if regular.is_file() and bold.is_file():
            try:
                if 'Roboto' not in registered:
                    pdfmetrics.registerFont(TTFont('Roboto', str(regular)))
                if 'Roboto-Bold' not in registered:
                    pdfmetrics.registerFont(TTFont('Roboto-Bold', str(bold)))
                return 'Roboto', 'Roboto-Bold'
            except Exception:
                break

    import reportlab
    fallback = Path(reportlab.__file__).parent / 'fonts'
    if 'Vera' not in registered:
        pdfmetrics.registerFont(TTFont('Vera', str(fallback / 'Vera.ttf')))
    if 'VeraBd' not in registered:
        pdfmetrics.registerFont(TTFont('VeraBd', str(fallback / 'VeraBd.ttf')))
    return 'Vera', 'VeraBd'


def header_styles(font: str, font_bold: str) -> dict[str, ParagraphStyle]:
    def mk(name, *, size, bold=False, color='#FFFFFF', align=0, leading=None):
        return ParagraphStyle(
            name, fontName=font_bold if bold else font, fontSize=size,
            leading=leading or size * 1.28,
            textColor=colors.HexColor(color), alignment=align,
        )

    return {
        'kicker': mk('ob_kicker', size=7.5, bold=True, color='#C5D8EB'),
        'title': mk('ob_title', size=13, bold=True, leading=16),
        'meta': mk('ob_meta', size=8, color='#D6E4F2', leading=11),
        'strip': ParagraphStyle(
            'ob_strip', fontName=font, fontSize=8, leading=11,
            textColor=colors.HexColor(INK),
        ),
    }


def brand_header(styles, *, kicker: str, title: str, meta: str, strip: str = ''):
    """Mavi marka şeridi + logo; altında isteğe bağlı bilgi satırı."""
    logo = _logo_path()
    if logo:
        mark = Image(str(logo), width=30 * mm, height=22 * mm)
    else:
        mark = Paragraph('3K Kampüs', styles['title'])

    text = [
        Paragraph(_escape(kicker).upper(), styles['kicker']),
        Paragraph(_escape(title), styles['title']),
    ]
    if meta:
        text.append(Paragraph(_escape(meta), styles['meta']))

    inner = Table(
        [[mark, text]],
        colWidths=[36 * mm, CONTENT_W - 36 * mm],
    )
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 10),
        ('RIGHTPADDING', (0, 0), (0, 0), 6),
        ('LEFTPADDING', (1, 0), (1, 0), 4),
        ('RIGHTPADDING', (1, 0), (1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    accent = Table([['']], colWidths=[CONTENT_W])
    accent.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_DARK)),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('LINEBELOW', (0, 0), (-1, -1), 3, colors.HexColor(BRAND_DARK)),
    ]))
    flow = [inner, accent]
    if strip:
        info = Table([[Paragraph(_escape(strip), styles['strip'])]], colWidths=[CONTENT_W])
        info.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#EAF2FA')),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ]))
        flow.append(info)
    return flow


def draw_page_chrome(
    canvas, doc, font: str, caption: str = '3K Kampüs',
    *, running_title: str = '', font_bold: str | None = None,
):
    canvas.saveState()
    if running_title:
        canvas.setFillColor(colors.HexColor(BRAND))
        canvas.rect(0, PAGE_H - 16 * mm, PAGE_W, 16 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor(BRAND_DARK))
        canvas.rect(0, PAGE_H - 16 * mm, PAGE_W, 2.2, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont(font_bold or font, 9)
        canvas.drawString(SIDE, PAGE_H - 10.5 * mm, running_title[:72])
        canvas.setFont(font, 8)
        canvas.drawRightString(PAGE_W - SIDE, PAGE_H - 10.5 * mm, str(canvas.getPageNumber()))
    else:
        canvas.setFillColor(colors.HexColor(BRAND))
        canvas.rect(0, PAGE_H - 3, PAGE_W, 3, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor(LINE))
    canvas.setLineWidth(0.4)
    canvas.line(SIDE, 12 * mm, PAGE_W - SIDE, 12 * mm)
    canvas.setFillColor(colors.HexColor(MUTED))
    canvas.setFont(font, 7.5)
    canvas.drawString(SIDE, 8 * mm, caption)
    if not running_title:
        canvas.drawRightString(PAGE_W - SIDE, 8 * mm, str(canvas.getPageNumber()))
    canvas.restoreState()


def _escape(text: str) -> str:
    return (
        (text or '')
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )
