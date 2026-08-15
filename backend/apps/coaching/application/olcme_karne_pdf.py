"""Ölçme — öğrenci sınav sonuç belgesi (karne) PDF."""
from __future__ import annotations

import io
import os
import re
from pathlib import Path

from django.conf import settings

PRIMARY = '#0262A7'
PRIMARY_DARK = '#014A7F'
ROW_ALT = '#F4F8FC'
ROW_MAIN = '#D7E8F6'
RED = '#DC2626'


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r'[^\w\s.\-çğıöşüÇĞİÖŞÜ]', '', name or 'karne', flags=re.UNICODE)
    cleaned = re.sub(r'\s+', '_', cleaned).strip('_')
    return (cleaned or 'karne')[:80]


def karne_filename(data: dict) -> str:
    student = _safe_filename(data.get('student_name') or 'Ogrenci')
    exam = _safe_filename(data.get('exam_name') or 'Sinav')
    return f'{student}_{exam}_karne.pdf'


def _register_fonts():
    import reportlab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    font_dir = os.path.join(os.path.dirname(reportlab.__file__), 'fonts')
    if 'Vera' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('Vera', os.path.join(font_dir, 'Vera.ttf')))
    if 'VeraBd' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('VeraBd', os.path.join(font_dir, 'VeraBd.ttf')))


def _logo_path() -> Path | None:
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'img' / 'beyaz-logo.png',
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / 'beyaz-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def _fmt(n, digits=2):
    if n is None:
        return '—'
    try:
        return f'{float(n):,.{digits}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    except (TypeError, ValueError):
        return '—'


def _fmt_int(n):
    if n is None:
        return '—'
    try:
        return f'{int(n):,}'.replace(',', '.')
    except (TypeError, ValueError):
        return '—'


def render_karne_pdf(data: dict) -> bytes:
    return render_karne_pdf_many([data])


def render_karne_pdf_many(payloads: list[dict]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Image, PageBreak, Paragraph, SimpleDocTemplate,
        Spacer, Table, TableStyle,
    )

    _register_fonts()
    primary = colors.HexColor(PRIMARY)
    primary_dark = colors.HexColor(PRIMARY_DARK)
    row_alt = colors.HexColor(ROW_ALT)
    row_main = colors.HexColor(ROW_MAIN)
    red = colors.HexColor(RED)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=8 * mm, bottomMargin=10 * mm,
    )
    page_w = A4[0] - 20 * mm

    title_style = ParagraphStyle('KarneTitle', fontName='VeraBd', fontSize=13, textColor=colors.white, leading=16)
    sub_style = ParagraphStyle('KarneSub', fontName='Vera', fontSize=8, textColor=colors.white, leading=10)
    exam_style = ParagraphStyle('KarneExam', fontName='VeraBd', fontSize=10, textColor=primary_dark, alignment=1, leading=13)
    th = ParagraphStyle('KarneTh', fontName='VeraBd', fontSize=7, textColor=colors.white, alignment=1, leading=9)
    td = ParagraphStyle('KarneTd', fontName='Vera', fontSize=7, leading=9, alignment=1)
    td_l = ParagraphStyle('KarneTdL', fontName='Vera', fontSize=7, leading=9, alignment=0)
    td_lb = ParagraphStyle('KarneTdLB', fontName='VeraBd', fontSize=7, leading=9, alignment=0)
    small = ParagraphStyle('KarneSmall', fontName='Vera', fontSize=7, textColor=colors.HexColor('#64748B'), alignment=2)

    story = []
    logo = _logo_path()

    for idx, data in enumerate(payloads):
        if idx:
            story.append(PageBreak())
        story.extend(_page_one(
            data, page_w, logo, primary, primary_dark, row_alt, row_main, red,
            title_style, sub_style, exam_style, th, td, td_l, td_lb, small,
            Image, Table, TableStyle, Paragraph, Spacer, colors,
        ))
        story.append(PageBreak())
        story.extend(_page_analysis(
            data, page_w, logo, primary, primary_dark, row_alt, row_main,
            title_style, sub_style, exam_style, th, td, td_l, td_lb,
            Image, Table, TableStyle, Paragraph, Spacer, colors,
        ))
        if data.get('topic_blocks'):
            story.append(PageBreak())
            story.extend(_page_two(
                data, page_w, logo, primary, primary_dark,
                title_style, sub_style, exam_style, th, td, td_l,
                Image, Table, TableStyle, Paragraph, Spacer, colors,
            ))

    doc.build(story)
    return buf.getvalue()


def _format_session_when(data):
    date_s = data.get('session_date')
    time_s = data.get('session_start_time')
    parts = []
    if date_s:
        try:
            from datetime import date as date_cls
            d = date_cls.fromisoformat(str(date_s)[:10])
            months = (
                'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
            )
            parts.append(f'{d.day} {months[d.month - 1]} {d.year}')
        except (TypeError, ValueError):
            parts.append(str(date_s))
    if time_s:
        parts.append(str(time_s)[:5])
    return '  ·  '.join(parts)


def _top3_rank(data):
    try:
        rank = int(data.get('kurum_ici_sira') or 0)
    except (TypeError, ValueError):
        return 0
    return rank if 1 <= rank <= 3 else 0


def _banner(data, page_w, logo, primary, title_style, sub_style, exam_style, Image, Table, TableStyle, Paragraph, Spacer, colors):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm

    sube = (data.get('sube_ad') or data.get('kurum_ad') or '3K KAMPÜS').upper()
    when = _format_session_when(data)
    when_style = ParagraphStyle(
        'KarneBannerWhen', fontName='Vera', fontSize=8,
        textColor=colors.white, alignment=2, leading=11,
    )
    left = []
    if logo:
        logo_w = 26 * mm
        logo_h = logo_w * (407 / 546)
        img = Image(str(logo), width=logo_w, height=logo_h)
        img.hAlign = 'LEFT'
        left.append(img)
    when_w = 48 * mm if when else 0
    logo_w_col = 32 * mm if left else 0
    mid_w = page_w - logo_w_col - when_w
    row = []
    cols = []
    if left:
        row.append(left[0])
        cols.append(logo_w_col)
    row.append(Paragraph(sube, title_style))
    cols.append(mid_w)
    if when:
        row.append(Paragraph(when.replace('  ·  ', '<br/>'), when_style))
        cols.append(when_w)
    banner = Table([row], colWidths=cols)
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), primary),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    exam_bar = Table(
        [[Paragraph((data.get('exam_name') or 'Sınav').upper(), exam_style)]],
        colWidths=[page_w],
    )
    exam_bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#E8F1FA')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    photo_w = 22 * mm
    no_w = 32 * mm
    info = Table(
        [[
            _photo_cell(data, Image, Table, TableStyle, Paragraph, colors),
            _name_cell(data.get('student_name') or '—', _top3_rank(data), colors),
            _no_cell(data.get('raw_student_id') or '—', colors),
        ]],
        colWidths=[photo_w, page_w - photo_w - no_w, no_w],
    )
    info.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor(PRIMARY)),
        ('LINEAFTER', (0, 0), (0, 0), 0.4, colors.HexColor(PRIMARY)),
        ('LINEAFTER', (1, 0), (1, 0), 0.4, colors.HexColor(PRIMARY)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return [banner, exam_bar, info, Spacer(1, 6)]


def _student_initials(name: str) -> str:
    parts = [p for p in (name or '').split() if p]
    if not parts:
        return '?'
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _fitted_photo(path, box_w, box_h, Image):
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as im:
            im = im.convert('RGB')
            src_w, src_h = im.size
            if not src_w or not src_h:
                return None
            target_ratio = box_w / box_h
            src_ratio = src_w / src_h
            if src_ratio > target_ratio:
                new_w = max(1, int(src_h * target_ratio))
                left = (src_w - new_w) // 2
                im = im.crop((left, 0, left + new_w, src_h))
            else:
                new_h = max(1, int(src_w / target_ratio))
                top = (src_h - new_h) // 2
                im = im.crop((0, top, src_w, top + new_h))
            buf = io.BytesIO()
            im.save(buf, format='JPEG', quality=85)
            buf.seek(0)
            return Image(buf, width=box_w, height=box_h)
    except Exception:
        try:
            return Image(path, width=box_w, height=box_h)
        except Exception:
            return None


def _photo_cell(data, Image, Table, TableStyle, Paragraph, colors):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm

    box_w, box_h = 16 * mm, 20 * mm
    path = data.get('profil_foto_path')
    img = _fitted_photo(path, box_w, box_h, Image) if path and os.path.isfile(path) else None
    if img:
        inner = Table([[img]], colWidths=[22 * mm])
        inner.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ]))
        return inner

    initials = _student_initials(data.get('student_name') or '')
    style = ParagraphStyle(
        'KarnePhotoInitials', fontName='VeraBd', fontSize=11,
        textColor=colors.white, alignment=1, leading=14,
    )
    t = Table([[Paragraph(initials, style)]], colWidths=[22 * mm], rowHeights=[box_h + 8])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(PRIMARY)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


def _kurum_rank_label(rank):
    return f'Kurum {rank}. si'


def _medal_chip(rank, colors):
    from reportlab.lib.colors import HexColor, Color
    from reportlab.lib.units import mm
    from reportlab.platypus import Flowable

    class RankBadge(Flowable):
        def __init__(self, seal_rank, size):
            Flowable.__init__(self)
            self.rank = seal_rank
            self.size = size
            self.width = size
            self.height = size * 1.18

        def draw(self):
            palettes = {
                1: '#D4A017',
                2: '#A8B2BD',
                3: '#CD7F32',
            }
            metal = HexColor(palettes[self.rank])
            c = self.canv
            w = self.size
            cx = w / 2.0
            cy = w * 0.58
            r = w * 0.32
            c.setFillColor(metal)
            for dx, rot in ((-1, 25), (1, -25)):
                for i, (oy, ox) in enumerate(((0.38, 0.28), (0.28, 0.34), (0.18, 0.36), (0.08, 0.32), (-0.02, 0.26))):
                    c.saveState()
                    c.translate(cx + dx * w * ox, cy + w * oy)
                    c.rotate(dx * (18 + i * 8))
                    c.ellipse(-2.4, -1.15, 2.4, 1.15, fill=1, stroke=0)
                    c.restoreState()
            p = c.beginPath()
            p.moveTo(cx, cy + r + 5.5)
            p.lineTo(cx + 3.2, cy + r + 1.2)
            p.lineTo(cx - 3.2, cy + r + 1.2)
            p.close()
            c.drawPath(p, fill=1, stroke=0)
            c.circle(cx, cy, r + 1.6, fill=1, stroke=0)
            c.setFillColor(Color(0.1, 0.1, 0.1))
            c.circle(cx, cy, r - 1.4, fill=1, stroke=0)
            c.setStrokeColor(metal)
            c.setLineWidth(0.8)
            c.circle(cx, cy, r - 1.4, fill=0, stroke=1)
            c.setFillColor(metal)
            crown = c.beginPath()
            crown.moveTo(cx - 10, cy - r + 1)
            crown.lineTo(cx - 7, cy - r - 8)
            crown.lineTo(cx - 3.5, cy - r - 1)
            crown.lineTo(cx, cy - r - 11)
            crown.lineTo(cx + 3.5, cy - r - 1)
            crown.lineTo(cx + 7, cy - r - 8)
            crown.lineTo(cx + 10, cy - r + 1)
            crown.close()
            c.drawPath(crown, fill=1, stroke=0)
            c.circle(cx - 7, cy - r - 8, 1.3, fill=1, stroke=0)
            c.circle(cx + 7, cy - r - 8, 1.3, fill=1, stroke=0)
            c.setFont('VeraBd', 12)
            c.drawCentredString(cx, cy - 4, str(self.rank))

    return RankBadge(rank, 18 * mm)


def _name_cell(name, rank, colors):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    val = ParagraphStyle(
        'KarneName', fontName='VeraBd',
        fontSize=13 if rank else 12,
        leading=16 if rank else 15,
        textColor=colors.HexColor(PRIMARY),
    )
    cap_colors = {1: '#B8860B', 2: '#64748B', 3: '#B45309'}
    cap = ParagraphStyle(
        'KarneRankCap', fontName='VeraBd', fontSize=8, leading=11,
        textColor=colors.HexColor(cap_colors.get(rank, PRIMARY)),
    )
    name_p = Paragraph(str(name), val)
    if rank:
        text = Table(
            [[name_p], [Paragraph(_kurum_rank_label(rank), cap)]],
            colWidths=['*'],
        )
        text.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        inner = Table(
            [[_medal_chip(rank, colors), text]],
            colWidths=[20 * mm, '*'],
        )
        inner.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        content = inner
    else:
        content = name_p
    t = Table([[content]], colWidths=['*'])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
    ]))
    return t


def _no_cell(value, colors):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, Table, TableStyle

    lab = ParagraphStyle(
        'KarneNoL', fontName='VeraBd', fontSize=6.5,
        textColor=colors.HexColor(PRIMARY_DARK), alignment=2, leading=8,
    )
    val = ParagraphStyle('KarneNoV', fontName='VeraBd', fontSize=11, alignment=2, leading=14)
    t = Table(
        [[Paragraph('ÖĞR. NO', lab)], [Paragraph(str(value), val)]],
        colWidths=['*'],
    )
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (0, 0), 6),
        ('BOTTOMPADDING', (0, -1), (0, -1), 6),
        ('TOPPADDING', (0, 1), (0, 1), 0),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
    ]))
    return t


def _page_one(
    data, page_w, logo, primary, primary_dark, row_alt, row_main, red,
    title_style, sub_style, exam_style, th, td, td_l, td_lb, small,
    Image, Table, TableStyle, Paragraph, Spacer, colors,
):
    flow = _banner(data, page_w, logo, primary, title_style, sub_style, exam_style, Image, Table, TableStyle, Paragraph, Spacer, colors)

    boxes = [
        ('Soru', _fmt_int(data.get('total_questions'))),
        ('Doğru', _fmt_int(data.get('total_correct'))),
        ('Yanlış', _fmt_int(data.get('total_wrong'))),
        ('Boş', _fmt_int(data.get('total_empty'))),
        ('Net', _fmt(data.get('toplam_net'), 2)),
    ]
    box_w = page_w / 5
    box_cells = []
    for label, value in boxes:
        inner = Table(
            [[Paragraph(label.upper(), ParagraphStyleMini(colors))], [Paragraph(str(value), ParagraphStyleBig())]],
            colWidths=[box_w - 4],
        )
        inner.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        box_cells.append(inner)
    summary = Table([box_cells], colWidths=[box_w] * 5)
    summary.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor('#D6E4F0')),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#D6E4F0')),
        ('LINEABOVE', (0, 0), (-1, 0), 2, primary),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    flow += [summary, Spacer(1, 4)]
    flow.append(Paragraph(
        f"Tahmini sıralama yılı: {data.get('referans_yil') or '—'}  ·  Puan sıralı",
        small,
    ))
    flow.append(Spacer(1, 3))

    is_ayt = data.get('exam_type') == 'YKS_AYT'
    type_label = data.get('exam_type_label') or ('AYT' if is_ayt else 'TYT')
    rank_header = [
        [Paragraph('Puan Türü', th), Paragraph('Puan', th), Paragraph('Kurum Ort.', th),
         Paragraph('Sınıf', th), Paragraph('Kurum', th), Paragraph('Tah. TR', th)],
    ]
    rank_rows = list(rank_header)
    if is_ayt and data.get('puan_turleri'):
        avgs = data.get('puan_turleri_avgs') or {}
        first = True
        for pt, label in (('SAY', 'SAY'), ('EA', 'EA'), ('SOZ', 'SÖZ')):
            info = data['puan_turleri'].get(pt) or {}
            rank_rows.append([
                Paragraph(label, td_lb),
                Paragraph(_fmt(info.get('puan'), 3), td),
                Paragraph(_fmt(avgs.get(pt, data.get('kurum_avg_puan')), 3), td),
                Paragraph(_fmt_int(data.get('sinif_rank')) if first else '', td),
                Paragraph(_fmt_int(data.get('kurum_ici_sira')) if first else '', td),
                Paragraph(_fmt_int(data.get('tahmini_siralama')) if first else '', td),
            ])
            first = False
    else:
        rank_rows.append([
            Paragraph(type_label, td_lb),
            Paragraph(_fmt(data.get('puan'), 3), td),
            Paragraph(_fmt(data.get('kurum_avg_puan'), 3), td),
            Paragraph(_fmt_int(data.get('sinif_rank')), td),
            Paragraph(_fmt_int(data.get('kurum_ici_sira')), td),
            Paragraph(_fmt_int(data.get('tahmini_siralama')), td),
        ])
    rank_rows.append([
        Paragraph('Katılımlar', td_lb), '', '',
        Paragraph(_fmt_int(data.get('sinif_student_count')), td),
        Paragraph(_fmt_int(data.get('toplam_ogrenci')), td),
        Paragraph('—', td),
    ])
    rank_tbl = Table(rank_rows, colWidths=[page_w * x for x in (0.18, 0.16, 0.18, 0.16, 0.16, 0.16)])
    rank_tbl.setStyle(_table_style(primary, row_alt, colors, header_rows=1))
    flow += [rank_tbl, Spacer(1, 6)]

    sec_header = [[
        Paragraph('Ders / Test', th), Paragraph('Soru', th), Paragraph('Doğru', th),
        Paragraph('Yanlış', th), Paragraph('Net', th), Paragraph('Başarı %', th),
        Paragraph('Sınıf', th), Paragraph('Kurum', th),
    ]]
    sec_rows = list(sec_header)
    mains = [sd for sd in (data.get('section_details') or []) if not sd.get('is_sub_section')]
    subs = [sd for sd in (data.get('section_details') or []) if sd.get('is_sub_section')]
    ordered = []
    for main in mains:
        ordered.append((main, True))
        for sub in subs:
            if sub.get('parent_id') == main.get('section_id'):
                ordered.append((sub, False))
    for sub in subs:
        if not any(m.get('section_id') == sub.get('parent_id') for m in mains):
            ordered.append((sub, False))

    main_row_indexes = []
    for sd, is_main in ordered:
        net = sd.get('net') or 0
        sinif_avg = sd.get('sinif_avg_net') or 0
        kurum_avg = sd.get('kurum_avg_net') or 0
        style_s = td if net + 0.001 >= sinif_avg else ParagraphStyleRed()
        style_k = td if net + 0.001 >= kurum_avg else ParagraphStyleRed()
        if is_main:
            main_row_indexes.append(len(sec_rows))
        sec_rows.append([
            Paragraph(sd.get('section_name') or '', td_lb if is_main else td_l),
            Paragraph(str(sd.get('question_count') or 0), td),
            Paragraph(str(sd.get('correct') or 0), td),
            Paragraph(str(sd.get('wrong') or 0), td),
            Paragraph(_fmt(net, 2), td),
            Paragraph(str(int(round(sd.get('verimlilik') or 0))), td),
            Paragraph(_fmt(sinif_avg, 2), style_s),
            Paragraph(_fmt(kurum_avg, 2), style_k),
        ])
    sec_tbl = Table(sec_rows, colWidths=[page_w * x for x in (0.28, 0.09, 0.09, 0.09, 0.1, 0.11, 0.12, 0.12)])
    style_cmds = _table_style(primary, row_alt, colors, header_rows=1)
    for r in main_row_indexes:
        style_cmds.append(('BACKGROUND', (0, r), (-1, r), row_main))
        style_cmds.append(('FONTNAME', (0, r), (-1, r), 'VeraBd'))
    sec_tbl.setStyle(TableStyle(style_cmds))
    flow += [sec_tbl, Spacer(1, 8)]

    for grid in data.get('answer_grids') or []:
        flow.append(Paragraph(f"{grid.get('section_name') or ''} — Cevap Anahtarı", exam_style))
        questions = grid.get('questions') or []
        chunk = 20
        for i in range(0, len(questions), chunk):
            part = questions[i:i + chunk]
            nums = [Paragraph(str(j + 1 + i), th) for j, _ in enumerate(part)]
            given = []
            correct = []
            for q in part:
                result = q.get('result') or 'empty'
                g = (q.get('given') or '').strip()
                if not g or result == 'empty':
                    given.append(Paragraph('', td))
                elif result == 'wrong':
                    given.append(Paragraph(g.lower(), ParagraphStyleRed()))
                else:
                    given.append(Paragraph(g.upper(), td))
                correct.append(Paragraph((q.get('correct') or '').upper(), td))
            cw = [page_w / len(part)] * len(part)
            gtbl = Table([nums, given, correct], colWidths=cw)
            gtbl.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), primary),
                ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#9EC2DE')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                ('FONTSIZE', (0, 0), (-1, -1), 6),
            ]))
            flow.append(gtbl)
        flow.append(Spacer(1, 4))

    return flow


def _ordered_sections(data):
    mains = [sd for sd in (data.get('section_details') or []) if not sd.get('is_sub_section')]
    subs = [sd for sd in (data.get('section_details') or []) if sd.get('is_sub_section')]
    ordered = []
    for main in mains:
        ordered.append((main, True))
        for sub in subs:
            if sub.get('parent_id') == main.get('section_id'):
                ordered.append((sub, False))
    for sub in subs:
        if not any(m.get('section_id') == sub.get('parent_id') for m in mains):
            ordered.append((sub, False))
    return ordered


def _section_title(text, page_w, primary, Table, TableStyle, Paragraph, colors):
    from reportlab.lib.styles import ParagraphStyle
    st = ParagraphStyle(
        'KarneSecH', fontName='VeraBd', fontSize=9,
        textColor=colors.white, alignment=0, leading=12,
    )
    bar = Table([[Paragraph(text, st)]], colWidths=[page_w])
    bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), primary),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return bar


def _diff_text(diff):
    try:
        val = float(diff or 0)
    except (TypeError, ValueError):
        val = 0
    if abs(val) < 0.05:
        return '—', 'neutral'
    sign = '+' if val > 0 else '−'
    return f'{sign}{_fmt(abs(val), 1)}', 'pos' if val > 0 else 'neg'


def _verim_color(verim):
    try:
        v = float(verim or 0)
    except (TypeError, ValueError):
        v = 0
    if v >= 70:
        return '#16A34A'
    if v >= 40:
        return '#D97706'
    return RED


def _page_analysis(
    data, page_w, logo, primary, primary_dark, row_alt, row_main,
    title_style, sub_style, exam_style, th, td, td_l, td_lb,
    Image, Table, TableStyle, Paragraph, Spacer, colors,
):
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm

    flow = [Spacer(1, 2)]
    green = ParagraphStyle('TdG', fontName='VeraBd', fontSize=7, textColor=colors.HexColor('#16A34A'), alignment=1, leading=9)
    red_s = ParagraphStyle('TdR', fontName='VeraBd', fontSize=7, textColor=colors.HexColor(RED), alignment=1, leading=9)
    muted = ParagraphStyle('TdM', fontName='Vera', fontSize=7, textColor=colors.HexColor('#64748B'), alignment=1, leading=9)
    td_name = ParagraphStyle('TdName', fontName='Vera', fontSize=7, leading=9, alignment=0, textColor=colors.HexColor('#334155'))

    ordered = _ordered_sections(data)

    flow.append(_section_title('Alan / Ders Bazlı Performans', page_w, primary, Table, TableStyle, Paragraph, colors))
    flow.append(Spacer(1, 4))

    perf_rows = [[
        Paragraph('Alan / Ders', th), Paragraph('D', th), Paragraph('Y', th),
        Paragraph('B', th), Paragraph('Net', th), Paragraph('Verim %', th),
        Paragraph('Sınıf', th), Paragraph('Fark', th),
        Paragraph('Kurum', th), Paragraph('Fark', th), Paragraph('Hata', th),
    ]]
    main_idx = []
    for sd, is_main in ordered:
        d_sinif, k_sinif = _diff_text(sd.get('diff_sinif'))
        d_kurum, k_kurum = _diff_text(sd.get('diff_kurum'))
        verim = sd.get('verimlilik') or 0
        verim_style = ParagraphStyle(
            f'Verim{sd.get("section_id")}', fontName='VeraBd', fontSize=7,
            textColor=colors.HexColor(_verim_color(verim)), alignment=1, leading=9,
        )
        name = sd.get('section_name') or ''
        if not is_main:
            name = f'  {name}'
        if is_main:
            main_idx.append(len(perf_rows))
        perf_rows.append([
            Paragraph(name, td_lb if is_main else td_name),
            Paragraph(str(sd.get('correct') or 0), td),
            Paragraph(str(sd.get('wrong') or 0), td),
            Paragraph(str(sd.get('empty') or 0), td),
            Paragraph(_fmt(sd.get('net'), 2), td),
            Paragraph(str(int(round(verim))), verim_style),
            Paragraph(_fmt(sd.get('sinif_avg_net'), 2), td),
            Paragraph(d_sinif, green if k_sinif == 'pos' else (red_s if k_sinif == 'neg' else muted)),
            Paragraph(_fmt(sd.get('kurum_avg_net'), 2), td),
            Paragraph(d_kurum, green if k_kurum == 'pos' else (red_s if k_kurum == 'neg' else muted)),
            Paragraph(f"%{int(round(sd.get('hata_orani') or 0))}", red_s if (sd.get('hata_orani') or 0) > 30 else td),
        ])
    perf_tbl = Table(perf_rows, colWidths=[page_w * x for x in (
        0.22, 0.06, 0.06, 0.06, 0.08, 0.09, 0.09, 0.08, 0.09, 0.08, 0.09,
    )])
    cmds = _table_style(primary, row_alt, colors, header_rows=1)
    for r in main_idx:
        cmds.append(('BACKGROUND', (0, r), (-1, r), row_main))
    perf_tbl.setStyle(TableStyle(cmds))
    flow += [perf_tbl, Spacer(1, 8)]

    mains = [sd for sd, is_main in ordered if is_main] or [sd for sd, _ in ordered]
    if mains:
        flow.append(_section_title('Karşılaştırma (Net)', page_w, primary, Table, TableStyle, Paragraph, colors))
        flow.append(Spacer(1, 3))
        legend = Paragraph(
            '<font color="#0262A7"><b>■ Öğrenci</b></font> &nbsp; '
            '<font color="#7C3AED"><b>■ Sınıf</b></font> &nbsp; '
            '<font color="#D97706"><b>■ Kurum</b></font>',
            ParagraphStyle('Leg', fontName='Vera', fontSize=7, textColor=colors.HexColor('#64748B'), leading=9),
        )
        flow.append(legend)
        flow.append(Spacer(1, 4))
        for sd in mains:
            flow.append(_compare_card(
                sd, page_w, Table, TableStyle, Paragraph, colors,
            ))
            flow.append(Spacer(1, 4))
        flow.append(Spacer(1, 4))

    flow.append(_section_title('Verimlilik &amp; Potansiyel Analizi', page_w, primary, Table, TableStyle, Paragraph, colors))
    flow.append(Spacer(1, 4))
    cards = []
    for sd, _is_main in ordered:
        verim = sd.get('verimlilik') or 0
        pot = sd.get('bos_potansiyel') or 0
        val_style = ParagraphStyle(
            f'CardV{sd.get("section_id")}', fontName='VeraBd', fontSize=12,
            textColor=colors.HexColor(_verim_color(verim)), alignment=1, leading=14,
        )
        name_style = ParagraphStyle(
            f'CardN{sd.get("section_id")}', fontName='Vera', fontSize=6.5,
            textColor=colors.HexColor('#64748B'), alignment=1, leading=8,
        )
        pot_style = ParagraphStyle(
            'CardP', fontName='VeraBd', fontSize=6.5,
            textColor=colors.HexColor('#D97706'), alignment=1, leading=8,
        )
        inner_rows = [
            [Paragraph(f'%{int(round(verim))}', val_style)],
            [Paragraph(sd.get('section_name') or '', name_style)],
        ]
        if pot and float(pot) > 0:
            inner_rows.append([Paragraph(f'+{_fmt(pot, 1)} pot.', pot_style)])
        card = Table(inner_rows, colWidths=[page_w / 4 - 8])
        card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F4F8FC')),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor('#D6E4F0')),
            ('LINEABOVE', (0, 0), (-1, 0), 2, colors.HexColor(_verim_color(verim))),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        cards.append(card)

    if cards:
        cols = 4
        grid_rows = []
        for i in range(0, len(cards), cols):
            chunk = cards[i:i + cols]
            while len(chunk) < cols:
                chunk.append('')
            grid_rows.append(chunk)
        grid = Table(grid_rows, colWidths=[page_w / cols] * cols)
        grid.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        flow += [grid, Spacer(1, 8)]

    flow.append(_section_title('Güçlü ve Zayıf Alanlar', page_w, primary, Table, TableStyle, Paragraph, colors))
    flow.append(Spacer(1, 4))
    strong = data.get('strong_areas') or []
    weak = data.get('weak_areas') or []
    head_s = ParagraphStyle('SH', fontName='VeraBd', fontSize=8, textColor=colors.white, alignment=1, leading=11)
    item_s = ParagraphStyle('SI', fontName='Vera', fontSize=8, textColor=colors.HexColor('#14532D'), leading=11)
    item_w = ParagraphStyle('WI', fontName='Vera', fontSize=8, textColor=colors.HexColor('#7F1D1D'), leading=11)
    empty_s = ParagraphStyle('SE', fontName='Vera', fontSize=8, textColor=colors.HexColor('#94A3B8'), alignment=1, leading=11)

    def _area_card(title, items, header_color, item_style):
        rows = [[Paragraph(title, head_s)]]
        if items:
            for a in items:
                rows.append([Paragraph(
                    f"<b>{a.get('name') or ''}</b>  ·  {_fmt(a.get('net'), 2)} net",
                    item_style,
                )])
        else:
            rows.append([Paragraph('—', empty_s)])
        t = Table(rows, colWidths=[page_w / 2 - 6])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(header_color)),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F8FAFC')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor(header_color)),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        return t

    pair = Table(
        [[
            _area_card('Güçlü Alanlar', strong, '#16A34A', item_s),
            _area_card('Zayıf Alanlar', weak, '#DC2626', item_w),
        ]],
        colWidths=[page_w / 2, page_w / 2],
    )
    pair.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 4),
        ('LEFTPADDING', (1, 0), (1, 0), 4),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
    ]))
    flow.append(pair)
    return flow


def _mini_bar(value, cap, width, color, Table, TableStyle, colors):
    pct = max(0.0, min(1.0, float(value or 0) / max(float(cap), 1)))
    fill_w = max(1.2, width * max(pct, 0.015))
    rest_w = max(1.2, width - fill_w)
    t = Table([['', '']], colWidths=[fill_w, rest_w])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor(color)),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#EEF2F7')),
        ('TOPPADDING', (0, 0), (-1, -1), 1.4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.4),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def _compare_card(sd, page_w, Table, TableStyle, Paragraph, colors):
    from reportlab.lib.styles import ParagraphStyle

    cap = max(float(sd.get('question_count') or 1), 1)
    name_s = ParagraphStyle('CmpN', fontName='VeraBd', fontSize=8, textColor=colors.HexColor('#0F172A'), leading=10)
    lab_s = ParagraphStyle('CmpL', fontName='Vera', fontSize=6.5, textColor=colors.HexColor('#64748B'), leading=8)
    series = (
        ('Öğrenci', float(sd.get('net') or 0), '#0262A7'),
        ('Sınıf', float(sd.get('sinif_avg_net') or 0), '#7C3AED'),
        ('Kurum', float(sd.get('kurum_avg_net') or 0), '#D97706'),
    )
    lab_w, val_w = 48, 38
    bar_w = min(page_w * 0.52, page_w - lab_w - val_w - 24)
    body = []
    for label, val, color in series:
        val_s = ParagraphStyle(
            f'CmpV{color}', fontName='VeraBd', fontSize=7,
            textColor=colors.HexColor(color), alignment=2, leading=9,
        )
        body.append([
            Paragraph(label, lab_s),
            _mini_bar(val, cap, bar_w, color, Table, TableStyle, colors),
            Paragraph(_fmt(val, 1), val_s),
        ])
    inner = Table(body, colWidths=[lab_w, bar_w, val_w])
    inner.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2),
    ]))
    card = Table(
        [[Paragraph(sd.get('section_name') or '', name_s)], [inner]],
        colWidths=[page_w],
    )
    card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor('#D6E4F0')),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (0, 0), 5),
        ('BOTTOMPADDING', (0, 0), (0, 0), 2),
        ('TOPPADDING', (0, 1), (0, 1), 2),
        ('BOTTOMPADDING', (0, 1), (0, 1), 6),
    ]))
    return card


def _page_two(
    data, page_w, logo, primary, primary_dark,
    title_style, sub_style, exam_style, th, td, td_l,
    Image, Table, TableStyle, Paragraph, Spacer, colors,
):
    flow = [Spacer(1, 2)]
    blocks = data.get('topic_blocks') or []
    mid = (len(blocks) + 1) // 2
    cols = [blocks[:mid], blocks[mid:]]
    col_tables = []
    col_w = (page_w - 6) / 2
    for col in cols:
        bits = []
        for block in col:
            bits.append(Paragraph(block.get('heading') or '', exam_style))
            for table in block.get('tables') or []:
                title = table.get('title') or ''
                if title and title != block.get('heading'):
                    bits.append(Paragraph(title, ParagraphStyleSubHead(colors)))
                rows = [[
                    Paragraph(title or 'Konu', th),
                    Paragraph('S', th), Paragraph('D', th), Paragraph('Y', th),
                    Paragraph('B', th), Paragraph('%', th),
                ]]
                for row in table.get('rows') or []:
                    rows.append([
                        Paragraph(row.get('name') or '', td_l),
                        Paragraph(str(row.get('soru') or 0), td),
                        Paragraph(str(row.get('dogru') or 0), td),
                        Paragraph(str(row.get('yanlis') or 0), td),
                        Paragraph(str(row.get('bos') or 0), td),
                        Paragraph(str(row.get('basari') or 0), td),
                    ])
                tw = [col_w * x for x in (0.52, 0.096, 0.096, 0.096, 0.096, 0.096)]
                tbl = Table(rows, colWidths=tw)
                tbl.setStyle(_table_style(primary, colors.HexColor('#F8FAFC'), colors, header_rows=1))
                bits.append(tbl)
                bits.append(Spacer(1, 4))
        col_tables.append(bits)
    # Flatten two columns as sequential blocks if platypus two-col is heavy
    left = col_tables[0]
    right = col_tables[1] if len(col_tables) > 1 else []
    wrapper = Table([[left, right]], colWidths=[col_w, col_w])
    wrapper.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]))
    flow.append(wrapper)
    return flow


def _table_style(primary, row_alt, colors, header_rows=1):
    return [
        ('BACKGROUND', (0, 0), (-1, header_rows - 1), primary),
        ('TEXTCOLOR', (0, 0), (-1, header_rows - 1), colors.white),
        ('FONTNAME', (0, 0), (-1, header_rows - 1), 'VeraBd'),
        ('FONTNAME', (0, header_rows), (-1, -1), 'Vera'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#9EC2DE')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('ROWBACKGROUNDS', (0, header_rows), (-1, -1), [colors.white, row_alt]),
    ]


def ParagraphStyleMini(colors):
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle('Mini', fontName='VeraBd', fontSize=7, textColor=colors.HexColor('#64748B'), alignment=1, leading=9)


def ParagraphStyleBig():
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle('Big', fontName='VeraBd', fontSize=14, alignment=1, leading=17)


def ParagraphStyleRed():
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    return ParagraphStyle('Red', fontName='VeraBd', fontSize=7, textColor=colors.HexColor(RED), alignment=1, leading=9)


def ParagraphStyleSubHead(colors):
    from reportlab.lib.styles import ParagraphStyle
    return ParagraphStyle('SubH', fontName='VeraBd', fontSize=8, textColor=colors.white, backColor=colors.HexColor('#3D8BC4'), leading=11)
