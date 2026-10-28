"""Ölçme — öğrenci sınav sonuç belgesi (karne) PDF.

Belge üç bölümden oluşur:

1. Özet             — künye, göstergeler, cevap dağılımı + ders radarı, değerlendirme,
                      net gelişimi, sıralama, güçlü-zayıf alanlar
2. Ders analizi     — ders tablosu, zorluk bandı, çalışılacak konular, cevaplar
3. Kazanım analizi  — `topic_blocks` doluysa

Dışa açık yüzey `render_karne_pdf`, `render_karne_pdf_many`, `karne_filename` ve
web önizlemesinin kullandığı `karne_insights` ile sınırlıdır; geri kalan her şey
iç ayrıntıdır.
"""
from __future__ import annotations

import io
import math
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
SERIES_KURUM = MUTED

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
    # Web önizlemesi Math.round kullanır; aynı yüzdeyi göstermek için buçuk yukarı yuvarlanır.
    try:
        return f'%{math.floor(float(n or 0) + 0.5)}'
    except (TypeError, ValueError):
        return '—'


def _xml_escape(text: str) -> str:
    return (
        (text or '')
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )


def _clock(value) -> str:
    """10:00 / 10.00 → 10.00"""
    raw = str(value or '').strip()
    if not raw:
        return ''
    raw = raw.replace('.', ':')
    parts = raw.split(':')
    try:
        hour = int(parts[0])
        minute = int(parts[1][:2]) if len(parts) > 1 else 0
    except (TypeError, ValueError):
        return str(value).strip()
    return f'{hour:02d}.{minute:02d}'


def _session_hours(data) -> str:
    start = _clock(data.get('session_start_time'))
    end = _clock(data.get('session_end_time'))
    if start and end:
        return f'{start} - {end}'
    return start or end


def _format_session_when(data) -> str:
    date_s = data.get('session_date')
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
    hours = _session_hours(data)
    if hours:
        parts.append(hours)
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
    if 'has_class' in data:
        return bool(data.get('has_class'))
    try:
        return int(data.get('sinif_student_count') or 0) > 0
    except (TypeError, ValueError):
        return False


def _ordered_sections(data) -> list[tuple[dict, bool]]:
    """Ana bölümleri kendi alt bölümleriyle birlikte sıralar."""
    from apps.coaching.olcme_degerlendirme.views.analysis_views import is_unattempted_optional_section

    details = [sd for sd in data.get('section_details') or [] if not is_unattempted_optional_section(sd)]
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
        'alanNote': mk('KAlanNote', size=7.5, color=MUTED, align=0),
        'diffNote': mk('KDiffNote', size=8, color=INK_SOFT, align=0),
        # Tablolar
        'th': mk('KTh', size=7.5, bold=True, color='#FFFFFF', align=1),
        'thLeft': mk('KThLeft', size=7.5, bold=True, color='#FFFFFF', align=0),
        'td': mk('KTd', size=8, color=INK, align=1),
        'tdLeft': mk('KTdLeft', size=8, color=INK_SOFT, align=0),
        'tdName': mk('KTdName', size=8, bold=True, color=INK, align=0),
        'tdSub': mk('KTdSub', size=8, color=INK_SOFT, align=0, leftIndent=8),
        'tdMuted': mk('KTdMuted', size=8, color=MUTED, align=1),
        'tdPos': mk('KTdPos', size=8, bold=True, color=GREEN, align=1),
        'tdNeg': mk('KTdNeg', size=8, bold=True, color=RED, align=1),
        # Değerlendirme
        'commentTitle': mk('KCommentTitle', size=9.5, bold=True, color=BRAND_DARK),
        'comment': mk('KComment', size=8.5, color=INK, leading=12),
        # Karşılaştırma
        'cmpName': mk('KCmpName', size=8, bold=True, color=INK),
        'cmpLabel': mk('KCmpLabel', size=6.5, color=INK_SOFT),
        'legend': mk('KLegend', size=7, color=INK_SOFT),
        # Kartlar
        'cardValue': mk('KCardValue', size=13, bold=True, color=INK, align=1),
        'cardName': mk('KCardName', size=6.5, color=INK_SOFT, align=1),
        'cardNote': mk('KCardNote', size=6.5, bold=True, color=AMBER, align=1),
        # Güçlü / zayıf
        'areaHead': mk('KAreaHead', size=9, bold=True, color='#FFFFFF'),
        'areaItem': mk('KAreaItem', size=8.5, color=INK, leading=11),
        'areaEmpty': mk('KAreaEmpty', size=8.5, color=MUTED, align=0),
        # Cevap anahtarı
        'gridNum': mk('KGridNum', size=6.5, bold=True, color=INK_SOFT, align=1, leading=8),
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


def _fit_wrapped_canvas_text(canv, text: str, font: str, max_w: float, sizes=(10, 9, 8.2, 7.4), max_lines=2):
    """Uzun metni önce küçültüp sonra satır kırar."""
    chosen_size = sizes[-1]
    lines = ['']
    for size in sizes:
        lines = _wrap_canvas_text(canv, text, font, size, max_w, max_lines=max_lines)
        chosen_size = size
        if all('…' not in line for line in lines):
            break
    return lines, chosen_size


def _hero_brand_layout(canv, exam_name: str, font_bold: str, left_w=176, header_h=112, pad=14) -> dict:
    """Sol marka panelinde logo ve sınav adı çakışmasın."""
    title_w = left_w - pad * 2
    exam_lines, title_size = _fit_wrapped_canvas_text(
        canv, exam_name or 'Sınav', font_bold, title_w,
    )
    leading = title_size + 2
    # Alt yazı ("Sınav Sonuç Belgesi") 8 pt ve y=24. Sınav adı onun üstünde,
    # descender ile çakışmadan dursun.
    exam_bottom_y = 42
    exam_top_baseline = exam_bottom_y + leading * (len(exam_lines) - 1)
    exam_top = exam_top_baseline + title_size * 0.85
    logo_gap = 8
    logo_top_margin = 8
    max_logo_h = header_h - logo_top_margin - exam_top - logo_gap
    logo_h = min(52, max(26, max_logo_h))
    logo_w = logo_h * (546 / 407)
    if logo_w > title_w:
        logo_w = title_w
        logo_h = logo_w * (407 / 546)
    logo_y = header_h - logo_top_margin - logo_h
    if logo_y < exam_top + logo_gap:
        logo_h = max(22, logo_y + logo_h - (exam_top + logo_gap))
        logo_w = min(title_w, logo_h * (546 / 407))
        logo_y = exam_top + logo_gap
    return {
        'title_w': title_w,
        'title_size': title_size,
        'exam_lines': exam_lines,
        'leading': leading,
        'exam_top_baseline': exam_top_baseline,
        'exam_top': exam_top,
        'logo_x': pad,
        'logo_y': logo_y,
        'logo_w': logo_w,
        'logo_h': logo_h,
    }


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
            self.height = 112

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
            exam_name = (data.get('exam_name') or 'Sınav').strip()
            brand = _hero_brand_layout(c, exam_name, ctx.font_bold, left_w=left_w, header_h=h, pad=pad)
            title_w = brand['title_w']
            title_size = brand['title_size']
            exam_lines = brand['exam_lines']

            when = _format_session_when(data)
            sube = (data.get('sube_ad') or '').strip()
            kurum = (data.get('kurum_ad') or '').strip()
            place = sube if sube and sube.lower() != kurum.lower() else ''
            caption = '  ·  '.join(b for b in (place, when) if b)

            logo_x, logo_y = brand['logo_x'], brand['logo_y']
            logo_w, logo_h = brand['logo_w'], brand['logo_h']

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

            c.setFillColor(colors.white)
            c.setFont(ctx.font_bold, title_size)
            for i, line in enumerate(exam_lines):
                c.drawString(pad, brand['exam_top_baseline'] - i * brand['leading'], line)
            c.setFont(ctx.font, 8)
            c.drawString(pad, 24, 'Sınav Sonuç Belgesi')
            if caption:
                cap, cap_s = _fit_canvas_text(c, caption, ctx.font, 6.5, title_w)
                c.setFont(ctx.font, cap_s)
                c.setFillColor(colors.HexColor('#C5D8EB'))
                c.drawString(pad, 12, cap)

            # Sağ panel — kimlik kartı: fotoğraf ve metin aynı üst/alt hizada
            rx = left_w + 14
            av = 96
            av_y = (h - av) / 2
            path = data.get('profil_foto_path')
            photo = _photo_reader(path, av, av) if path and os.path.isfile(path) else None

            c.saveState()
            av_clip = c.beginPath()
            av_clip.roundRect(rx, av_y, av, av, 8)
            c.clipPath(av_clip, stroke=0)
            if photo:
                c.drawImage(photo, rx, av_y, width=av, height=av, mask='auto')
            else:
                c.setFillColor(colors.HexColor(BRAND_SOFT))
                c.rect(rx, av_y, av, av, fill=1, stroke=0)
                initials = _student_initials(data.get('student_name') or '')
                c.setFillColor(colors.HexColor(BRAND))
                c.setFont(ctx.font_bold, 22)
                c.drawCentredString(rx + av / 2, av_y + av / 2 - 7, initials)
            c.restoreState()
            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(0.8)
            c.roundRect(rx, av_y, av, av, 8, fill=0, stroke=1)

            tx = rx + av + 12
            nx = w - 14
            text_w = nx - tx
            type_label = (data.get('exam_type_label') or '').strip()
            rank = _top3_rank(data)
            rank_label = {1: 'Birinci', 2: 'İkinci', 3: 'Üçüncü'}.get(rank, '')

            def _chip(x, y, text, fill, ink):
                tw = c.stringWidth(text, ctx.font_bold, 6.5) + 10
                c.setFillColor(colors.HexColor(fill))
                c.roundRect(x, y, tw, 12, 3, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(ink))
                c.setFont(ctx.font_bold, 6.5)
                c.drawString(x + 5, y + 3, text)
                return tw

            chips = []
            if type_label:
                chips.append((type_label, BRAND_SOFT, BRAND_DARK))
            if rank_label:
                tones = {1: GOLD, 2: '#64748B', 3: '#B45309'}
                chips.append((rank_label, tones.get(rank, GOLD), '#FFFFFF'))
            chip_gap = 5
            chips_w = sum(
                c.stringWidth(t, ctx.font_bold, 6.5) + 10 + chip_gap for t, *_ in chips
            )

            name = data.get('student_name') or '—'
            name, name_size = _fit_canvas_text(
                c, name, ctx.font_bold, 16, max(40, text_w - chips_w - 6),
            )
            name_y = av_y + av - name_size - 3
            c.setFillColor(colors.HexColor(INK))
            c.setFont(ctx.font_bold, name_size)
            c.drawString(tx, name_y, name)

            chip_y = name_y - 1
            chip_x = nx
            for text, fill, ink in reversed(chips):
                tw = _chip(chip_x - (c.stringWidth(text, ctx.font_bold, 6.5) + 10), chip_y, text, fill, ink)
                chip_x -= tw + chip_gap

            hair_y = av_y + av - 24
            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(0.5)
            c.line(tx, hair_y, nx, hair_y)

            sinif = (data.get('sinif') or data.get('sinif_ad') or '').strip()
            session = (data.get('session_name') or '').strip()
            hours = _session_hours(data)
            no = str(data.get('raw_student_id') or '—')
            sinif_lab = (data.get('sinif_meta_label') or 'Sınıf').strip() or 'Sınıf'
            meta = [
                ('Öğrenci no', no),
                (sinif_lab, sinif),
                ('Oturum', session),
                ('Saat', hours),
            ]
            meta = [(lab, val) for lab, val in meta if val]
            label_w = 56
            inner_top = hair_y - 6
            inner_bot = av_y + 4
            row_h = (inner_top - inner_bot) / max(len(meta), 1)
            for i, (lab, val) in enumerate(meta):
                y = inner_top - (i + 1) * row_h + row_h * 0.28
                c.setFillColor(colors.HexColor(MUTED))
                c.setFont(ctx.font, 7)
                c.drawString(tx, y, lab.upper())
                fitted, fs = _fit_canvas_text(c, val, ctx.font_bold, 9, text_w - label_w)
                c.setFillColor(colors.HexColor(INK))
                c.setFont(ctx.font_bold, fs)
                c.drawString(tx + label_w, y, fitted)

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
    """Üst şerit: alan soru sayısı, doğru, yanlış, boş, net, puan, kurum sırası."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    is_ayt = data.get('exam_type') == 'YKS_AYT' and data.get('alan_net') is not None
    net_label = (data.get('net_etiket') or 'SAY NET') if is_ayt else 'NET'
    net_value = data.get('alan_net') if is_ayt else data.get('toplam_net')
    alan_soru = _question_total(data)
    tiles = [
        ('SORU', _fmt_int(alan_soru) if alan_soru else '—', '', INK),
        ('DOĞRU', _fmt_int(data.get('total_correct')), '', GREEN),
        ('YANLIŞ', _fmt_int(data.get('total_wrong')), '', RED),
    ]
    if data.get('exam_type') != 'YKS_AYT' and alan_soru:
        tiles.append(('BOŞ', _fmt_int(_answer_counts(data)[2]), '', INK_SOFT))
    tiles += [
        (net_label, _fmt(net_value, 2), '', BRAND),
        ('PUAN', _fmt(data.get('puan'), 2), '', BRAND),
        ('KURUM SIRASI', _fmt_int(data.get('kurum_ici_sira')), '', INK),
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
            for i, (label, value, suffix, color) in enumerate(tiles):
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

                suf_size = 7.5
                suf_w = c.stringWidth(suffix, ctx.font_bold, suf_size) if suffix else 0
                val, size = _fit_canvas_text(c, value, ctx.font_bold, 13, max(12, cw - 8 - suf_w))
                val_w = c.stringWidth(val, ctx.font_bold, size)
                x0 = x + (cw - val_w - suf_w) / 2
                c.setFillColor(colors.HexColor(color))
                c.setFont(ctx.font_bold, size)
                c.drawString(x0, 16, val)
                if suffix:
                    c.setFillColor(colors.HexColor(MUTED))
                    c.setFont(ctx.font_bold, suf_size)
                    c.drawString(x0 + val_w, 16, suffix)
                c.setFillColor(colors.HexColor(MUTED))
                c.setFont(ctx.font_bold, 6.5)
                c.drawCentredString(x + cw / 2, 6.5, label)

    return KpiRow()


def _alan_net_note(ctx: _Ctx, data: dict):
    """AYT'de büyük netin alan neti olduğunu ve ham toplamı ayrı yazar."""
    from reportlab.platypus import Paragraph

    if data.get('exam_type') != 'YKS_AYT' or data.get('alan_net') is None:
        return None
    etiket = {
        'SAY NET': 'Sayısal net',
        'EA NET': 'Eşit ağırlık neti',
        'SÖZ NET': 'Sözel net',
    }.get(data.get('net_etiket') or '', 'Alan neti')
    text = (
        f"{etiket} öğrencinin alanına giren testlerdir. "
        f"Tüm testler: {_fmt(data.get('toplam_net'), 2)}. "
        "Alan dışı testler bu nete yazılmaz; ders tablosunda ayrıca görünür."
    )
    return Paragraph(text, ctx.s('alanNote'))


# ── Sıralama tablosu ───────────────────────────────────────────────────────

def _rank_num(n):
    try:
        value = int(n)
    except (TypeError, ValueError):
        return '—'
    return _fmt_int(value) if value else '—'


def _rank_panel(ctx, title, col_heads, body, foot, width, highlight=None, widths=None):
    """Başlıklı sıralama kartı. highlight, gövde satır indeksi (0 tabanlı)."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    th, td_muted = ctx.s('th'), ctx.s('tdMuted')
    sub = ctx.s('td').clone(f'rankHead{title}')
    sub.fontName = ctx.font_bold
    sub.fontSize = 6.5
    sub.leading = 8
    sub.textColor = colors.HexColor(BRAND_DARK)
    sub.alignment = 1
    heads = [Paragraph(label, sub) for label in col_heads]
    rows = [[Paragraph(title, th)] + [Paragraph('', th)] * (len(col_heads) - 1)]
    rows.append(heads)
    rows.extend(body)
    rows.append([Paragraph(foot, td_muted)] + [Paragraph('', td_muted)] * (len(col_heads) - 1))

    cols = widths or [width / len(col_heads)] * len(col_heads)
    tbl = Table(rows, colWidths=cols)
    style = _hairline_table_style(ctx, header_rows=2, zebra=False)
    last = len(rows) - 1
    style.extend([
        ('SPAN', (0, 0), (-1, 0)),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor(BRAND_SOFT)),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('SPAN', (0, last), (-1, last)),
        ('BACKGROUND', (0, last), (-1, last), colors.white),
        ('ALIGN', (0, last), (-1, last), 'LEFT'),
        ('LINEBELOW', (0, 1), (-1, -2), 0.3, colors.HexColor(LINE)),
    ])
    if highlight is not None:
        row = highlight + 2
        style.append(('BACKGROUND', (0, row), (-1, row), colors.HexColor(BRAND_SOFT)))
    tbl.setStyle(TableStyle(style))
    return tbl


def _ranking_table(ctx: _Ctx, data: dict):
    from reportlab.platypus import Paragraph, Table, TableStyle

    th, td, td_name = ctx.s('th'), ctx.s('td'), ctx.s('tdName')
    is_ayt = data.get('exam_type') == 'YKS_AYT'
    type_label = data.get('exam_type_label') or ('AYT' if is_ayt else 'TYT')
    has_class = _has_class_context(data)

    if is_ayt and data.get('puan_turleri'):
        tyt = data.get('tyt_siralama') or {}
        left_body = [[
            Paragraph(_fmt(tyt.get('net'), 2) if tyt else '—', td),
            Paragraph(_fmt(tyt.get('puan'), 2) if tyt else '—', td),
            Paragraph(_rank_num(tyt.get('kurum_ici_sira')), td),
            Paragraph(_rank_num(tyt.get('sinif_ici_sira')) if has_class else '—', td),
            Paragraph(_rank_num(tyt.get('tahmini_siralama')), td),
        ]]
        left_foot = (
            f"{_fmt_int(tyt.get('toplam_ogrenci'))} öğrenci"
            if tyt else 'Bağlı TYT sonucu yok'
        )

        alan = data.get('alan_puan_turu') or 'SAY'
        right_body = []
        highlight = None
        for key, label in (('SAY', 'SAY'), ('EA', 'EA'), ('SOZ', 'SÖZ')):
            info = data['puan_turleri'].get(key) or {}
            if key == alan:
                highlight = len(right_body)
            name = ctx.s('tdName')
            right_body.append([
                Paragraph(label, name),
                Paragraph(_fmt(info.get('ayt_net'), 2), td),
                Paragraph(_rank_num(info.get('net_kurum_ici_sira')), td),
                Paragraph(_fmt(info.get('puan'), 2), td),
                Paragraph(_rank_num(info.get('kurum_ici_sira')), td),
                Paragraph(_rank_num(info.get('sinif_ici_sira')) if has_class else '—', td),
                Paragraph(_rank_num(info.get('tahmini_siralama')), td),
            ])
        right_foot = f"{_fmt_int(data.get('toplam_ogrenci'))} öğrenci"

        gap = 8
        left_mins = [38, 46, 34, 32, 52]
        right_mins = [22, 32, 28, 40, 32, 28, 46]
        share = ctx.page_w - gap
        left_w = share * sum(left_mins) / (sum(left_mins) + sum(right_mins))
        right_w = share - left_w

        def _fit(mins, total):
            raw = sum(mins)
            return [m * total / raw for m in mins]

        left = _rank_panel(
            ctx, 'TYT', ['Net', 'Puan', 'Kurum', 'Sınıf', 'Türkiye'],
            left_body, left_foot, left_w,
            widths=_fit(left_mins, left_w),
        )
        right = _rank_panel(
            ctx, 'AYT', ['Tür', 'Net', 'Net sıra', 'Puan', 'Puan sıra', 'Sınıf', 'Türkiye'],
            right_body, right_foot, right_w, highlight=highlight,
            widths=_fit(right_mins, right_w),
        )
        pair = Table([[left, right]], colWidths=[left_w + gap, right_w])
        pair.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (0, 0), 0),
            ('RIGHTPADDING', (0, 0), (0, 0), gap),
            ('LEFTPADDING', (1, 0), (1, 0), 0),
            ('RIGHTPADDING', (1, 0), (1, 0), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return pair

    header = [Paragraph('Puan Türü', ctx.s('thLeft')), Paragraph('Puan', th), Paragraph('Kurum Ort.', th)]
    values = [
        Paragraph(type_label, td_name),
        Paragraph(_fmt(data.get('puan'), 2), td),
        Paragraph(_fmt(data.get('kurum_avg_puan'), 2), td),
    ]
    counts = [Paragraph('Katılım', ctx.s('tdLeft')), Paragraph('—', ctx.s('tdMuted')), Paragraph('—', ctx.s('tdMuted'))]
    if has_class:
        header.append(Paragraph('Sınıf Sırası', th))
        values.append(Paragraph(_fmt_int(data.get('sinif_rank')), td))
        counts.append(Paragraph(f"{_fmt_int(data.get('sinif_student_count'))} öğrenci", ctx.s('tdMuted')))
    header += [Paragraph('Kurum Sırası', th), Paragraph('Tahmini TR Sırası', th)]
    values += [
        Paragraph(_fmt_int(data.get('kurum_ici_sira')), td),
        Paragraph(_fmt_int(data.get('tahmini_siralama')), td),
    ]
    counts += [
        Paragraph(f"{_fmt_int(data.get('toplam_ogrenci'))} öğrenci", ctx.s('tdMuted')),
        Paragraph('—', ctx.s('tdMuted')),
    ]
    rows = [header, values, counts]
    shares = (0.20, 0.14, 0.16, 0.16, 0.16, 0.18) if has_class else (0.24, 0.17, 0.19, 0.19, 0.21)
    widths = [ctx.page_w * x for x in shares]
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
    header = [
        Paragraph('Ders / Test', ctx.s('thLeft')),
        Paragraph('Soru', th), Paragraph('D', th), Paragraph('Y', th), Paragraph('B', th),
        Paragraph('Net', th), Paragraph('Başarı', th),
    ]
    if has_class:
        header += [Paragraph('Sınıf Ort.', th), Paragraph('Sınıf Farkı', th)]
    header += [Paragraph('Kurum Ort.', th), Paragraph('Kurum Farkı', th)]
    rows = [header]

    main_rows: list[int] = []
    group_rows: list[int] = []
    seen_tyt = False
    for sd, is_main in _ordered_sections(data):
        if sd.get('source') == 'tyt' and not seen_tyt:
            seen_tyt = True
            group_rows.append(len(rows))
            empty = [Paragraph('', td)] * (len(header) - 1)
            tyt_title = (data.get('linked_tyt_exam_name') or '').strip() or 'TYT'
            rows.append([Paragraph(tyt_title, ctx.s('tdName')), *empty])

        if is_main:
            main_rows.append(len(rows))

        d_kurum, kind_k = _diff_text(sd.get('diff_kurum'))
        verim = sd.get('verimlilik') or 0

        def tone(kind):
            return ctx.s('tdPos') if kind == 'pos' else (ctx.s('tdNeg') if kind == 'neg' else ctx.s('tdMuted'))

        row = [
            Paragraph(sd.get('section_name') or '', ctx.s('tdName') if is_main else ctx.s('tdSub')),
            Paragraph(str(sd.get('question_count') or 0), td),
            Paragraph(str(sd.get('correct') or 0), td),
            Paragraph(str(sd.get('wrong') or 0), td),
            Paragraph(str(sd.get('empty') or 0), td),
            Paragraph(_fmt(sd.get('net'), 2), td),
            _Pill.make(ctx, verim),
        ]
        if has_class:
            d_sinif, kind_s = _diff_text(sd.get('diff_sinif'))
            row += [Paragraph(_fmt(sd.get('sinif_avg_net'), 2), td), Paragraph(d_sinif, tone(kind_s))]
        row += [Paragraph(_fmt(sd.get('kurum_avg_net'), 2), td), Paragraph(d_kurum, tone(kind_k))]
        rows.append(row)

    shares = (
        (0.21, 0.065, 0.055, 0.055, 0.055, 0.075, 0.08, 0.095, 0.075, 0.095, 0.075)
        if has_class else
        (0.27, 0.075, 0.065, 0.065, 0.065, 0.09, 0.095, 0.13, 0.145)
    )
    widths = [ctx.page_w * x for x in shares]
    tbl = Table(rows, colWidths=widths, repeatRows=1)
    cmds = _hairline_table_style(ctx, zebra=False)
    cmds.append(('ALIGN', (6, 1), (6, -1), 'CENTER'))
    for r in main_rows:
        cmds.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor(BRAND_SOFT)))
    for r in group_rows:
        cmds.append(('SPAN', (0, r), (-1, r)))
        cmds.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor('#E8F1F8')))
    tbl.setStyle(TableStyle(cmds))
    return tbl


# ── Gösterge ───────────────────────────────────────────────────────────────

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


# ── Ortak ölçüler ──────────────────────────────────────────────────────────

_TINT = {GREEN: '#DCFCE7', AMBER: '#FEF3C7', RED: '#FEE2E2'}


def _question_total(data) -> int:
    """Öğrencinin çözdüğü soru sayısı: alan / seçmeli ayıklanmış toplam."""
    for key in ('alan_soru', 'total_questions'):
        try:
            value = int(data.get(key) or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return 0


def _answer_counts(data) -> tuple[int, int, int]:
    correct = int(data.get('total_correct') or 0)
    wrong = int(data.get('total_wrong') or 0)
    total = _question_total(data)
    if total and data.get('exam_type') != 'YKS_AYT':
        empty = max(0, total - correct - wrong)
    else:
        empty = int(data.get('total_empty') or 0)
    return correct, wrong, empty


def _rate(net, count) -> float | None:
    try:
        count = int(count or 0)
        if count <= 0:
            return None
        return max(0.0, min(100.0, float(net or 0) / count * 100))
    except (TypeError, ValueError):
        return None


def _leaf_sections(data) -> list[dict]:
    """Alt dersler ve altı olmayan ana dersler. Bağlı TYT ve alan dışı satırlar hariç."""
    ordered = _ordered_sections(data)
    parents = {sd.get('parent_id') for sd, is_main in ordered if not is_main}
    rows = []
    for sd, is_main in ordered:
        if is_main and sd.get('section_id') in parents:
            continue
        if sd.get('source') == 'tyt' or sd.get('alana_dahil') is False:
            continue
        rows.append(sd)
    return rows


def _chart_sections(data) -> list[dict]:
    """Radar eksenleri: ana testler; üçten azsa yaprak dersler."""
    mains = [
        sd for sd, is_main in _ordered_sections(data)
        if is_main and sd.get('source') != 'tyt' and sd.get('alana_dahil') is not False
        and int(sd.get('question_count') or 0) > 0
    ]
    if len(mains) >= 3:
        return mains
    return [sd for sd in _leaf_sections(data) if int(sd.get('question_count') or 0) > 0]


def _clip(canv, text: str, font: str, size: float, max_w: float) -> str:
    t = text or ''
    if canv.stringWidth(t, font, size) <= max_w:
        return t
    while t and canv.stringWidth(t + '…', font, size) > max_w:
        t = t[:-1]
    return (t.rstrip() + '…') if t else '…'


def _card(canv, colors, x, y, w, h, *, fill='#FFFFFF', radius=9):
    canv.setFillColor(colors.HexColor(fill))
    canv.setStrokeColor(colors.HexColor(LINE))
    canv.setLineWidth(0.6)
    canv.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def _card_title(canv, colors, ctx, x, y, text, size=8.5):
    canv.setFillColor(colors.HexColor(INK))
    canv.setFont(ctx.font_bold, size)
    canv.drawString(x, y, text)


def _short_date(value) -> str:
    raw = str(value or '')[:10]
    if len(raw) == 10 and raw[4] == '-':
        return f'{raw[8:10]}.{raw[5:7]}.{raw[2:4]}'
    return raw


def _ranges(numbers: list[int]) -> str:
    """[1, 2, 3, 7] → '1–3, 7'"""
    out: list[str] = []
    nums = sorted({int(n) for n in numbers})
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f'{nums[i]}–{nums[j]}')
        i = j + 1
    return ', '.join(out)


class _Pill:
    """Tablo hücresinde renkli başarı etiketi."""

    @staticmethod
    def make(ctx: _Ctx, value):
        from reportlab.lib import colors
        from reportlab.platypus import Flowable

        color = _verim_color(value)
        text = _pct(value)

        class Pill(Flowable):
            def __init__(self):
                super().__init__()
                self.width = 36
                self.height = 12

            def wrap(self, availWidth, availHeight):
                return self.width, self.height

            def draw(self):
                c = self.canv
                c.setFillColor(colors.HexColor(_TINT.get(color, BRAND_SOFT)))
                c.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(color))
                c.setFont(ctx.font_bold, 7.5)
                c.drawCentredString(self.width / 2, 3.4, text)

        return Pill()


# ── Güçlü / zayıf alanlar ──────────────────────────────────────────────────

def _area_pair(ctx: _Ctx, data: dict):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    half = ctx.page_w / 2 - 5

    def card(title, items, tone):
        head = ctx.s('areaHead').clone(f'AreaHead{title}')
        head.textColor = colors.HexColor(tone)
        rows = [[Paragraph(title, head), '', '']]
        if items:
            for item in items:
                basari = item.get('basari')
                diff_text, kind = _diff_text(item.get('diff_kurum'))
                diff_style = ctx.s('tdPos' if kind == 'pos' else ('tdNeg' if kind == 'neg' else 'tdMuted'))
                rows.append([
                    Paragraph(f"<b>{_xml_escape(item.get('name') or '')}</b>", ctx.s('areaItem')),
                    _Pill.make(ctx, basari) if basari is not None else Paragraph(_fmt(item.get('net'), 2), ctx.s('td')),
                    Paragraph(f'kurum {diff_text}' if diff_text != '—' else '', diff_style),
                ])
        else:
            rows.append([Paragraph('Kayıt yok', ctx.s('areaEmpty')), '', ''])

        t = Table(rows, colWidths=[half * 0.5, half * 0.22, half * 0.28])
        t.setStyle(TableStyle([
            ('SPAN', (0, 0), (-1, 0)),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(_TINT.get(tone, BRAND_SOFT))),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
            ('LINEBELOW', (0, 1), (-1, -2), 0.3, colors.HexColor(LINE)),
            ('ALIGN', (1, 1), (1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 9),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
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
        ('RIGHTPADDING', (0, 0), (0, 0), 5),
        ('LEFTPADDING', (1, 0), (1, 0), 5),
        ('RIGHTPADDING', (1, 0), (1, 0), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return pair


# ── Özet görselleri ────────────────────────────────────────────────────────

def _overview(ctx: _Ctx, data: dict):
    """Solda cevap dağılımı halkası, sağda derslere göre başarı radarı."""
    import math

    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    correct, wrong, empty = _answer_counts(data)
    answered_total = correct + wrong + empty
    axes = _chart_sections(data)
    if not answered_total and not axes:
        return None

    class Overview(Flowable):
        def __init__(self):
            super().__init__()
            self.width = ctx.page_w
            self.height = 150

        def wrap(self, availWidth, availHeight):
            self.width = availWidth
            return self.width, self.height

        def draw(self):
            c = self.canv
            gap = 8
            left_w = self.width * 0.37
            right_x = left_w + gap
            right_w = self.width - right_x
            _card(c, colors, 0, 0, left_w, self.height)
            _card(c, colors, right_x, 0, right_w, self.height)
            self._donut(c, 0, left_w)
            if len(axes) >= 3:
                self._radar(c, right_x, right_w)
            else:
                self._bars(c, right_x, right_w)

        def _donut(self, c, x, w):
            h = self.height
            _card_title(c, colors, ctx, x + 12, h - 20, 'Cevap Dağılımı')
            total = answered_total or 1
            r = 44
            ring = 12
            cx = x + 14 + r
            cy = (h - 26) / 2 + 2
            parts = [
                ('Doğru', correct, GREEN),
                ('Yanlış', wrong, RED),
                ('Boş', empty, '#CBD5E1'),
            ]
            c.setFillColor(colors.HexColor('#EEF2F7'))
            c.circle(cx, cy, r, fill=1, stroke=0)
            start = 90.0
            for _label, count, color in parts:
                if count <= 0:
                    continue
                extent = -360.0 * count / total
                c.setFillColor(colors.HexColor(color))
                if abs(extent) >= 359.9:
                    c.circle(cx, cy, r, fill=1, stroke=0)
                else:
                    c.wedge(cx - r, cy - r, cx + r, cy + r, start, extent, stroke=0, fill=1)
                start += extent
            c.setFillColor(colors.white)
            c.circle(cx, cy, r - ring, fill=1, stroke=0)
            soru = _question_total(data) or answered_total
            c.setFillColor(colors.HexColor(INK))
            c.setFont(ctx.font_bold, 17)
            c.drawCentredString(cx, cy - 1, _fmt_int(soru))
            c.setFillColor(colors.HexColor(MUTED))
            c.setFont(ctx.font, 6.5)
            c.drawCentredString(cx, cy - 11, 'soru')

            lx = cx + r + 14
            ly = cy + 22
            for label, count, color in parts:
                c.setFillColor(colors.HexColor(color))
                c.roundRect(lx, ly - 1, 7, 7, 2, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(INK_SOFT))
                c.setFont(ctx.font, 7.5)
                c.drawString(lx + 11, ly, label)
                c.setFillColor(colors.HexColor(INK))
                c.setFont(ctx.font_bold, 10)
                c.drawString(lx + 11, ly - 12, _fmt_int(count))
                c.setFillColor(colors.HexColor(MUTED))
                c.setFont(ctx.font, 6.5)
                c.drawString(
                    lx + 13 + c.stringWidth(_fmt_int(count), ctx.font_bold, 10), ly - 12,
                    _pct(count * 100 / total),
                )
                ly -= 26

        def _legend_right(self, c, x, w):
            h = self.height
            items = [('Öğrenci', BRAND), ('Kurum ort.', SERIES_KURUM)]
            lx = x + w - 12
            c.setFont(ctx.font, 7)
            for label, color in reversed(items):
                tw = c.stringWidth(label, ctx.font, 7)
                lx -= tw
                c.setFillColor(colors.HexColor(INK_SOFT))
                c.drawString(lx, h - 20, label)
                lx -= 11
                c.setFillColor(colors.HexColor(color))
                c.roundRect(lx, h - 21, 7, 7, 2, fill=1, stroke=0)
                lx -= 10

        def _radar(self, c, x, w):
            h = self.height
            _card_title(c, colors, ctx, x + 12, h - 20, 'Derslere Göre Başarı')
            self._legend_right(c, x, w)
            n = len(axes)
            cx = x + w / 2
            cy = (h - 26) / 2 + 4
            radius = min(w * 0.24, (h - 80) / 2)

            def point(i, pct):
                ang = math.radians(90 - 360.0 * i / n)
                rr = radius * max(0.0, min(100.0, pct)) / 100
                return cx + rr * math.cos(ang), cy + rr * math.sin(ang)

            c.setStrokeColor(colors.HexColor(LINE))
            c.setLineWidth(0.5)
            for ring in (25, 50, 75, 100):
                pts = [point(i, ring) for i in range(n)]
                path = c.beginPath()
                path.moveTo(*pts[0])
                for p in pts[1:]:
                    path.lineTo(*p)
                path.close()
                c.drawPath(path, stroke=1, fill=0)
            for i in range(n):
                c.line(cx, cy, *point(i, 100))

            student = [_rate(sd.get('net'), sd.get('question_count')) or 0 for sd in axes]
            kurum = [_rate(sd.get('kurum_avg_net'), sd.get('question_count')) or 0 for sd in axes]

            def polygon(values, color, alpha, width):
                pts = [point(i, v) for i, v in enumerate(values)]
                path = c.beginPath()
                path.moveTo(*pts[0])
                for p in pts[1:]:
                    path.lineTo(*p)
                path.close()
                c.saveState()
                c.setFillColor(colors.HexColor(color))
                c.setFillAlpha(alpha)
                c.setStrokeColor(colors.HexColor(color))
                c.setLineWidth(width)
                c.drawPath(path, stroke=1, fill=1)
                c.restoreState()
                return pts

            polygon(kurum, SERIES_KURUM, 0.16, 0.8)
            pts = polygon(student, BRAND, 0.2, 1.4)
            c.setFillColor(colors.HexColor(BRAND))
            for px, py in pts:
                c.circle(px, py, 1.8, fill=1, stroke=0)

            slot = w * 0.26
            for i, sd in enumerate(axes):
                ang = math.radians(90 - 360.0 * i / n)
                lx = cx + (radius + 9) * math.cos(ang)
                ly = cy + (radius + 9) * math.sin(ang)
                cos = math.cos(ang)
                name = _clip(c, sd.get('section_name') or '', ctx.font_bold, 7, slot)
                rate = f"{_pct(student[i])}  ·  kurum {_pct(kurum[i])}"
                if math.sin(ang) > 0.5:
                    ly += 6
                elif math.sin(ang) < -0.5:
                    ly -= 6
                else:
                    ly -= 1
                if cos > 0.3:
                    draw = c.drawString
                elif cos < -0.3:
                    draw = c.drawRightString
                else:
                    draw = c.drawCentredString
                c.setFillColor(colors.HexColor(INK))
                c.setFont(ctx.font_bold, 7)
                draw(lx, ly, name)
                c.setFillColor(colors.HexColor(INK_SOFT))
                c.setFont(ctx.font, 6.5)
                draw(lx, ly - 8, rate)

        def _bars(self, c, x, w):
            h = self.height
            _card_title(c, colors, ctx, x + 12, h - 20, 'Derslere Göre Başarı')
            self._legend_right(c, x, w)
            if not axes:
                return
            top = h - 38
            row_h = min(30, (top - 10) / len(axes))
            name_w = w * 0.3
            bar_x = x + 12 + name_w
            bar_w = w - name_w - 60
            for i, sd in enumerate(axes):
                y = top - i * row_h
                student = _rate(sd.get('net'), sd.get('question_count')) or 0
                kurum = _rate(sd.get('kurum_avg_net'), sd.get('question_count')) or 0
                c.setFillColor(colors.HexColor(INK))
                c.setFont(ctx.font_bold, 7.5)
                c.drawString(x + 12, y - 8, _clip(c, sd.get('section_name') or '', ctx.font_bold, 7.5, name_w - 6))
                for offset, value, color in ((0, student, BRAND), (9, kurum, SERIES_KURUM)):
                    c.setFillColor(colors.HexColor('#EEF2F7'))
                    c.roundRect(bar_x, y - 5 - offset, bar_w, 6, 3, fill=1, stroke=0)
                    c.setFillColor(colors.HexColor(color))
                    c.roundRect(bar_x, y - 5 - offset, max(3, bar_w * value / 100), 6, 3, fill=1, stroke=0)
                    c.setFillColor(colors.HexColor(INK_SOFT))
                    c.setFont(ctx.font, 6.5)
                    c.drawString(bar_x + bar_w + 6, y - 4 - offset, _pct(value))

    return Overview()


def _comment_lines(data: dict) -> list[str]:
    """Veliye ve öğrenciye sade dille özet. Veri yoksa cümle kurulmaz."""
    lines: list[str] = []
    names = (data.get('student_name') or '').split()
    who = names[0] if names else 'Öğrenci'
    is_ayt = data.get('exam_type') == 'YKS_AYT' and data.get('alan_net') is not None
    net = float((data.get('alan_net') if is_ayt else data.get('toplam_net')) or 0)
    soru = _question_total(data)
    correct, wrong, empty = _answer_counts(data)

    first = f'{who} {soru} soruda {_fmt(net, 2)} net yaptı' if soru else f'{who} {_fmt(net, 2)} net yaptı'
    try:
        rank, total = int(data.get('kurum_ici_sira') or 0), int(data.get('toplam_ogrenci') or 0)
    except (TypeError, ValueError):
        rank, total = 0, 0
    if rank and total:
        first += f'; kurumda {total} öğrenci arasında {rank}. sırada'
    first += '.'
    if not is_ayt and data.get('kurum_avg_net') not in (None, ''):
        diff = net - float(data.get('kurum_avg_net') or 0)
        if abs(diff) >= 0.5:
            first += f" Kurum ortalamasının {_fmt(abs(diff), 1)} net {'üstünde' if diff > 0 else 'altında'}."
    lines.append(first)

    history = data.get('net_history') or []
    if len(history) >= 2:
        prev, cur = history[-2], history[-1]
        delta = float(cur.get('toplam_net') or 0) - float(prev.get('toplam_net') or 0)
        if abs(delta) < 0.5:
            text = 'Bir önceki sınava göre neti aynı seviyede.'
        else:
            text = f"Bir önceki sınava göre {_fmt(abs(delta), 1)} net {'arttı' if delta > 0 else 'düştü'}."
            nets = [float(h.get('toplam_net') or 0) for h in history]
            if delta > 0 and len(history) >= 3 and nets[-1] >= max(nets):
                text = text[:-1] + f'; son {len(history)} sınavın en yüksek neti.'
        lines.append(text)

    strong = [item for item in data.get('strong_areas') or [] if item.get('name')]
    if strong:
        parts = [
            f"{item['name']} ({_pct(item['basari'])})" if item.get('basari') is not None else item['name']
            for item in strong
        ]
        lines.append(f"En başarılı olduğu dersler {' ve '.join(parts)}.")

    weak_names = {item.get('name') for item in data.get('weak_areas') or []}
    strong_names = {item.get('name') for item in strong}
    best = None
    for sd in _leaf_sections(data):
        try:
            diff = float(sd.get('diff_kurum') or 0)
        except (TypeError, ValueError):
            continue
        name = sd.get('section_name')
        if diff >= 1 and name not in weak_names | strong_names and (best is None or diff > best[0]):
            best = (diff, name)
    if best:
        lines.append(f'Kurum ortalamasını en çok geçtiği ders {best[1]}: {_fmt(best[0], 1)} net önde.')

    weak = [item for item in data.get('weak_areas') or [] if item.get('name')]
    if weak:
        parts = [
            f"{item['name']} ({_pct(item['basari'])})" if item.get('basari') is not None else item['name']
            for item in weak
        ]
        lines.append(f"Öncelik {' ve '.join(parts)} olmalı.")

    bands = {b.get('key'): b for b in (data.get('difficulty') or {}).get('bands') or []}
    kolay = bands.get('kolay') or {}
    missed = int(kolay.get('yanlis') or 0) + int(kolay.get('bos') or 0)
    if missed:
        lines.append(
            f'Kurumun çoğunun doğru yaptığı {missed} kolay soruyu kaçırdı; en hızlı puan kazanılacak yer burası.'
        )

    if soru and empty >= max(5, soru * 0.1):
        lines.append(f'{empty} soruyu boş bıraktı; süre yönetimi ve eksik konular birlikte ele alınmalı.')
    elif wrong and correct and wrong / (correct + wrong) > 0.3:
        lines.append('Yanlış oranı yüksek; emin olmadığı soruları boş bırakmak neti artırabilir.')
    return lines[:6]


def _comment_card(ctx: _Ctx, data: dict):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    lines = _comment_lines(data)
    if not lines:
        return None
    rows = [[Paragraph('Değerlendirme', ctx.s('commentTitle'))]]
    for line in lines:
        rows.append([Paragraph(
            f"<font color='{BRAND}'><b>•</b></font>&nbsp;&nbsp;{_xml_escape(line)}", ctx.s('comment'),
        )])
    t = Table(rows, colWidths=[ctx.page_w])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_SOFT)),
        ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(BRAND)),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 3),
        ('TOPPADDING', (0, 1), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
    ]))
    t.hAlign = 'LEFT'
    return t


def _trend_chart(ctx: _Ctx, data: dict):
    """Aynı türdeki son sınavların neti. Tek sınav varsa çizilmez."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable

    history = [h for h in data.get('net_history') or [] if h.get('toplam_net') is not None]
    if len(history) < 2:
        return None
    nets = [float(h.get('toplam_net') or 0) for h in history]
    delta = nets[-1] - nets[-2]

    class Trend(Flowable):
        def __init__(self):
            super().__init__()
            self.width = ctx.page_w
            self.height = 118

        def wrap(self, availWidth, availHeight):
            self.width = availWidth
            return self.width, self.height

        def draw(self):
            c = self.canv
            w, h = self.width, self.height
            _card(c, colors, 0, 0, w, h)
            _card_title(c, colors, ctx, 12, h - 20, 'Net Gelişimi')
            c.setFont(ctx.font, 7)
            c.setFillColor(colors.HexColor(MUTED))
            c.drawString(12 + c.stringWidth('Net Gelişimi', ctx.font_bold, 8.5) + 8, h - 20, f'Son {len(history)} sınav')

            if abs(delta) >= 0.05:
                tone = GREEN if delta > 0 else RED
                chip = f"Önceki sınava göre {'+' if delta > 0 else '−'}{_fmt(abs(delta), 2)} net"
                cw = c.stringWidth(chip, ctx.font_bold, 7) + 14
                c.setFillColor(colors.HexColor(_TINT[tone]))
                c.roundRect(w - 12 - cw, h - 24, cw, 13, 6.5, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(tone))
                c.setFont(ctx.font_bold, 7)
                c.drawString(w - 12 - cw + 7, h - 20, chip)

            n = len(history)
            slot = (w - 24) / n
            left, right = 12 + slot / 2, w - 12 - slot / 2
            bottom, top = 30, h - 42
            lo, hi = min(nets), max(nets)
            pad = max(2.0, (hi - lo) * 0.15)
            lo, hi = lo - pad, hi + pad
            step = (right - left) / (n - 1)

            def pos(i, value):
                return left + step * i, bottom + (value - lo) / (hi - lo) * (top - bottom)

            c.setStrokeColor(colors.HexColor('#EEF2F7'))
            c.setLineWidth(0.5)
            for k in range(4):
                y = bottom + (top - bottom) * k / 3
                c.line(left, y, right, y)

            pts = [pos(i, v) for i, v in enumerate(nets)]
            area = c.beginPath()
            area.moveTo(pts[0][0], bottom)
            for p in pts:
                area.lineTo(*p)
            area.lineTo(pts[-1][0], bottom)
            area.close()
            c.saveState()
            c.setFillColor(colors.HexColor(BRAND))
            c.setFillAlpha(0.08)
            c.drawPath(area, stroke=0, fill=1)
            c.restoreState()

            line = c.beginPath()
            line.moveTo(*pts[0])
            for p in pts[1:]:
                line.lineTo(*p)
            c.setStrokeColor(colors.HexColor(BRAND))
            c.setLineWidth(1.6)
            c.drawPath(line, stroke=1, fill=0)

            slot -= 8
            for i, (row, (px, py)) in enumerate(zip(history, pts)):
                current = bool(row.get('is_current')) or i == n - 1
                c.setFillColor(colors.white)
                c.setStrokeColor(colors.HexColor(BRAND))
                c.setLineWidth(1.4)
                c.circle(px, py, 3.6 if current else 2.6, fill=1, stroke=1)
                if current:
                    c.setFillColor(colors.HexColor(BRAND))
                    c.circle(px, py, 1.8, fill=1, stroke=0)
                c.setFillColor(colors.HexColor(BRAND_DARK if current else INK))
                c.setFont(ctx.font_bold, 8 if current else 7.5)
                c.drawCentredString(px, py + 7, _fmt(nets[i], 2))

                label = _clip(c, row.get('exam_name') or '', ctx.font_bold if current else ctx.font, 6.5, slot)
                c.setFillColor(colors.HexColor(INK if current else INK_SOFT))
                c.setFont(ctx.font_bold if current else ctx.font, 6.5)
                c.drawCentredString(px, 17, label)
                c.setFillColor(colors.HexColor(MUTED))
                c.setFont(ctx.font, 6)
                c.drawCentredString(px, 9, _short_date(row.get('exam_date')))

    return Trend()


# ── Çalışılacak konular ────────────────────────────────────────────────────

def _focus_items(data: dict) -> tuple[str, str, list[tuple[str, str]]]:
    """Kazanım verisi varsa en zayıf konular, yoksa ders ders tekrar edilecek sorular."""
    topics = []
    for block in data.get('topic_blocks') or []:
        heading = (block.get('heading') or '').strip()
        for table in block.get('tables') or []:
            for row in table.get('rows') or []:
                wrong = int(row.get('yanlis') or 0)
                empty = int(row.get('bos') or 0)
                if wrong + empty <= 0:
                    continue
                topics.append((
                    float(row.get('basari') or 0), -(wrong + empty),
                    (row.get('name') or '').strip(),
                    heading or (table.get('title') or '').strip(),
                    wrong, empty,
                ))
    if topics:
        topics.sort(key=lambda t: (t[0], t[1]))
        items = []
        for _rate_v, _miss, name, section, wrong, empty in topics[:8]:
            bits = [b for b in (section, f'{wrong} yanlış' if wrong else '', f'{empty} boş' if empty else '') if b]
            items.append((name, ' · '.join(bits)))
        return 'Çalışılacak Konular', 'Başarısı en düşük kazanımlar', items

    items = []
    for grid in _visible_answer_grids(data):
        questions = grid.get('questions') or []
        numbered = [(q.get('n') or q.get('q') or i + 1, q) for i, q in enumerate(questions)]
        wrong = [n for n, q in numbered if q.get('result') == 'wrong']
        empty = [
            n for n, q in numbered
            if q.get('result') not in ('wrong', 'correct') and (q.get('correct') or '').strip()
        ]
        if not wrong and not empty:
            continue
        parts = []
        if wrong:
            parts.append(f'Yanlış: {_ranges(wrong)}')
        if empty:
            parts.append(f'Boş: {_ranges(empty)}')
        items.append((grid.get('section_name') or '', '   ·   '.join(parts)))
    return 'Tekrar Çözülecek Sorular', 'Numaralar her testin kendi soru sırasıdır', items


def _unbanded_question_count(data: dict) -> int:
    """Zorluk gruplarına girmeyen soru: iptal ya da anahtarda karşılığı olmayan."""
    if data.get('exam_type') == 'YKS_AYT':
        return 0
    bands = (data.get('difficulty') or {}).get('bands') or []
    banded = sum(int(b.get('soru') or 0) for b in bands)
    total = _question_total(data)
    return total - banded if 0 < banded < total else 0


def karne_insights(data: dict) -> dict:
    """Web önizlemesinin PDF ile aynı metni göstermesi için hesaplanan özet."""
    from apps.coaching.olcme_degerlendirme.views.analysis_views import is_unattempted_optional_section

    title, note, items = _focus_items(data)
    visible_grids = {id(grid) for grid in _visible_answer_grids(data)}
    return {
        'comment': _comment_lines(data),
        'focus': {
            'title': title,
            'note': note,
            'items': [{'name': name, 'detail': detail} for name, detail in items],
        },
        'unbanded_questions': _unbanded_question_count(data),
        'hidden_section_ids': [
            sd.get('section_id') for sd in data.get('section_details') or []
            if is_unattempted_optional_section(sd)
        ],
        'hidden_grid_ids': [
            grid.get('section_id') for grid in data.get('answer_grids') or []
            if id(grid) not in visible_grids
        ],
    }


def _focus_block(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.lib import colors
    from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

    title, note, items = _focus_items(data)
    if not items:
        return []
    rows = [
        [Paragraph(_xml_escape(name), ctx.s('tdName')), Paragraph(_xml_escape(detail), ctx.s('tdLeft'))]
        for name, detail in items
    ]
    t = Table(rows, colWidths=[ctx.page_w * 0.3, ctx.page_w * 0.7])
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, colors.HexColor(LINE)),
        ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(AMBER)),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor(SURFACE)]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 9),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    t.hAlign = 'LEFT'
    return [Spacer(1, 12), KeepTogether([_section_heading(ctx, title, note), Spacer(1, 5), t])]


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
                Paragraph(_xml_escape(caption), ctx.s('thLeft')),
                Paragraph('Soru', th), Paragraph('D', th), Paragraph('Y', th),
                Paragraph('B', th), Paragraph('Başarı', th),
            ]]
            for row in table.get('rows') or []:
                basari = row.get('basari') or 0
                basari_style = ctx.s('td').clone(f'Topic{len(rows)}')
                basari_style.textColor = colors.HexColor(_verim_color(basari))
                basari_style.fontName = ctx.font_bold
                rows.append([
                    Paragraph(_xml_escape(row.get('name') or ''), ctx.s('tdLeft')),
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

def _visible_answer_grids(data: dict) -> list[dict]:
    """Seçmeli felsefeye hiç cevap verilmediyse o ızgara gösterilmez."""
    from apps.coaching.olcme_degerlendirme.views.analysis_views import _is_optional_philosophy_section

    return [
        grid for grid in data.get('answer_grids') or []
        if not (
            _is_optional_philosophy_section(grid.get('section_name') or '')
            and not any((q.get('given') or '').strip() for q in grid.get('questions') or [])
        )
    ]


def _answer_grids(ctx: _Ctx, data: dict) -> list[Any]:
    """Soru bazlı cevap ızgarası — doğru/yanlış/boş hücre zeminiyle ayrışır."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    grids = _visible_answer_grids(data)
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
                ders_no = question.get('n') or question.get('q') or start + offset + 1

                nums.append(Paragraph(str(ders_no), ctx.s('gridNum')))
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


# ── Zorluk bandı ───────────────────────────────────────────────────────────

_BAND_COPY = {
    'kolay': ('Kolay', 'Çoğu öğrenci bildi', '%70+', GREEN),
    'orta': ('Orta', 'Ayırt eden sorular', '%40–70', AMBER),
    'zor': ('Zor', 'Az öğrenci bildi', '%40 altı', RED),
}


def _difficulty_focus(band: dict) -> tuple[str, str, str]:
    """Kartın büyük sayısı: kolaydaki yanlış öne çıkar, temiz bant doğruyu gösterir."""
    key = band.get('key') or ''
    wrong = int(band.get('yanlis') or 0)
    empty = int(band.get('bos') or 0)
    correct = int(band.get('dogru') or 0)
    if wrong and key == 'kolay':
        return str(wrong), 'yanlış', RED
    if wrong and key == 'orta':
        return str(wrong), 'yanlış', AMBER
    if wrong:
        return str(wrong), 'yanlış', INK
    if empty and key == 'kolay':
        return str(empty), 'boş', AMBER
    return str(correct), 'doğru', GREEN


def _difficulty_block(ctx: _Ctx, data: dict) -> list[Any]:
    """Kolay / orta / zor kartları. Bant yoksa veya kurum 20 kişinin altındaysa boş."""
    from reportlab.lib import colors
    from reportlab.platypus import Flowable, Paragraph, Spacer, Table, TableStyle

    block = data.get('difficulty') or {}
    bands = block.get('bands') or []
    if not bands:
        return []

    class _SplitMeter(Flowable):
        def __init__(self, dogru, yanlis, bos):
            super().__init__()
            self.parts = (
                (int(dogru or 0), GREEN),
                (int(yanlis or 0), RED),
                (int(bos or 0), '#CBD5E1'),
            )
            self.height = 7
            self._w = 0

        def wrap(self, availWidth, availHeight):
            self._w = availWidth
            return availWidth, self.height

        def draw(self):
            c = self.canv
            total = sum(n for n, _ in self.parts) or 1
            h = self.height
            c.saveState()
            clip = c.beginPath()
            clip.roundRect(0, 0, self._w, h, 2)
            c.clipPath(clip, stroke=0)
            c.setFillColor(colors.HexColor('#E6EDF5'))
            c.rect(0, 0, self._w, h, fill=1, stroke=0)
            x = 0
            for count, color in self.parts:
                w = self._w * count / total
                if w <= 0:
                    continue
                c.setFillColor(colors.HexColor(color))
                c.rect(x, 0, w, h, fill=1, stroke=0)
                x += w
            c.restoreState()

    gap = 6
    n = len(bands)
    card_w = (ctx.page_w - gap * (n - 1)) / n
    cards = []
    for band in bands:
        key = band.get('key') or ''
        label, hint, tag, tone = _BAND_COPY.get(
            key, (band.get('label') or '', '', '', INK),
        )
        if band.get('scope') == 'alan' and key == 'orta':
            hint = 'Alanındaki ayırt eden sorular'
        elif band.get('scope') == 'alan' and key == 'zor':
            hint = 'Alanındaki zor sorular'
        value, unit, num_color = _difficulty_focus(band)
        correct = int(band.get('dogru') or 0)
        wrong = int(band.get('yanlis') or 0)
        empty = int(band.get('bos') or 0)
        total = int(band.get('soru') or 0)
        bits = []
        if unit != 'doğru' and correct:
            bits.append(f'{correct} doğru')
        if unit != 'yanlış' and wrong:
            bits.append(f'{wrong} yanlış')
        if unit != 'boş' and empty:
            bits.append(f'{empty} boş')
        bits.append(f'{total} soru')

        inner_w = card_w - 14
        title = ctx.s('tdName').clone(f'diffTitle{key}')
        title.textColor = colors.HexColor(tone)
        title.fontSize = 9
        tag_style = ctx.s('tdMuted').clone(f'diffTag{key}')
        tag_style.alignment = 2
        hint_style = ctx.s('tdMuted').clone(f'diffHint{key}')
        hint_style.alignment = 0
        hint_style.fontSize = 7
        num = ctx.s('tdName').clone(f'diffNum{key}')
        num.fontSize = 16
        num.leading = 18
        num.textColor = colors.HexColor(num_color)
        unit_style = ctx.s('tdMuted').clone(f'diffUnit{key}')
        unit_style.alignment = 0
        meta = ctx.s('tdLeft').clone(f'diffMeta{key}')
        meta.fontSize = 7
        meta.textColor = colors.HexColor(INK_SOFT)

        head = Table(
            [[Paragraph(label, title), Paragraph(tag, tag_style)]],
            colWidths=[inner_w * 0.62, inner_w * 0.38],
        )
        head.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        figure = Table(
            [[Paragraph(value, num), Paragraph(unit, unit_style)]],
            colWidths=[inner_w * 0.32, inner_w * 0.68],
        )
        figure.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        body = Table(
            [
                [head],
                [Paragraph(hint, hint_style)],
                [figure],
                [Paragraph(' · '.join(bits), meta)],
                [_SplitMeter(correct, wrong, empty)],
            ],
            colWidths=[card_w],
        )
        body.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
            ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(tone)),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, 0), 6),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 7),
            ('TOPPADDING', (0, 1), (-1, -2), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -2), 1),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        cards.append(body)

    row = []
    widths = []
    for index, card in enumerate(cards):
        row.append(card)
        widths.append(card_w + (gap if index < n - 1 else 0))
    grid = Table([row], colWidths=widths)
    pad_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]
    for index in range(n - 1):
        pad_cmds.append(('RIGHTPADDING', (index, 0), (index, 0), gap))
    grid.setStyle(TableStyle(pad_cmds))
    grid.hAlign = 'LEFT'

    flow: list[Any] = [
        Spacer(1, 12),
        _section_heading(
            ctx,
            'Zorluk Seviyesi',
            'Soru, kurumun doğru oranına göre gruplandı',
        ),
        Spacer(1, 6),
        grid,
    ]
    missing = _unbanded_question_count(data)
    if missing:
        flow += [
            Spacer(1, 4),
            Paragraph(
                f'{missing} soru iptal edildiği ya da cevap anahtarında eşleşmediği için gruplara girmedi.',
                ctx.s('alanNote'),
            ),
        ]
    note = (block.get('note') or '').strip()
    if note:
        callout = Table(
            [[Paragraph(_xml_escape(note), ctx.s('diffNote'))]],
            colWidths=[ctx.page_w],
        )
        callout.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(BRAND_SOFT)),
            ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(BRAND)),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        callout.hAlign = 'LEFT'
        flow.append(Spacer(1, 6))
        flow.append(callout)
    return flow


# ── Sayfa kurgusu ──────────────────────────────────────────────────────────

def _summary_page(ctx: _Ctx, data: dict) -> list[Any]:
    """Birinci sayfa: veli ve öğrencinin telefonda ilk göreceği özet."""
    from reportlab.platypus import KeepTogether, Spacer

    flow: list[Any] = []
    flow.append(_hero_header(ctx, data))
    flow.append(Spacer(1, 8))
    flow.append(_kpi_band(ctx, data))
    note = _alan_net_note(ctx, data)
    if note is not None:
        flow.append(Spacer(1, 4))
        flow.append(note)

    for block in (_overview(ctx, data), _comment_card(ctx, data), _trend_chart(ctx, data)):
        if block is not None:
            flow.append(Spacer(1, 9))
            flow.append(block)

    ref_year = data.get('referans_yil')
    note = f'Tahmini sıralama {ref_year} verilerine göre' if ref_year else ''
    flow.append(Spacer(1, 12))
    flow.append(KeepTogether([
        _section_heading(ctx, 'Puan ve Sıralama', note),
        Spacer(1, 5),
        _ranking_table(ctx, data),
    ]))
    return flow


def _detail_page(ctx: _Ctx, data: dict) -> list[Any]:
    """İkinci sayfa: ders tablosu ve analiz önce, ham cevaplar en sonda."""
    from reportlab.platypus import KeepTogether, Spacer

    flow: list[Any] = [_running_header(ctx, data, 'Ders Analizi'), Spacer(1, 10)]
    if data.get('strong_areas') or data.get('weak_areas'):
        flow.append(KeepTogether([
            _section_heading(ctx, 'Güçlü ve Geliştirilecek Alanlar', 'Başarı = net / soru · kurum farkı net'),
            Spacer(1, 5),
            _area_pair(ctx, data),
        ]))
        flow.append(Spacer(1, 12))
    if _ordered_sections(data):
        flow.append(_section_heading(ctx, 'Ders / Test Performansı', 'Fark sütunları öğrencinin ortalamaya göre konumudur'))
        flow.append(Spacer(1, 5))
        flow.append(_performance_table(ctx, data))
    flow.extend(_difficulty_block(ctx, data))
    flow.extend(_focus_block(ctx, data))

    grids = _answer_grids(ctx, data)
    if grids:
        flow.append(Spacer(1, 12))
        flow.append(KeepTogether([
            _section_heading(ctx, 'Cevaplar', 'Öğrenci cevabı ve doğru cevap'),
            Spacer(1, 5),
            *grids[:5],
        ]))
        flow += grids[5:]
    return flow if len(flow) > 2 else []


def _topic_page(ctx: _Ctx, data: dict) -> list[Any]:
    from reportlab.platypus import Spacer

    tables = _topic_tables(ctx, data)
    if not tables:
        return []
    flow: list[Any] = [_running_header(ctx, data, 'Kazanım Analizi'), Spacer(1, 10)]
    flow += tables
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
        pages = [
            _summary_page(ctx, data),
            _detail_page(ctx, data),
            _topic_page(ctx, data),
        ]

        for page in [p for p in pages if p]:
            if story:
                story.append(PageBreak())
            story.extend(page)
        # Boş veri gelse bile öğrenci başına en az bir sayfa üretilir
        if index < len(payloads) - 1 and not story:
            story.append(PageBreak())

    doc.build(story, canvasmaker=_make_numbered_canvas(font))
    return buf.getvalue()
