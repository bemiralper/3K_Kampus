"""Ölçme PDF’lerinde ortak marka başlığı / altlık."""
from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, Table, TableStyle

from apps.coaching.application.olcme_karne_pdf import (
    BRAND, BRAND_DARK, INK, LINE, MUTED, _logo_path,
)

PAGE_W, PAGE_H = A4
SIDE = 14 * mm
CONTENT_W = PAGE_W - 2 * SIDE


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
