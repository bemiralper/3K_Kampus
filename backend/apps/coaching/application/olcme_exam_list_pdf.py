"""Filtrelenmiş sınav listesi PDF — dikey kartlar, markalı başlık."""
from __future__ import annotations

import io
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.coaching.application.olcme_karne_pdf import (
    AMBER, BRAND, BRAND_SOFT, GREEN, INK, LINE, MUTED, SURFACE, _register_fonts,
)
from apps.coaching.application.olcme_pdf_brand import (
    CONTENT_W, SIDE, brand_header, draw_page_chrome, header_styles, _escape,
)

STATUS_LABELS = {
    'DRAFT': 'Taslak',
    'ANSWER_KEY_READY': 'Cevap Anahtarı',
    'RESULTS_UPLOADED': 'Sonuçlar Yüklendi',
    'COMPLETED': 'Tamamlandı',
}
STATUS_TONE = {
    'DRAFT': MUTED,
    'ANSWER_KEY_READY': BRAND,
    'RESULTS_UPLOADED': AMBER,
    'COMPLETED': GREEN,
}


def _fmt_date(value) -> str:
    if not value:
        return '—'
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime('%d.%m.%Y')
    raw = str(value)
    try:
        return datetime.fromisoformat(raw.replace('Z', '+00:00')).strftime('%d.%m.%Y')
    except ValueError:
        return raw[:10]


def _today() -> str:
    return date.today().strftime('%d.%m.%Y')


def _filter_line(filters: dict | None) -> str:
    if not filters:
        return ''
    parts = []
    search = (filters.get('search') or '').strip()
    exam_type = (filters.get('exam_type') or '').strip()
    status = (filters.get('status') or '').strip()
    if search:
        parts.append(f'Arama: {search}')
    if exam_type:
        parts.append(f'Tür: {exam_type}')
    if status:
        parts.append(f'Aşama: {STATUS_LABELS.get(status, status)}')
    return '  ·  '.join(parts)


def _styles(font: str, font_bold: str):
    def mk(name, *, size, bold=False, color=INK, align=0, leading=None):
        return ParagraphStyle(
            name, fontName=font_bold if bold else font, fontSize=size,
            leading=leading or size * 1.32,
            textColor=colors.HexColor(color), alignment=align,
        )

    return {
        'idx': mk('el_idx', size=11, bold=True, color='#FFFFFF', align=1, leading=14),
        'name': mk('el_name', size=10, bold=True, leading=13),
        'meta': mk('el_meta', size=8, color=INK, leading=11),
        'sub': mk('el_sub', size=7.5, color=MUTED, leading=10),
        'empty': mk('el_empty', size=9, color=MUTED, align=1),
        **{
            f'st_{code}': mk(f'el_st_{code}', size=8, bold=True, color=tone, align=2)
            for code, tone in STATUS_TONE.items()
        },
        'st_': mk('el_st_blank', size=8, bold=True, color=INK, align=2),
    }


def _exam_card(index: int, row: dict, styles) -> Table:
    status = row.get('status') or ''
    status_label = row.get('status_display') or STATUS_LABELS.get(status, status or '—')
    typ = row.get('exam_type_display') or row.get('exam_type') or ''
    answers = row.get('answer_count') or 0
    questions = row.get('total_questions') or 0
    classes = (row.get('sinif_display') or '').strip()
    exam_date = _fmt_date(row.get('exam_date'))
    bits = [p for p in (
        exam_date if exam_date != '—' else None,
        typ,
        f'{questions} soru' if questions else None,
        f'{answers} sonuç' if answers else None,
    ) if p]
    body = [
        Paragraph(_escape(row.get('name') or '—'), styles['name']),
        Paragraph(_escape('  ·  '.join(bits) or '—'), styles['meta']),
    ]
    if classes:
        body.append(Paragraph(_escape(classes), styles['sub']))

    card = Table(
        [[
            Paragraph(f'{index:02d}', styles['idx']),
            body,
            Paragraph(_escape(str(status_label)), styles.get(f'st_{status}', styles['st_'])),
        ]],
        colWidths=[14 * mm, CONTENT_W - 48 * mm, 34 * mm],
    )
    card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor(BRAND)),
        ('BACKGROUND', (1, 0), (-1, 0), colors.HexColor(SURFACE)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 4),
        ('RIGHTPADDING', (0, 0), (0, 0), 4),
        ('LEFTPADDING', (1, 0), (1, 0), 10),
        ('RIGHTPADDING', (1, 0), (1, 0), 8),
        ('LEFTPADDING', (2, 0), (2, 0), 4),
        ('RIGHTPADDING', (2, 0), (2, 0), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)),
        ('LINEBEFORE', (1, 0), (1, 0), 0, colors.HexColor(BRAND)),
    ]))
    return card


def render_exam_list_pdf(rows: list[dict], *, filters: dict | None = None) -> bytes:
    font, font_bold = _register_fonts()
    hs = header_styles(font, font_bold)
    styles = _styles(font, font_bold)

    kurum = ''
    year = ''
    if rows:
        kurum = (rows[0].get('kurum_adi') or '').strip()
        year = (rows[0].get('egitim_yili_str') or '').strip()
    meta = '  ·  '.join(p for p in (f'{len(rows)} sınav', _today(), kurum) if p)
    strip = '  ·  '.join(p for p in (year, _filter_line(filters)) if p)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=SIDE, rightMargin=SIDE,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title='Sınav listesi',
    )
    story = []
    story.extend(brand_header(
        hs,
        kicker='Ölçme ve değerlendirme',
        title='Sınav listesi',
        meta=meta,
        strip=strip,
    ))
    story.append(Spacer(1, 10))

    if not rows:
        empty = Table(
            [[Paragraph('Filtrelere uyan sınav yok.', styles['empty'])]],
            colWidths=[CONTENT_W],
        )
        empty.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_SOFT)),
            ('TOPPADDING', (0, 0), (-1, -1), 16),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
        ]))
        story.append(empty)
    else:
        for i, row in enumerate(rows, start=1):
            story.append(_exam_card(i, row, styles))
            story.append(Spacer(1, 5))

    doc.build(
        story,
        onFirstPage=lambda c, d: draw_page_chrome(c, d, font, '3K Kampüs · Sınav listesi'),
        onLaterPages=lambda c, d: draw_page_chrome(
            c, d, font, '3K Kampüs · Sınav listesi',
            running_title='Sınav listesi', font_bold=font_bold,
        ),
    )
    return buf.getvalue()
