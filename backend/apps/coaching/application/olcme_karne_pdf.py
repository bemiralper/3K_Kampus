"""Ölçme — öğrenci sınav sonuç belgesi (karne) PDF.

Belge dört bölümden oluşur:

1. Künye + özet      — kimlik şeridi, temel göstergeler, sıralama, ders tablosu
2. Karşılaştırma     — ders bazlı öğrenci/sınıf/kurum barları, verimlilik, güçlü-zayıf
3. Kazanım analizi   — `topic_blocks` doluysa
4. Cevap anahtarı    — `answer_grids` doluysa

Dışa açık yüzey `render_karne_pdf`, `render_karne_pdf_many` ve `karne_filename`
ile sınırlıdır; geri kalan her şey iç ayrıntıdır.
"""
from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from django.conf import settings

# ── Kurumsal palet ─────────────────────────────────────────────────────────
# Marka mavisi frontend ile ortak (#0262A7); geri kalanı nötr slate tonları.
BRAND = '#0262A7'
BRAND_DARK = '#014A7F'
BRAND_SOFT = '#EAF2FA'
INK = '#0F172A'
INK_SOFT = '#475569'
MUTED = '#94A3B8'
LINE = '#DCE5EF'
SURFACE = '#F7FAFC'
GREEN = '#15803D'
AMBER = '#B45309'
RED = '#DC2626'
VIOLET = '#6D28D9'
GOLD = '#B7862B'

# Karşılaştırma barlarında kullanılan seri renkleri
SERIES_STUDENT = BRAND
SERIES_CLASS = VIOLET
SERIES_KURUM = AMBER

# Geriye dönük uyumluluk: eski sürüm bu adları modül düzeyinde tutuyordu.
PRIMARY = BRAND
PRIMARY_DARK = BRAND_DARK
ROW_ALT = SURFACE
ROW_MAIN = '#D7E8F6'


# ── Dosya adı ──────────────────────────────────────────────────────────────

def _safe_filename(name: str) -> str:
    cleaned = re.sub(r'[^\w\s.\-çğıöşüÇĞİÖŞÜ]', '', name or 'karne', flags=re.UNICODE)
    cleaned = re.sub(r'\s+', '_', cleaned).strip('_')
    return (cleaned or 'karne')[:80]


def karne_filename(data: dict) -> str:
    student = _safe_filename(data.get('student_name') or 'Ogrenci')
    exam = _safe_filename(data.get('exam_name') or 'Sinav')
    return f'{student}_{exam}_karne.pdf'


# ── Varlıklar (font / logo) ────────────────────────────────────────────────

def _register_fonts() -> tuple[str, str]:
    """Roboto varsa onu, yoksa ReportLab'in gömülü Vera ailesini kaydeder.

    Roboto kurumsal görünümü taşır ve Türkçe karakterleri tam kapsar; Vera
    yalnızca dağıtımda font dosyaları eksikse devreye giren emniyet ağıdır.
    """
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


def _font_dirs() -> list[Path]:
    base = Path(settings.BASE_DIR)
    return [
        base / 'static' / 'fonts',
        base.parent / 'frontend' / 'public' / 'fonts',
    ]


def _logo_path() -> Path | None:
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'img' / 'beyaz-logo.png',
        Path(settings.BASE_DIR).parent / 'frontend' / 'public' / 'img' / 'beyaz-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


# ── Sayı biçimleri ─────────────────────────────────────────────────────────

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


def _pct(n):
    try:
        return f'%{int(round(float(n or 0)))}'
    except (TypeError, ValueError):
        return '—'


def _format_session_when(data) -> str:
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


def _top3_rank(data) -> int:
    try:
        rank = int(data.get('kurum_ici_sira') or 0)
    except (TypeError, ValueError):
        return 0
    return rank if 1 <= rank <= 3 else 0


def _diff_text(diff) -> tuple[str, str]:
    try:
        val = float(diff or 0)
    except (TypeError, ValueError):
        val = 0.0
    if abs(val) < 0.05:
        return '—', 'neutral'
    sign = '+' if val > 0 else '−'
    return f'{sign}{_fmt(abs(val), 1)}', 'pos' if val > 0 else 'neg'


def _verim_color(verim) -> str:
    try:
        v = float(verim or 0)
    except (TypeError, ValueError):
        v = 0.0
    if v >= 70:
        return GREEN
    if v >= 40:
        return AMBER
    return RED


def _has_class_context(data) -> bool:
    """Öğrenci bir sınıfa bağlı değilse sınıf ortalaması/sırası anlamsızdır.

    Bu durumda alanlar sıfır döner; sıfırı gerçek bir ortalama gibi göstermek
    yerine ilgili sütunları boş bırakıyoruz.
    """
    try:
        return int(data.get('sinif_student_count') or 0) > 0
    except (TypeError, ValueError):
        return False


def _ordered_sections(data) -> list[tuple[dict, bool]]:
    """Ana bölümleri kendi alt bölümleriyle birlikte sıralar."""
    details = data.get('section_details') or []
    mains = [sd for sd in details if not sd.get('is_sub_section')]
    subs = [sd for sd in details if sd.get('is_sub_section')]
    ordered: list[tuple[dict, bool]] = []
    for main in mains:
        ordered.append((main, True))
        for sub in subs:
            if sub.get('parent_id') == main.get('section_id'):
                ordered.append((sub, False))
    for sub in subs:
        if not any(m.get('section_id') == sub.get('parent_id') for m in mains):
            ordered.append((sub, False))
    return ordered


# ── Çizim bağlamı ──────────────────────────────────────────────────────────

@dataclass
class _Ctx:
    """Sayfa geometrisi, stiller ve tekrar kullanılan ReportLab sınıfları.

    Eski sürümde her yardımcı fonksiyon 15'e yakın parametre alıyordu; tek bir
    bağlam nesnesi hem imzaları hem de stil tutarlılığını sadeleştiriyor.
    """
    page_w: float
    font: str
    font_bold: str
    logo: Path | None
    styles: dict[str, Any] = field(default_factory=dict)

    def s(self, key: str):
        return self.styles[key]


def _build_styles(font: str, font_bold: str) -> dict[str, Any]:
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle

    def mk(name, *, size=8, bold=False, color=INK, align=0, leading=None, **kw):
        return ParagraphStyle(
            name,
            fontName=font_bold if bold else font,
            fontSize=size,
            leading=leading or size * 1.32,
            textColor=colors.HexColor(color),
            alignment=align,
            **kw,
        )

    return {
        # Künye
        'brand': mk('KBrand', size=13, bold=True, color='#FFFFFF'),
        'brandSub': mk('KBrandSub', size=7.5, color='#FFFFFF'),
        'brandMeta': mk('KBrandMeta', size=8, color='#FFFFFF', align=2),
        'examBar': mk('KExamBar', size=10.5, bold=True, color=BRAND_DARK, align=1),
        # Kimlik
        'name': mk('KName', size=14, bold=True, color=INK),
        'idLabel': mk('KIdLabel', size=6.5, bold=True, color=MUTED),
        'idValue': mk('KIdValue', size=10, bold=True, color=INK),
        'initials': mk('KInitials', size=13, bold=True, color='#FFFFFF', align=1),
        'rankPill': mk('KRankPill', size=8, bold=True, color='#FFFFFF', align=1),
        # Göstergeler
        'kpiLabel': mk('KKpiLabel', size=6.5, bold=True, color=MUTED, align=1),
        'kpiValue': mk('KKpiValue', size=15, bold=True, color=INK, align=1),
        # Bölüm başlığı
        'sectionTitle': mk('KSecTitle', size=9, bold=True, color=INK),
        'sectionNote': mk('KSecNote', size=7.5, color=MUTED, align=2),
        # Tablolar
        'th': mk('KTh', size=7, bold=True, color='#FFFFFF', align=1),
        'thLeft': mk('KThLeft', size=7, bold=True, color='#FFFFFF', align=0),
        'td': mk('KTd', size=7.5, color=INK, align=1),
        'tdLeft': mk('KTdLeft', size=7.5, color=INK_SOFT, align=0),
        'tdName': mk('KTdName', size=7.5, bold=True, color=INK, align=0),
        'tdSub': mk('KTdSub', size=7.5, color=INK_SOFT, align=0, leftIndent=8),
        'tdMuted': mk('KTdMuted', size=7.5, color=MUTED, align=1),
        'tdPos': mk('KTdPos', size=7.5, bold=True, color=GREEN, align=1),
        'tdNeg': mk('KTdNeg', size=7.5, bold=True, color=RED, align=1),
        # Karşılaştırma
        'cmpName': mk('KCmpName', size=8, bold=True, color=INK),
        'cmpLabel': mk('KCmpLabel', size=6.5, color=INK_SOFT),
        'legend': mk('KLegend', size=7, color=INK_SOFT),
        # Kartlar
        'cardValue': mk('KCardValue', size=13, bold=True, color=INK, align=1),
        'cardName': mk('KCardName', size=6.5, color=INK_SOFT, align=1),
        'cardNote': mk('KCardNote', size=6.5, bold=True, color=AMBER, align=1),
        # Güçlü / zayıf
        'areaHead': mk('KAreaHead', size=8, bold=True, color='#FFFFFF'),
        'areaItem': mk('KAreaItem', size=8, color=INK, leading=11),
        'areaEmpty': mk('KAreaEmpty', size=8, color=MUTED, align=1),
        # Cevap anahtarı
        'gridNum': mk('KGridNum', size=6, bold=True, color=INK_SOFT, align=1),
        'gridAns': mk('KGridAns', size=7, bold=True, color=INK, align=1),
        'gridAnsWrong': mk('KGridAnsWrong', size=7, bold=True, color=RED, align=1),
        'gridRowLabel': mk('KGridRowLabel', size=6, bold=True, color=MUTED, align=0),
    }


# ── Ortak yapı taşları ─────────────────────────────────────────────────────

def _hairline_table_style(ctx: _Ctx, *, header_rows=1, zebra=True):
    """Dikey çizgisi olmayan, ince yatay ayraçlı kurumsal tablo stili."""
    from reportlab.lib import colors

    cmds = [
        ('BACKGROUND', (0, 0), (-1, header_rows - 1), colors.HexColor(BRAND)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, header_rows - 1), (-1, header_rows - 1), 0.8, colors.HexColor(BRAND_DARK)),
        ('LINEBELOW', (0, header_rows), (-1, -2), 0.3, colors.HexColor(LINE)),
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ]
    if zebra:
        cmds.append((
            'ROWBACKGROUNDS', (0, header_rows), (-1, -1),
            [colors.white, colors.HexColor(SURFACE)],
        ))
    return cmds


def _section_heading(ctx: _Ctx, title: str, note: str = ''):
    """Marka renginde ince bir çizgiyle altı çizili bölüm başlığı."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    cells = [Paragraph(title, ctx.s('sectionTitle'))]
    widths = [ctx.page_w]
    if note:
        cells.append(Paragraph(note, ctx.s('sectionNote')))
        widths = [ctx.page_w * 0.55, ctx.page_w * 0.45]

    t = Table([cells], colWidths=widths)
    t.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -1), 1.2, colors.HexColor(BRAND)),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


def _fit_canvas_text(canv, text: str, font: str, size: float, max_w: float) -> tuple[str, float]:
    """Metni sütuna sığdırır; gerekirse puntoyu düşürüp üç nokta ekler."""
    t = text or ''
    s = size
    while s > 8 and canv.stringWidth(t, font, s) > max_w:
        s -= 0.4
    if canv.stringWidth(t, font, s) > max_w:
        while t and canv.stringWidth(t + '…', font, s) > max_w:
            t = t[:-1]
        t = (t + '…') if t else '…'
    return t, s


def _wrap_canvas_text(canv, text: str, font: str, size: float, max_w: float, max_lines=2) -> list[str]:
    """Sabit puntoda satır kırar; taşanı son satırda üç noktayla keser."""
    words = (text or '').split()
    lines: list[str] = []
    cur = ''
    for word in words:
        trial = f'{cur} {word}'.strip()
        if canv.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        overflow = ' '.join(lines[max_lines - 1:])
        while overflow and canv.stringWidth(overflow + '…', font, size) > max_w:
            overflow = overflow[:-1]
        lines = lines[:max_lines - 1] + [(overflow + '…') if overflow else '…']
    return lines or ['']


def _photo_reader(path, box_w, box_h):
    """Kırpılmış fotoğrafı ReportLab ImageReader olarak döner."""
    try:
        from PIL import Image as PILImage
        from reportlab.lib.utils import ImageReader

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
            return ImageReader(buf)
    except Exception:
        return None


def _hero_header(ctx: _Ctx, data: dict):
    """İlk sayfa kapağı: solda marka, sağda öğrenci — iki panelli kart."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    class HeroHeader(Flowable):
        def __init__(self):
            super().__init__()
            self.width = ctx.page_w
            self.height = 120

        def wrap(self, availWidth, availHeight):
            self.width = availWidth
            return self.width, self.height

        def draw(self):
            c = self.canv
            w, h = self.width, self.height
            left_w = 176
            r = 8

            # Beyaz gövde
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(0.7)
            c.roundRect(0, 0, w, h, r, fill=1, stroke=1)

            # Sol marka paneli
            c.saveState()
            clip = c.beginPath()
            clip.roundRect(0, 0, w, h, r)
            c.clipPath(clip, stroke=0)
            c.setFillColor(colors.HexColor(BRAND))
            c.rect(0, 0, left_w, h, fill=1, stroke=0)
            c.setFillColor(colors.HexColor(BRAND_DARK))
            c.rect(0, 0, 5, h, fill=1, stroke=0)
            c.restoreState()

            pad = 14
            title_w = left_w - pad * 2
            title_size = 10
            exam_name = (data.get('exam_name') or 'Sınav').strip()
            exam_lines = _wrap_canvas_text(c, exam_name, ctx.font_bold, title_size, title_w, max_lines=2)

            when = _format_session_when(data)
            sube = (data.get('sube_ad') or '').strip()
            kurum = (data.get('kurum_ad') or '').strip()
            place = sube if sube and sube.lower() != kurum.lower() else ''
            caption = '  ·  '.join(b for b in (place, when) if b)

            logo_h = 52
            logo_w = logo_h * (546 / 407)
            if logo_w > left_w - pad * 2:
                logo_w = left_w - pad * 2
                logo_h = logo_w * (407 / 546)
            logo_x = pad
            logo_y = h - 10 - logo_h

            if ctx.logo:
                try:
                    c.drawImage(
                        str(ctx.logo), logo_x, logo_y,
                        width=logo_w, height=logo_h, mask='auto',
                        preserveAspectRatio=True, anchor='sw',
                    )
                except Exception:
                    c.setFillColor(colors.white)
                    c.setFont(ctx.font_bold, 13)
                    c.drawString(pad, logo_y + logo_h / 3, '3K Kampüs')

            exam_y = 42 + 12 * (len(exam_lines) - 1)
            c.setFillColor(colors.white)
            c.setFont(ctx.font_bold, title_size)
            for i, line in enumerate(exam_lines):
                c.drawString(pad, exam_y - i * 12, line)
            c.drawString(pad, 26, 'Sınav Sonuç Belgesi')
            if caption:
                cap, cap_s = _fit_canvas_text(c, caption, ctx.font, 6.5, title_w)
                c.setFont(ctx.font, cap_s)
                c.setFillColor(colors.HexColor('#C5D8EB'))
                c.drawString(pad, 12, cap)

            # Sağ panel — öğrenci
            rx = left_w + 16
            av = 48
            av_y = (h - av) / 2
            path = data.get('profil_foto_path')
            photo = _photo_reader(path, av, av) if path and os.path.isfile(path) else None

            c.saveState()
            av_clip = c.beginPath()
            av_clip.circle(rx + av / 2, av_y + av / 2, av / 2)
            c.clipPath(av_clip, stroke=0)
            if photo:
                c.drawImage(photo, rx, av_y, width=av, height=av, mask='auto')
            else:
                c.setFillColor(colors.HexColor(BRAND_SOFT))
                c.circle(rx + av / 2, av_y + av / 2, av / 2, fill=1, stroke=0)
                initials = _student_initials(data.get('student_name') or '')
                c.setFillColor(colors.HexColor(BRAND))
                c.setFont(ctx.font_bold, 15)
                c.drawCentredString(rx + av / 2, av_y + 17, initials)
            c.restoreState()
            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(1)
            c.circle(rx + av / 2, av_y + av / 2, av / 2, fill=0, stroke=1)

            tx = rx + av + 12
            right_col = 70
            text_w = w - tx - 14 - right_col

            name = data.get('student_name') or '—'
            name, name_size = _fit_canvas_text(c, name, ctx.font_bold, 16, text_w)
            c.setFillColor(colors.HexColor(INK))
            c.setFont(ctx.font_bold, name_size)
            c.drawString(tx, h - 36, name)

            sinif = (data.get('sinif') or data.get('sinif_ad') or '').strip()
            session = (data.get('session_name') or '').strip()
            meta = '  ·  '.join(b for b in (sinif, session) if b)
            y = h - 52
            if meta:
                c.setFont(ctx.font, 8)
                c.setFillColor(colors.HexColor(INK_SOFT))
                c.drawString(tx, y, meta)
                y -= 16

            type_label = (data.get('exam_type_label') or '').strip()
            if type_label:
                chip_w = c.stringWidth(type_label, ctx.font_bold, 7) + 10
                c.setFillColor(colors.HexColor(BRAND_SOFT))
                c.roundRect(tx, y - 2, chip_w, 13, 3, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(BRAND_DARK))
                c.setFont(ctx.font_bold, 7)
                c.drawString(tx + 5, y + 1.4, type_label)

            no = str(data.get('raw_student_id') or '—')
            no_label = 'ÖĞRENCİ NO'
            nx = w - 14
            c.setFont(ctx.font_bold, 6.5)
            label_w = c.stringWidth(no_label, ctx.font_bold, 6.5)
            label_left = nx - label_w
            c.setFillColor(colors.HexColor(MUTED))
            c.drawString(label_left, h - 34, no_label)
            c.setFillColor(colors.HexColor(INK))
            c.setFont(ctx.font_bold, 13)
            c.drawCentredString(label_left + label_w / 2, h - 50, no)

            rank = _top3_rank(data)
            if rank:
                tones = {1: GOLD, 2: '#64748B', 3: '#B45309'}
                try:
                    total = int(data.get('toplam_ogrenci') or 0)
                except (TypeError, ValueError):
                    total = 0
                badge = f'Kurum sırası {rank} / {total}' if total else f'Kurum sırası {rank}'
                rw = c.stringWidth(badge, ctx.font_bold, 7) + 12
                c.setFillColor(colors.HexColor(tones[rank]))
                c.roundRect(nx - rw, 16, rw, 14, 3, fill=1, stroke=0)
                c.setFillColor(colors.white)
                c.setFont(ctx.font_bold, 7)
                c.drawCentredString(nx - rw / 2, 19.5, badge)

    return HeroHeader()


def _running_header(ctx: _Ctx, data: dict, title: str):
    """İç sayfalar: ince marka şeridi, öğrenci adı sağda."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    class RunningHeader(Flowable):
        def __init__(self):
            super().__init__()
            self.width = ctx.page_w
            self.height = 28

        def wrap(self, availWidth, availHeight):
            self.width = availWidth
            return self.width, self.height

        def draw(self):
            c = self.canv
            w, h = self.width, self.height
            c.setFillColor(colors.HexColor(SURFACE))
            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(0.6)
            c.roundRect(0, 0, w, h, 5, fill=1, stroke=1)
            c.setFillColor(colors.HexColor(BRAND))
            c.roundRect(0, 0, 4, h, 2, fill=1, stroke=0)
            c.setFillColor(colors.HexColor(INK))
            c.setFont(ctx.font_bold, 9)
            c.drawString(12, 10, title)
            student = data.get('student_name') or '—'
            exam = data.get('exam_name') or ''
            right = f'{student}  ·  {exam}' if exam else student
            right, size = _fit_canvas_text(c, right, ctx.font, 7.5, w * 0.55)
            c.setFont(ctx.font, size)
            c.setFillColor(colors.HexColor(INK_SOFT))
            c.drawRightString(w - 10, 10, right)

    return RunningHeader()


# ── Kimlik şeridi ──────────────────────────────────────────────────────────

def _student_initials(name: str) -> str:
    parts = [p for p in (name or '').split() if p]
    if not parts:
        return '?'
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _fitted_photo(path, box_w, box_h, Image):
    """Fotoğrafı bozmadan kutuya sığdırır (merkezden kırpar)."""
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


def _photo_cell(ctx: _Ctx, data: dict):
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, Table, TableStyle

    box_w, box_h = 17 * mm, 21 * mm
    path = data.get('profil_foto_path')
    img = _fitted_photo(path, box_w, box_h, Image) if path and os.path.isfile(path) else None

    if img:
        cell = Table([[img]], colWidths=[box_w + 4])
        cell.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        return cell

    initials = _student_initials(data.get('student_name') or '')
    cell = Table(
        [[Paragraph(initials, ctx.s('initials'))]],
        colWidths=[box_w + 4], rowHeights=[box_h + 4],
    )
    cell.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]))
    return cell


def _rank_pill(ctx: _Ctx, rank: int):
    """İlk üçe giren öğrenci için sade bir kurumsal rozet."""
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    tones = {1: GOLD, 2: '#64748B', 3: '#9A6B3F'}
    t = Table(
        [[Paragraph(f'KURUM {rank}.', ctx.s('rankPill'))]],
        colWidths=[22 * mm],
    )
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(tones.get(rank, BRAND))),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


def _identity_strip(ctx: _Ctx, data: dict):
    """Fotoğraf | ad + sınıf | öğrenci no şeridi."""
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    rank = _top3_rank(data)
    name_rows: list[list[Any]] = [[Paragraph(data.get('student_name') or '—', ctx.s('name'))]]

    sinif = (data.get('sinif') or data.get('sinif_ad') or '').strip()
    sub_bits = [b for b in (sinif, data.get('session_name') or '') if b]
    if sub_bits:
        name_rows.append([Paragraph('  ·  '.join(sub_bits), ctx.s('tdLeft'))])
    if rank:
        name_rows.append([_rank_pill(ctx, rank)])

    name_block = Table(name_rows, colWidths=['*'])
    name_block.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    no_block = Table(
        [
            [Paragraph('ÖĞRENCİ NO', ctx.s('idLabel'))],
            [Paragraph(str(data.get('raw_student_id') or '—'), ctx.s('idValue'))],
        ],
        colWidths=['*'],
    )
    no_block.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    photo_w = 21 * mm + 4
    no_w = 30 * mm
    strip = Table(
        [[_photo_cell(ctx, data), name_block, no_block]],
        colWidths=[photo_w, ctx.page_w - photo_w - no_w, no_w],
    )
    strip.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (1, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return strip


# ── Gösterge şeridi ────────────────────────────────────────────────────────

def _kpi_band(ctx: _Ctx, data: dict):
    """Altı ayrı kart: doğru / yanlış / boş / net / puan / kurum sırası."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    tiles = [
        ('DOĞRU', _fmt_int(data.get('total_correct')), GREEN),
        ('YANLIŞ', _fmt_int(data.get('total_wrong')), RED),
        ('BOŞ', _fmt_int(data.get('total_empty')), MUTED),
        ('NET', _fmt(data.get('toplam_net'), 2), BRAND),
        ('PUAN', _fmt(data.get('puan'), 2), BRAND),
        ('KURUM SIRASI', _fmt_int(data.get('kurum_ici_sira')), INK),
    ]

    class KpiRow(Flowable):
        def __init__(self):
            super().__init__()
            self.width = ctx.page_w
            self.height = 42

        def wrap(self, availWidth, availHeight):
            self.width = availWidth
            return self.width, self.height

        def draw(self):
            c = self.canv
            n = len(tiles)
            gap = 5
            cw = (self.width - gap * (n - 1)) / n
            ch = self.height
            for i, (label, value, color) in enumerate(tiles):
                x = i * (cw + gap)
                c.setFillColor(colors.white)
                c.setStrokeColor(colors.HexColor(LINE))
                c.setLineWidth(0.6)
                c.roundRect(x, 0, cw, ch, 5, fill=1, stroke=1)
                c.saveState()
                clip = c.beginPath()
                clip.roundRect(x, 0, cw, ch, 5)
                c.clipPath(clip, stroke=0)
                c.setFillColor(colors.HexColor(color))
                c.rect(x, ch - 3.2, cw, 3.2, fill=1, stroke=0)
                c.restoreState()

                val, size = _fit_canvas_text(c, value, ctx.font_bold, 13, cw - 8)
                c.setFillColor(colors.HexColor(color))
                c.setFont(ctx.font_bold, size)
                c.drawCentredString(x + cw / 2, 16, val)
                c.setFillColor(colors.HexColor(MUTED))
                c.setFont(ctx.font_bold, 6)
                c.drawCentredString(x + cw / 2, 6.5, label)

    return KpiRow()


# ── Sıralama tablosu ───────────────────────────────────────────────────────

def _ranking_table(ctx: _Ctx, data: dict):
    from reportlab.platypus import Paragraph, Table, TableStyle

    th, td, td_name = ctx.s('th'), ctx.s('td'), ctx.s('tdName')
    is_ayt = data.get('exam_type') == 'YKS_AYT'
    type_label = data.get('exam_type_label') or ('AYT' if is_ayt else 'TYT')
    has_class = _has_class_context(data)

    def sinif_rank():
        return _fmt_int(data.get('sinif_rank')) if has_class else '—'

    rows = [[
        Paragraph('Puan Türü', ctx.s('thLeft')),
        Paragraph('Puan', th),
        Paragraph('Kurum Ort.', th),
        Paragraph('Sınıf Sırası', th),
        Paragraph('Kurum Sırası', th),
        Paragraph('Tahmini TR Sırası', th),
    ]]

    if is_ayt and data.get('puan_turleri'):
        avgs = data.get('puan_turleri_avgs') or {}
        first = True
        for key, label in (('SAY', 'SAY'), ('EA', 'EA'), ('SOZ', 'SÖZ')):
            info = data['puan_turleri'].get(key) or {}
            rows.append([
                Paragraph(label, td_name),
                Paragraph(_fmt(info.get('puan'), 2), td),
                Paragraph(_fmt(avgs.get(key, data.get('kurum_avg_puan')), 2), td),
                Paragraph(sinif_rank() if first else '', td),
                Paragraph(_fmt_int(data.get('kurum_ici_sira')) if first else '', td),
                Paragraph(_fmt_int(info.get('tahmini_siralama') or data.get('tahmini_siralama')), td),
            ])
            first = False
    else:
        rows.append([
            Paragraph(type_label, td_name),
            Paragraph(_fmt(data.get('puan'), 2), td),
            Paragraph(_fmt(data.get('kurum_avg_puan'), 2), td),
            Paragraph(sinif_rank(), td),
            Paragraph(_fmt_int(data.get('kurum_ici_sira')), td),
            Paragraph(_fmt_int(data.get('tahmini_siralama')), td),
        ])

    rows.append([
        Paragraph('Katılım', ctx.s('tdLeft')),
        Paragraph('—', ctx.s('tdMuted')),
        Paragraph('—', ctx.s('tdMuted')),
        Paragraph(
            f"{_fmt_int(data.get('sinif_student_count'))} öğrenci" if has_class else 'Sınıf tanımlı değil',
            ctx.s('tdMuted'),
        ),
        Paragraph(f"{_fmt_int(data.get('toplam_ogrenci'))} öğrenci", ctx.s('tdMuted')),
        Paragraph('—', ctx.s('tdMuted')),
    ])

    widths = [ctx.page_w * x for x in (0.20, 0.14, 0.16, 0.16, 0.16, 0.18)]
    tbl = Table(rows, colWidths=widths)
    tbl.setStyle(TableStyle(_hairline_table_style(ctx)))
    return tbl


# ── Ders performans tablosu ────────────────────────────────────────────────

def _performance_table(ctx: _Ctx, data: dict):
    """Ders bazlı tam tablo — net, verim ve sınıf/kurum farkları tek yerde.

    Önceki sürümde benzer tablo hem özet hem analiz sayfasında ayrı ayrı
    çiziliyordu; tek tabloda birleştirildi.
    """
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    th, td = ctx.s('th'), ctx.s('td')
    has_class = _has_class_context(data)
    rows = [[
        Paragraph('Ders / Test', ctx.s('thLeft')),
        Paragraph('Soru', th), Paragraph('D', th), Paragraph('Y', th), Paragraph('B', th),
        Paragraph('Net', th), Paragraph('Başarı', th),
        Paragraph('Sınıf Ort.', th), Paragraph('Fark', th),
        Paragraph('Kurum Ort.', th), Paragraph('Fark', th),
    ]]

    main_rows: list[int] = []
    for sd, is_main in _ordered_sections(data):
        if is_main:
            main_rows.append(len(rows))

        d_sinif, kind_s = _diff_text(sd.get('diff_sinif')) if has_class else ('—', 'neutral')
        d_kurum, kind_k = _diff_text(sd.get('diff_kurum'))
        verim = sd.get('verimlilik') or 0
        verim_style = ctx.s('td').clone(f'Verim{len(rows)}')
        verim_style.textColor = colors.HexColor(_verim_color(verim))
        verim_style.fontName = ctx.font_bold

        def tone(kind):
            return ctx.s('tdPos') if kind == 'pos' else (ctx.s('tdNeg') if kind == 'neg' else ctx.s('tdMuted'))

        rows.append([
            Paragraph(sd.get('section_name') or '', ctx.s('tdName') if is_main else ctx.s('tdSub')),
            Paragraph(str(sd.get('question_count') or 0), td),
            Paragraph(str(sd.get('correct') or 0), td),
            Paragraph(str(sd.get('wrong') or 0), td),
            Paragraph(str(sd.get('empty') or 0), td),
            Paragraph(_fmt(sd.get('net'), 2), td),
            Paragraph(_pct(verim), verim_style),
            Paragraph(_fmt(sd.get('sinif_avg_net'), 2) if has_class else '—', td if has_class else ctx.s('tdMuted')),
            Paragraph(d_sinif, tone(kind_s)),
            Paragraph(_fmt(sd.get('kurum_avg_net'), 2), td),
            Paragraph(d_kurum, tone(kind_k)),
        ])

    widths = [ctx.page_w * x for x in (
        0.21, 0.065, 0.055, 0.055, 0.055, 0.075, 0.08, 0.095, 0.075, 0.095, 0.075,
    )]
    tbl = Table(rows, colWidths=widths, repeatRows=1)
    cmds = _hairline_table_style(ctx, zebra=False)
    for r in main_rows:
        cmds.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor(BRAND_SOFT)))
    tbl.setStyle(TableStyle(cmds))
    return tbl


# ── Karşılaştırma barları ──────────────────────────────────────────────────

def _bar(value, cap, width, color, colors, Table, TableStyle):
    pct = max(0.0, min(1.0, float(value or 0) / max(float(cap), 1)))
    fill_w = max(1.2, width * max(pct, 0.012))
    rest_w = max(0.8, width - fill_w)
    t = Table([['', '']], colWidths=[fill_w, rest_w], rowHeights=[5])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor(color)),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#EDF2F7')),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return t


def _compare_card(ctx: _Ctx, sd: dict, *, with_class: bool = True):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    cap = max(float(sd.get('question_count') or 1), 1)
    series = [('Öğrenci', float(sd.get('net') or 0), SERIES_STUDENT)]
    if with_class:
        series.append(('Sınıf', float(sd.get('sinif_avg_net') or 0), SERIES_CLASS))
    series.append(('Kurum', float(sd.get('kurum_avg_net') or 0), SERIES_KURUM))

    label_w, value_w = 42, 34
    bar_w = ctx.page_w - label_w - value_w - 26
    body = []
    for label, value, color in series:
        value_style = ctx.s('td').clone(f'Cmp{color}{label}')
        value_style.textColor = colors.HexColor(color)
        value_style.fontName = ctx.font_bold
        value_style.alignment = 2
        body.append([
            Paragraph(label, ctx.s('cmpLabel')),
            _bar(value, cap, bar_w, color, colors, Table, TableStyle),
            Paragraph(_fmt(value, 2), value_style),
        ])

    inner = Table(body, colWidths=[label_w, bar_w, value_w])
    inner.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 1.6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.6),
    ]))

    header = Paragraph(
        f"{sd.get('section_name') or ''}  "
        f"<font size=6.5 color='{MUTED}'>{_fmt_int(sd.get('question_count'))} soru</font>",
        ctx.s('cmpName'),
    )
    card = Table([[header], [inner]], colWidths=[ctx.page_w])
    card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
        ('LINEBEFORE', (0, 0), (0, -1), 2, colors.HexColor(BRAND)),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (0, 0), 5),
        ('BOTTOMPADDING', (0, 0), (0, 0), 2),
        ('TOPPADDING', (0, 1), (0, 1), 2),
        ('BOTTOMPADDING', (0, 1), (0, 1), 6),
    ]))
    return card


def _legend(ctx: _Ctx, items: list[tuple[str, str]]):
    """Renk açıklaması.

    Kutucuklar boyanmış hücrelerle çizilir; Roboto'da ■ (U+25A0) glifi
    bulunmadığı için metin tabanlı gösterge boş görünüyordu.
    """
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    row: list[Any] = []
    widths: list[float] = []
    cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]

    for color, label in items:
        swatch_col = len(row)
        row.append('')
        widths.append(7)
        cmds += [
            ('BACKGROUND', (swatch_col, 0), (swatch_col, 0), colors.HexColor(color)),
            ('TOPPADDING', (swatch_col, 0), (swatch_col, 0), 1.5),
            ('BOTTOMPADDING', (swatch_col, 0), (swatch_col, 0), 1.5),
        ]
        label_col = len(row)
        row.append(Paragraph(label, ctx.s('legend')))
        widths.append(len(label) * 4.1 + 18)
        cmds.append(('LEFTPADDING', (label_col, 0), (label_col, 0), 5))

    row.append('')
    widths.append(max(10.0, ctx.page_w - sum(widths)))

    t = Table([row], colWidths=widths, rowHeights=[9])
    t.setStyle(TableStyle(cmds))
    t.hAlign = 'LEFT'
    return t


# ── Verimlilik kartları ────────────────────────────────────────────────────

def _efficiency_grid(ctx: _Ctx, data: dict):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    cols = 4
    col_w = ctx.page_w / cols
    cards: list[Any] = []

    for sd, _is_main in _ordered_sections(data):
        verim = sd.get('verimlilik') or 0
        tone = _verim_color(verim)
        value_style = ctx.s('cardValue').clone(f'Eff{len(cards)}')
        value_style.textColor = colors.HexColor(tone)

        rows = [
            [Paragraph(_pct(verim), value_style)],
            [Paragraph(sd.get('section_name') or '', ctx.s('cardName'))],
        ]
        pot = sd.get('bos_potansiyel') or 0
        try:
            has_pot = float(pot) > 0
        except (TypeError, ValueError):
            has_pot = False
        if has_pot:
            rows.append([Paragraph(f'+{_fmt(pot, 1)} net potansiyel', ctx.s('cardNote'))])

        card = Table(rows, colWidths=[col_w - 8])
        card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
            ('LINEABOVE', (0, 0), (-1, 0), 2, colors.HexColor(tone)),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        cards.append(card)

    if not cards:
        return None

    grid_rows = []
    for i in range(0, len(cards), cols):
        chunk = list(cards[i:i + cols])
        while len(chunk) < cols:
            chunk.append('')
        grid_rows.append(chunk)

    grid = Table(grid_rows, colWidths=[col_w] * cols)
    grid.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return grid


# ── Güçlü / zayıf alanlar ──────────────────────────────────────────────────

def _area_pair(ctx: _Ctx, data: dict):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    def card(title, items, tone):
        rows = [[Paragraph(title, ctx.s('areaHead'))]]
        if items:
            for item in items:
                rows.append([Paragraph(
                    f"<b>{item.get('name') or ''}</b>"
                    f"<font color='{MUTED}'>  ·  {_fmt(item.get('net'), 2)} net</font>",
                    ctx.s('areaItem'),
                )])
        else:
            rows.append([Paragraph('Kayıt yok', ctx.s('areaEmpty'))])

        t = Table(rows, colWidths=[ctx.page_w / 2 - 6])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(tone)),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor(LINE)),
            ('LINEBELOW', (0, 1), (-1, -2), 0.3, colors.HexColor(LINE)),
            ('LEFTPADDING', (0, 0), (-1, -1), 9),
            ('RIGHTPADDING', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        return t

    pair = Table(
        [[
            card('Güçlü Alanlar', data.get('strong_areas') or [], GREEN),
            card('Geliştirilecek Alanlar', data.get('weak_areas') or [], RED),
        ]],
        colWidths=[ctx.page_w / 2, ctx.page_w / 2],
    )
    pair.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 6),
        ('LEFTPADDING', (1, 0), (1, 0), 6),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
    ]))
    return pair


# ── Kazanım tabloları ──────────────────────────────────────────────────────

def _topic_tables(ctx: _Ctx, data: dict) -> list[Any]:
    """Kazanım blokları — uzun listelerde sayfa kırılabilsin diye ayrı tablolar."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    blocks = data.get('topic_blocks') or []
    if not blocks:
        return []

    th, td = ctx.s('th'), ctx.s('td')
    name_w = ctx.page_w * 0.52
    num_w = ctx.page_w * 0.096
    flow: list[Any] = []

    for block in blocks:
        heading = (block.get('heading') or '').strip()
        for table in block.get('tables') or []:
            title = (table.get('title') or '').strip()
            caption = ' — '.join([b for b in (heading, title) if b]) or 'Kazanım'

            rows = [[
                Paragraph(caption, ctx.s('thLeft')),
                Paragraph('Soru', th), Paragraph('D', th), Paragraph('Y', th),
                Paragraph('B', th), Paragraph('Başarı', th),
            ]]
            for row in table.get('rows') or []:
                basari = row.get('basari') or 0
                basari_style = ctx.s('td').clone(f'Topic{len(rows)}')
                basari_style.textColor = colors.HexColor(_verim_color(basari))
                basari_style.fontName = ctx.font_bold
                rows.append([
                    Paragraph(row.get('name') or '', ctx.s('tdLeft')),
                    Paragraph(str(row.get('soru') or 0), td),
                    Paragraph(str(row.get('dogru') or 0), td),
                    Paragraph(str(row.get('yanlis') or 0), td),
                    Paragraph(str(row.get('bos') or 0), td),
                    Paragraph(_pct(basari), basari_style),
                ])

            tbl = Table(
                rows,
                colWidths=[name_w, num_w, num_w, num_w, num_w, num_w],
                repeatRows=1,
            )
            tbl.setStyle(TableStyle(_hairline_table_style(ctx)))
            tbl.hAlign = 'LEFT'
            flow.append(tbl)
            flow.append(Spacer(1, 8))

    return flow


# ── Cevap anahtarı ─────────────────────────────────────────────────────────

def _answer_grids(ctx: _Ctx, data: dict) -> list[Any]:
    """Soru bazlı cevap ızgarası — doğru/yanlış/boş hücre zeminiyle ayrışır."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    grids = data.get('answer_grids') or []
    if not grids:
        return []

    flow: list[Any] = [
        _legend(ctx, [
            ('#7CC79B', 'Doğru'),
            ('#F0A0A0', 'Yanlış'),
            ('#CBD5E1', 'Boş'),
        ]),
        Spacer(1, 5),
    ]

    per_row = 20
    label_w = 26
    # Zeminler gösterge kutucuklarıyla aynı aileden; çok açık tonlar baskıda kayboluyordu
    ok_bg = colors.HexColor('#D8F0E1')
    bad_bg = colors.HexColor('#FBDCDC')
    empty_bg = colors.HexColor('#E9EEF4')

    for grid in grids:
        flow.append(Paragraph(grid.get('section_name') or '', ctx.s('cmpName')))
        flow.append(Spacer(1, 3))

        questions = grid.get('questions') or []
        for start in range(0, len(questions), per_row):
            part = questions[start:start + per_row]
            cell_w = (ctx.page_w - label_w) / len(part)

            nums = [Paragraph('', ctx.s('gridRowLabel'))]
            given = [Paragraph('Cevap', ctx.s('gridRowLabel'))]
            correct = [Paragraph('Anahtar', ctx.s('gridRowLabel'))]
            cmds = [
                ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor(LINE)),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(BRAND_SOFT)),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 1),
                ('RIGHTPADDING', (0, 0), (-1, -1), 1),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ]

            for offset, question in enumerate(part):
                col = offset + 1
                result = question.get('result') or 'empty'
                answer = (question.get('given') or '').strip()

                nums.append(Paragraph(str(question.get('q') or start + offset + 1), ctx.s('gridNum')))
                if result == 'wrong' and answer:
                    given.append(Paragraph(answer.upper(), ctx.s('gridAnsWrong')))
                    cmds.append(('BACKGROUND', (col, 1), (col, 1), bad_bg))
                elif result == 'correct' and answer:
                    given.append(Paragraph(answer.upper(), ctx.s('gridAns')))
                    cmds.append(('BACKGROUND', (col, 1), (col, 1), ok_bg))
                else:
                    given.append(Paragraph('·', ctx.s('tdMuted')))
                    cmds.append(('BACKGROUND', (col, 1), (col, 1), empty_bg))
                correct.append(Paragraph((question.get('correct') or '').upper(), ctx.s('gridNum')))

            tbl = Table([nums, given, correct], colWidths=[label_w] + [cell_w] * len(part))
            tbl.setStyle(TableStyle(cmds))
            tbl.hAlign = 'LEFT'
            flow.append(tbl)
            flow.append(Spacer(1, 3))

        flow.append(Spacer(1, 5))

    return flow


# ── Sayfa kurgusu ──────────────────────────────────────────────────────────

def _summary_page(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.platypus import Spacer

    flow: list[Any] = []
    flow.append(_hero_header(ctx, data))
    flow.append(Spacer(1, 8))
    flow.append(_kpi_band(ctx, data))
    flow.append(Spacer(1, 12))

    ref_year = data.get('referans_yil')
    note = f'Tahmini sıralama {ref_year} verilerine göre' if ref_year else ''
    flow.append(_section_heading(ctx, 'Puan ve Sıralama', note))
    flow.append(Spacer(1, 5))
    flow.append(_ranking_table(ctx, data))
    flow.append(Spacer(1, 12))

    flow.append(_section_heading(ctx, 'Ders / Test Performansı', 'Fark sütunları öğrencinin ortalamaya göre konumudur'))
    flow.append(Spacer(1, 5))
    flow.append(_performance_table(ctx, data))
    return flow


def _analysis_page(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.platypus import Spacer

    flow: list[Any] = [_running_header(ctx, data, 'Performans Analizi'), Spacer(1, 10)]

    mains = [sd for sd, is_main in _ordered_sections(data) if is_main]
    if not mains:
        mains = [sd for sd, _ in _ordered_sections(data)]
    if mains:
        has_class = _has_class_context(data)
        legend_items = [(SERIES_STUDENT, 'Öğrenci')]
        if has_class:
            legend_items.append((SERIES_CLASS, 'Sınıf ortalaması'))
        legend_items.append((SERIES_KURUM, 'Kurum ortalaması'))

        flow.append(_section_heading(ctx, 'Net Karşılaştırması'))
        flow.append(Spacer(1, 4))
        flow.append(_legend(ctx, legend_items))
        flow.append(Spacer(1, 5))
        for sd in mains:
            flow.append(_compare_card(ctx, sd, with_class=has_class))
            flow.append(Spacer(1, 5))
        flow.append(Spacer(1, 6))

    grid = _efficiency_grid(ctx, data)
    if grid is not None:
        flow.append(_section_heading(ctx, 'Verimlilik', 'Doğru / (doğru + yanlış) oranı'))
        flow.append(Spacer(1, 5))
        flow.append(grid)
        flow.append(Spacer(1, 12))

    flow.append(_section_heading(ctx, 'Güçlü ve Geliştirilecek Alanlar'))
    flow.append(Spacer(1, 5))
    flow.append(_area_pair(ctx, data))
    return flow


def _topic_page(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.platypus import Spacer

    tables = _topic_tables(ctx, data)
    if not tables:
        return []
    flow: list[Any] = [_running_header(ctx, data, 'Kazanım Analizi'), Spacer(1, 10)]
    flow += tables
    return flow


def _answer_page(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.platypus import Spacer

    grids = _answer_grids(ctx, data)
    if not grids:
        return []
    flow: list[Any] = [_running_header(ctx, data, 'Cevap Anahtarı'), Spacer(1, 10)]
    flow += grids
    return flow


# ── Altbilgi ───────────────────────────────────────────────────────────────

def _make_numbered_canvas(font: str):
    """Toplam sayfa sayısını bilebilmek için sayfaları biriktiren canvas."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    class NumberedCanvas(pdf_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages: list[dict] = []

        def showPage(self):
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._draw_footer(total)
                super().showPage()
            super().save()

        def _draw_footer(self, total: int):
            self.saveState()
            y = 9 * mm
            self.setStrokeColor(colors.HexColor(LINE))
            self.setLineWidth(0.4)
            self.line(10 * mm, y + 5, A4[0] - 10 * mm, y + 5)
            self.setFont(font, 6.5)
            self.setFillColor(colors.HexColor(MUTED))
            self.drawString(10 * mm, y, '3K Kampüs · Ölçme ve Değerlendirme')
            self.drawRightString(A4[0] - 10 * mm, y, f'Sayfa {self._pageNumber} / {total}')
            self.restoreState()

    return NumberedCanvas


# ── Dışa açık API ──────────────────────────────────────────────────────────

def render_karne_pdf(data: dict) -> bytes:
    return render_karne_pdf_many([data])


def render_karne_pdf_many(payloads: list[dict]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, SimpleDocTemplate

    font, font_bold = _register_fonts()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=9 * mm, bottomMargin=15 * mm,
        title='Sınav Sonuç Belgesi', author='3K Kampüs',
    )

    ctx = _Ctx(
        page_w=A4[0] - 20 * mm,
        font=font,
        font_bold=font_bold,
        logo=_logo_path(),
        styles=_build_styles(font, font_bold),
    )

    story: list[Any] = []
    for index, data in enumerate(payloads):
        pages = [_summary_page(ctx, data), _analysis_page(ctx, data)]
        pages.append(_topic_page(ctx, data))
        pages.append(_answer_page(ctx, data))

        for page in [p for p in pages if p]:
            if story:
                story.append(PageBreak())
            story.extend(page)
        # Boş veri gelse bile öğrenci başına en az bir sayfa üretilir
        if index < len(payloads) - 1 and not story:
            story.append(PageBreak())

    doc.build(story, canvasmaker=_make_numbered_canvas(font))
    return buf.getvalue()
