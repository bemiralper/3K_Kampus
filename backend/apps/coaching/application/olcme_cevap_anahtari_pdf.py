"""Sınav cevap anahtarı PDF — kesilerek dağıtılabilen kompakt ızgara tablolar."""
from __future__ import annotations

import io
from collections import OrderedDict

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.coaching.application.olcme_karne_pdf import (
    BRAND, BRAND_DARK, BRAND_SOFT, INK, LINE, MUTED,
    _logo_path, _register_fonts, _safe_filename,
)
from apps.coaching.application.olcme_pdf_brand import _escape

GRID_COLS = 12
ALLOWED_COPIES = (1, 2, 4, 6, 8)
BOOKLET_ORDER = {'': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4}

NAVY = BRAND
HEADER_H = 24 * mm
FOOTER_H = 12 * mm
_MONTHS = (
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
)
SUBJECT_FILL = {
    'A': '#D4E6F4',
    '': '#D4E6F4',
    'B': '#B7D3EA',
    'C': BRAND_SOFT,
    'D': '#9EC4E0',
}

_LAYOUT = {
    1: {'cols': 1, 'rows': 1},
    2: {'cols': 2, 'rows': 1},
    4: {'cols': 2, 'rows': 2},
    6: {'cols': 2, 'rows': 3},
    8: {'cols': 2, 'rows': 4},
}


def cevap_anahtari_filename(exam) -> str:
    return f'{_safe_filename(getattr(exam, "name", None) or "sinav")}_cevap_anahtari.pdf'


def parse_copies(value) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 1
    return n if n in ALLOWED_COPIES else 1


def _choice_label(item) -> str:
    if getattr(item, 'is_cancelled', False):
        return 'İ'
    raw = (getattr(item, 'correct_answer', None) or '').strip().upper()
    if raw in ('INVALID', 'IPTAL', 'İPTAL', 'X'):
        return 'İ'
    if raw in ('EMPTY', 'BOS', 'BOŞ', '-'):
        return '—'
    return raw or '—'


def cell_text(item, local_n=None) -> str:
    n = local_n if local_n is not None else item.question_number
    return f'{n}.{_choice_label(item)}'


def _format_tr_date(value) -> str:
    if not value:
        return ''
    if hasattr(value, 'day') and hasattr(value, 'month'):
        d = value
    else:
        try:
            from datetime import date as date_cls
            d = date_cls.fromisoformat(str(value)[:10])
        except (TypeError, ValueError):
            return str(value)
    return f'{d.day} {_MONTHS[d.month - 1]} {d.year}'


def exam_date_label(exam) -> str:
    raw = getattr(exam, 'exam_date', None)
    if not raw:
        sessions = getattr(exam, 'exam_sessions', None)
        if sessions is not None:
            first = sessions.order_by('order', 'id').first()
            raw = getattr(first, 'session_date', None) if first else None
    return _format_tr_date(raw)


def booklet_header_text(exam, key) -> str:
    letter = (getattr(key, 'booklet', None) or '').strip().upper()
    if letter:
        return f'{letter} Kitapçığı'
    return 'Cevap Anahtarı'


def subject_fill(booklet: str) -> str:
    return SUBJECT_FILL.get((booklet or '').strip().upper(), SUBJECT_FILL['A'])


def _fold_name(name: str) -> str:
    table = str.maketrans({
        'ı': 'i', 'İ': 'i', 'I': 'i',
        'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
        'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o',
        'ç': 'c', 'Ç': 'c',
    })
    return (name or '').translate(table).strip().lower()


# Alt ders → ana TYT bloğu (FK / aralık yoksa isimle birleştir)
_PARENT_FOLD = {
    'geometri': 'temel matematik',
    'matematik': 'temel matematik',
    't. matematik': 'temel matematik',
    'tarih': 'sosyal bilimler',
    'cografya': 'sosyal bilimler',
    'felsefe': 'sosyal bilimler',
    'din kulturu': 'sosyal bilimler',
    'din kulturu ve ahlak bilgisi': 'sosyal bilimler',
    'dkab': 'sosyal bilimler',
    'sosyal': 'sosyal bilimler',
    'fizik': 'fen bilimleri',
    'kimya': 'fen bilimleri',
    'biyoloji': 'fen bilimleri',
    'fen': 'fen bilimleri',
}


def _exam_of(items):
    for item in items:
        sec = getattr(item, 'section', None)
        if sec is not None:
            return getattr(sec, 'exam', None)
    return None


def _collect_sections(items, exam=None):
    sections = []
    seen: set[int] = set()
    exam = exam or _exam_of(items)
    for item in items:
        sec = getattr(item, 'section', None)
        if sec is None:
            continue
        for candidate in (sec, getattr(sec, 'parent_section', None)):
            if candidate is None:
                continue
            mark = id(candidate)
            if mark in seen:
                continue
            seen.add(mark)
            sections.append(candidate)
    if exam is not None:
        for sec in exam.sections.all():
            mark = id(sec)
            if mark in seen:
                continue
            seen.add(mark)
            sections.append(sec)
    mains = [s for s in sections if not getattr(s, 'is_sub_section', False)]
    mains.sort(key=lambda s: (getattr(s, 'order', 999), getattr(s, 'question_start', 999)))
    return sections, mains


def _parent_section(item, mains=None):
    """Alt bölümleri (Geometri, Tarih…) ana derse (Temel Matematik, Sosyal) bağlar."""
    sec = getattr(item, 'section', None)
    if sec is None:
        return None
    parent = getattr(sec, 'parent_section', None)
    if parent is not None:
        return parent
    return _fold_section(sec, mains)


def _fold_section(sec, mains=None):
    if sec is None:
        return None
    if mains:
        start = getattr(sec, 'question_start', None)
        end = getattr(sec, 'question_end', None)
        if start and end:
            for main in mains:
                if main is sec:
                    continue
                m0 = getattr(main, 'question_start', None)
                m1 = getattr(main, 'question_end', None)
                if not m0 or not m1:
                    continue
                if m0 <= start and end <= m1 and (end - start) < (m1 - m0):
                    return main
        target = _PARENT_FOLD.get(_fold_name(getattr(sec, 'name', '') or ''))
        if target:
            for main in mains:
                if _fold_name(getattr(main, 'name', '') or '') == target:
                    return main
    return sec


def _group_items(items, *, include_empty=False):
    """Ana ders blokları; her blok kendi içinde 1'den numaralanır."""
    exam = _exam_of(items)
    _, mains = _collect_sections(items, exam if include_empty else None)
    buckets: OrderedDict[int | str, dict] = OrderedDict()
    if include_empty:
        for main in mains:
            name = getattr(main, 'name', None) or 'Soru'
            key = getattr(main, 'pk', None)
            if key is None:
                key = name
            buckets[key] = {
                'name': name,
                'items': [],
                'start': getattr(main, 'question_start', None),
                'end': getattr(main, 'question_end', None),
                'locked': True,
                'order': (
                    getattr(main, 'order', 999),
                    getattr(main, 'question_start', 999),
                    name,
                ),
            }
    for item in items:
        sec = _parent_section(item, mains)
        name = getattr(sec, 'name', None) or 'Soru'
        key = getattr(sec, 'pk', None)
        if key is None:
            key = name
        if key not in buckets:
            buckets[key] = {
                'name': name,
                'items': [],
                'start': getattr(sec, 'question_start', None),
                'end': getattr(sec, 'question_end', None),
                'locked': False,
                'order': (
                    getattr(sec, 'order', 999),
                    getattr(sec, 'question_start', 999),
                    name,
                ),
            }
        buckets[key]['items'].append(item)
        if not buckets[key].get('locked'):
            item_sec = getattr(item, 'section', None)
            if item_sec is not None:
                s1 = getattr(item_sec, 'question_end', None)
                if s1 and (buckets[key]['end'] is None or s1 > buckets[key]['end']):
                    buckets[key]['end'] = s1
                s0 = getattr(item_sec, 'question_start', None)
                if s0 and buckets[key]['start'] is None:
                    buckets[key]['start'] = s0
    groups: OrderedDict[str, dict] = OrderedDict()
    for bucket in sorted(buckets.values(), key=lambda row: row['order']):
        if not bucket['items'] and not include_empty:
            continue
        bucket['items'].sort(key=lambda i: (i.question_number, getattr(i, 'id', 0) or 0))
        groups[bucket['name']] = bucket
    return groups


def _item_slots(items: list, question_start=None, question_end=None):
    """Ders içinde 1…n. Aralık doluysa soru numarasına oturur; değilse sırayla + boş pad."""
    ordered = sorted(items, key=lambda i: (i.question_number, getattr(i, 'id', 0) or 0))
    start, end = question_start, question_end
    if start and end and end >= start:
        span = end - start + 1
        in_range = [i for i in ordered if start <= i.question_number <= end]
        if in_range and len(in_range) >= max(2, int(span * 0.35)):
            by_q = {i.question_number: i for i in in_range}
            return [(by_q.get(q), q - start + 1) for q in range(start, end + 1)]
        slots = [(item, i + 1) for i, item in enumerate(ordered)]
        if span > len(slots):
            slots.extend((None, i) for i in range(len(slots) + 1, span + 1))
        return slots
    return [(item, i + 1) for i, item in enumerate(ordered)]


def padded_section_rows(items: list, question_start=None, question_end=None) -> list[list]:
    """12 sütun; ders içinde 1'den numaralanır, son satır boş hücrelerle dolar."""
    if items and question_start is None and isinstance(items, dict):
        question_start = items.get('start')
        question_end = items.get('end')
        items = items.get('items') or []
    slots = _item_slots(items, question_start, question_end)
    rows: list[list] = []
    for start in range(0, len(slots), GRID_COLS):
        chunk = slots[start:start + GRID_COLS]
        cells = [
            cell_text(item, local) if item is not None else ''
            for item, local in chunk
        ]
        cells.extend([''] * (GRID_COLS - len(cells)))
        rows.append(cells)
    return rows


def _group_rows(group) -> list[list]:
    if isinstance(group, dict):
        return padded_section_rows(
            group.get('items') or [],
            question_start=group.get('start'),
            question_end=group.get('end'),
        )
    return padded_section_rows(group)


def _collect_keys(exam, booklets=None):
    from apps.coaching.olcme_degerlendirme.models import AnswerKey

    keys = list(
        AnswerKey.objects.filter(exam=exam)
        .prefetch_related('items__section__parent_section')
        .order_by('booklet', 'id')
    )
    keys.sort(key=lambda k: BOOKLET_ORDER.get((k.booklet or '').upper(), 9))
    if booklets:
        wanted = {(b or '').strip().upper() for b in booklets if str(b).strip()}
        keys = [k for k in keys if (k.booklet or '').strip().upper() in wanted]
    return keys


def _tile_scale(copies: int, side_by_side: bool = False) -> dict:
    density = copies
    if side_by_side and copies == 1:
        density = 2
    if density <= 1:
        return {'header': 8, 'subject': 7.5, 'cell': 7, 'hpad': 2, 'vpad': 2.2}
    if density == 2:
        return {'header': 6.5, 'subject': 6.2, 'cell': 5.6, 'hpad': 1.4, 'vpad': 1.4}
    if density == 4:
        return {'header': 5.6, 'subject': 5.2, 'cell': 4.6, 'hpad': 1.0, 'vpad': 1.0}
    if density == 6:
        return {'header': 5.0, 'subject': 4.6, 'cell': 4.0, 'hpad': 0.7, 'vpad': 0.7}
    return {'header': 4.6, 'subject': 4.2, 'cell': 3.6, 'hpad': 0.5, 'vpad': 0.55}


def _styles(font: str, font_bold: str, scale: dict):
    return {
        'hdr': ParagraphStyle(
            'ak_hdr', fontName=font_bold, fontSize=scale['header'],
            leading=scale['header'] + 1.5, textColor=colors.white, alignment=1,
        ),
        'sec': ParagraphStyle(
            'ak_sec', fontName=font_bold, fontSize=scale['subject'],
            leading=scale['subject'] + 1.2, textColor=colors.HexColor(BRAND_DARK), alignment=1,
        ),
        'cell': ParagraphStyle(
            'ak_cell', fontName=font, fontSize=scale['cell'],
            leading=scale['cell'] + 1.0, textColor=colors.HexColor(INK), alignment=1,
        ),
    }


def _row_kinds(items) -> list[str]:
    kinds = ['header']
    for group in _group_items(items, include_empty=True).values():
        kinds.append('subject')
        kinds.extend(['data'] * len(_group_rows(group)))
    return kinds


def _natural_row_heights(kinds: list[str], scale: dict) -> list[float]:
    sizes = {
        'header': scale['header'] + scale['vpad'] * 2 + 6,
        'subject': scale['subject'] + scale['vpad'] * 2 + 4,
        'data': scale['cell'] + scale['vpad'] * 2 + 3.2,
    }
    return [sizes[kind] for kind in kinds]


def _fit_row_heights(kinds: list[str], scale: dict, target_h: float | None) -> list[float]:
    """Doğal satır yüksekliği; yalnızca taşarsa küçültür, asla şişirmez."""
    heights = _natural_row_heights(kinds, scale)
    total = sum(heights) or 1
    if target_h and total > target_h:
        factor = target_h / total
        return [h * factor for h in heights]
    return heights


def _booklet_table(exam, key, items, width, styles, scale, *, height=None, font: str):
    letter = (getattr(key, 'booklet', None) or '').strip().upper()
    fill = subject_fill(letter)
    groups = _group_items(items, include_empty=True)
    data = [[Paragraph(_escape(booklet_header_text(exam, key)), styles['hdr'])] + [''] * (GRID_COLS - 1)]
    kinds = ['header']
    for section_name, group in groups.items():
        title = (section_name or 'Soru').strip().upper()
        data.append([Paragraph(_escape(title), styles['sec'])] + [''] * (GRID_COLS - 1))
        kinds.append('subject')
        for row in _group_rows(group):
            data.append([Paragraph(_escape(cell), styles['cell']) if cell else '' for cell in row])
            kinds.append('data')

    col_w = width / GRID_COLS
    row_h = _fit_row_heights(kinds, scale, height)
    content_h = sum(row_h)
    tbl = Table(data, colWidths=[col_w] * GRID_COLS, rowHeights=row_h)
    cmds = [
        ('SPAN', (0, 0), (-1, 0)),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(BRAND)),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), font),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.black),
        ('BOX', (0, 0), (-1, -1), 0.45, colors.black),
        ('LEFTPADDING', (0, 0), (-1, -1), scale['hpad']),
        ('RIGHTPADDING', (0, 0), (-1, -1), scale['hpad']),
        ('TOPPADDING', (0, 0), (-1, -1), scale['vpad']),
        ('BOTTOMPADDING', (0, 0), (-1, -1), scale['vpad']),
    ]
    r = 1
    for group in groups.values():
        cmds.append(('SPAN', (0, r), (-1, r)))
        cmds.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor(fill)))
        r += 1 + len(_group_rows(group))
    tbl.setStyle(TableStyle(cmds))
    if height and content_h < height - 0.5:
        wrap = Table([[tbl]], colWidths=[width], rowHeights=[height])
        wrap.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return wrap
    return tbl


class _VirtualItem:
    __slots__ = ('section', 'question_number', 'correct_answer', 'is_cancelled', 'id')

    def __init__(self, section, question_number, source):
        self.section = section
        self.question_number = question_number
        self.correct_answer = getattr(source, 'correct_answer', '')
        self.is_cancelled = getattr(source, 'is_cancelled', False)
        self.id = getattr(source, 'id', 0) or 0


def _items_for_b_from_a(a_items: list) -> list:
    """A satırındaki b_question_number ile B kitapçığını tam üretir."""
    if not any(getattr(item, 'b_question_number', None) for item in a_items):
        return []
    _, mains = _collect_sections(a_items)
    virtual = []
    for item in a_items:
        b_q = getattr(item, 'b_question_number', None)
        if not b_q:
            continue
        parent = _parent_section(item, mains)
        start = getattr(parent, 'question_start', None) or 1
        virtual.append(_VirtualItem(parent, start + int(b_q) - 1, item))
    return virtual


def _key_payloads(exam, keys):
    from apps.coaching.olcme_degerlendirme.models import AnswerKey

    a_items = []
    for key in keys:
        letter = (getattr(key, 'booklet', None) or '').strip().upper()
        if letter in ('', 'A'):
            a_items = list(key.items.all())
            if a_items:
                break
    if not a_items:
        a_key = (
            AnswerKey.objects.filter(exam=exam, booklet__in=['', 'A'])
            .prefetch_related('items__section__parent_section')
            .order_by('booklet', 'id')
            .first()
        )
        if a_key:
            a_items = list(a_key.items.all())
    mapped_b = _items_for_b_from_a(a_items)
    payloads = []
    for key in keys:
        letter = (getattr(key, 'booklet', None) or '').strip().upper()
        if letter == 'B' and mapped_b:
            items = mapped_b
        else:
            items = list(key.items.order_by('question_number', 'id'))
        if items:
            payloads.append((key, items))
    return payloads


def _draw_page_chrome(
    canvas, doc, *, exam_name: str, exam_date: str, font: str, font_bold: str, copies: int,
):
    page_w, page_h = A4
    canvas.saveState()
    canvas.setFillColor(colors.HexColor(BRAND))
    canvas.rect(0, page_h - HEADER_H, page_w, HEADER_H, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor(BRAND_DARK))
    canvas.rect(0, page_h - HEADER_H, page_w, 2.4, fill=1, stroke=0)

    logo = _logo_path()
    if logo:
        logo_h = HEADER_H - 12
        logo_w = logo_h * (546 / 407)
        if logo_w > 52:
            logo_w = 52
            logo_h = logo_w * (407 / 546)
        try:
            canvas.drawImage(
                str(logo), 10, page_h - HEADER_H + (HEADER_H - logo_h) / 2,
                width=logo_w, height=logo_h, mask='auto',
                preserveAspectRatio=True, anchor='sw',
            )
        except Exception:
            pass

    name = (exam_name or 'Sınav').strip()
    name_size = 16
    cap_size = 9.5
    max_name_w = page_w - 170
    canvas.setFont(font_bold, name_size)
    while name_size > 10 and canvas.stringWidth(name, font_bold, name_size) > max_name_w:
        name_size -= 0.4
        canvas.setFont(font_bold, name_size)
    while name and canvas.stringWidth(name, font_bold, name_size) > max_name_w:
        name = name[:-1]
    block_h = name_size + 4 + cap_size
    name_y = page_h - HEADER_H / 2 + block_h / 2 - name_size
    canvas.setFillColor(colors.white)
    canvas.setFont(font_bold, name_size)
    canvas.drawCentredString(page_w / 2, name_y, name)
    canvas.setFillColor(colors.HexColor('#E7F0F8'))
    canvas.setFont(font, cap_size)
    canvas.drawCentredString(page_w / 2, name_y - cap_size - 3, 'Cevap anahtarı')

    if exam_date:
        canvas.setFillColor(colors.HexColor('#E7F0F8'))
        canvas.setFont(font, 7)
        canvas.drawRightString(page_w - 12, page_h - HEADER_H / 2 - 2.5, exam_date)

    canvas.setStrokeColor(colors.HexColor(LINE))
    canvas.setLineWidth(0.4)
    canvas.line(10, FOOTER_H - 2, page_w - 10, FOOTER_H - 2)
    canvas.setFillColor(colors.HexColor(MUTED))
    canvas.setFont(font, 7)
    canvas.drawString(12, 8, '3K Kampüs  ·  Ölçme ve Değerlendirme')
    if copies > 1:
        canvas.drawRightString(page_w - 12, 8, 'Kesim payı')
    else:
        canvas.drawRightString(page_w - 12, 8, f'Sayfa {canvas.getPageNumber()}')
    canvas.restoreState()


def _gapped_grid(cells: list, cols: int, rows: int, tile_w: float, tile_h: float, gap: float):
    """Kartlar arasına boşluk kolon/satır koyar."""
    grid = []
    idx = 0
    for r in range(rows):
        row = []
        for c in range(cols):
            row.append(cells[idx] if idx < len(cells) else '')
            idx += 1
            if c < cols - 1:
                row.append('')
        grid.append(row)
        if r < rows - 1:
            grid.append([''] * (cols * 2 - 1))
    col_ws = []
    for c in range(cols):
        col_ws.append(tile_w)
        if c < cols - 1:
            col_ws.append(gap)
    row_hs = []
    for r in range(rows):
        row_hs.append(tile_h)
        if r < rows - 1:
            row_hs.append(gap)
    outer = Table(grid, colWidths=col_ws, rowHeights=row_hs)
    outer.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return outer


def render_cevap_anahtari_pdf(exam, *, copies_per_page: int = 1, booklets=None) -> bytes:
    from apps.coaching.olcme_degerlendirme.models import AnswerKeyItem

    copies = parse_copies(copies_per_page)
    keys = _collect_keys(exam, booklets)
    if not keys:
        raise ValueError('Cevap anahtarı bulunamadı.')
    if not AnswerKeyItem.objects.filter(answer_key__in=keys).exists():
        raise ValueError('Cevap anahtarı satırı yok.')

    payloads = _key_payloads(exam, keys)
    if not payloads:
        raise ValueError('Cevap anahtarı satırı yok.')

    font, font_bold = _register_fonts()
    page_w, page_h = A4
    side = 8 * mm
    top_m = HEADER_H + 2
    bot_m = FOOTER_H
    gap = 8 * mm
    usable_w = page_w - 2 * side - 14
    usable_h = page_h - top_m - bot_m - 14

    side_by_side = copies == 1 and len(payloads) > 1
    if side_by_side:
        grid_cols, grid_rows = 2, 1
        sequence = payloads[:2]
        extra = payloads[2:]
        tile_h = None
    elif copies == 1:
        grid_cols, grid_rows = 1, 1
        sequence = payloads
        extra = []
        tile_h = None
    else:
        layout = _LAYOUT[copies]
        grid_cols, grid_rows = layout['cols'], layout['rows']
        sequence = [payloads[i % len(payloads)] for i in range(copies)]
        extra = []
        tile_h = (usable_h - gap * (grid_rows - 1)) / grid_rows

    tile_w = (usable_w - gap * (grid_cols - 1)) / grid_cols
    scale = _tile_scale(copies, side_by_side=side_by_side)
    styles = _styles(font, font_bold, scale)
    if side_by_side:
        tile_h = max(
            sum(_natural_row_heights(_row_kinds(items), scale))
            for _, items in sequence
        )

    def tile(payload, width, height):
        key, items = payload
        return _booklet_table(
            exam, key, items, width, styles, scale, height=height, font=font,
        )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=side, rightMargin=side,
        topMargin=top_m, bottomMargin=bot_m,
        title=f'{exam.name} Cevap Anahtarı',
    )
    story = []

    if copies == 1 and not side_by_side:
        for payload in sequence:
            story.append(tile(payload, usable_w, None))
            story.append(Spacer(1, 8))
    else:
        cells = []
        for payload in sequence:
            cells.append(tile(payload, tile_w, tile_h))
        while len(cells) < grid_cols * grid_rows:
            cells.append('')
        story.append(_gapped_grid(cells, grid_cols, grid_rows, tile_w, tile_h, gap))
        for payload in extra:
            story.append(Spacer(1, 8))
            story.append(tile(payload, usable_w, None))

    def on_page(canvas, _doc):
        _draw_page_chrome(
            canvas, _doc,
            exam_name=getattr(exam, 'name', '') or 'Sınav',
            exam_date=exam_date_label(exam),
            font=font, font_bold=font_bold, copies=copies,
        )

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
