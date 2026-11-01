"""
Ölçme karnesi — HTML şablonu (önizleme ve Chromium PDF aynı belge).

Girdi `build_student_detail_payload` çıktısıdır. Modül veri yazmaz; yalnız kurum markası
ve ders bazında geçmiş netler için okuma sorgusu yapar.
"""
from __future__ import annotations

import base64
import html
import io
import math
import mimetypes
import re
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from django.utils.safestring import mark_safe

DEFAULT_THEME = '#0262a7'
AYT_TYPES = ('YKS_AYT', 'AYT_11')
HISTORY_LIMIT = 5
_HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
_MONTHS = (
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
)
_FONT_DIR = Path(settings.BASE_DIR) / 'static' / 'fonts' / 'karne'
# Statik ve Türkçe alt kümeli dosyalar. Değişken font Chromium PDF'ine tamamen gömülür.
_FONTS = (
    ('Inter', 'Inter-Regular.ttf', '400'),
    ('Inter', 'Inter-Medium.ttf', '500'),
    ('Inter', 'Inter-SemiBold.ttf', '600'),
    ('Inter', 'Inter-Bold.ttf', '700'),
    ('Poppins', 'Poppins-SemiBold.ttf', '600'),
    ('Poppins', 'Poppins-Bold.ttf', '700'),
)
_font_css_cache: str | None = None


# ── Biçim ──────────────────────────────────────────────────────────────────

def _num(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def tr(value, digits: int = 2) -> str:
    if value is None:
        return '–'
    text = f'{_num(value):,.{digits}f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    if digits and text.endswith(',' + '0' * digits):
        text = text[: -(digits + 1)]
    return text


def tr_int(value) -> str:
    return f'{int(_num(value)):,}'.replace(',', '.')


def tr_date(iso) -> str:
    raw = str(iso or '')[:10]
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return raw
    y, m, d = raw.split('-')
    return f'{int(d)} {_MONTHS[int(m) - 1]} {y}'


def _short_date(iso) -> str:
    raw = str(iso or '')[:10]
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return ''
    return f'{raw[8:10]}.{raw[5:7]}'


def _ratio(net, count) -> float:
    count = _num(count)
    if count <= 0:
        return 0.0
    return max(0.0, min(1.0, _num(net) / count))


def _tone(ratio: float) -> str:
    if ratio >= 0.7:
        return 'good'
    if ratio >= 0.45:
        return 'mid'
    return 'bad'


_ONES = {0: 'ı', 1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i', 6: 'sı', 7: 'si', 8: 'i', 9: 'u'}
_TENS = {1: 'u', 2: 'si', 3: 'u', 4: 'ı', 5: 'si', 6: 'ı', 7: 'i', 8: 'i', 9: 'ı'}


def poss(n: int) -> str:
    """75'i, 50'si, 30'u, 100'ü — sayının okunuşuna göre iyelik eki."""
    n = int(n)
    if n == 0:
        suffix = 'ı'
    elif n % 100 == 0:
        suffix = 'ü'
    elif n % 10:
        suffix = _ONES[n % 10]
    else:
        suffix = _TENS[(n // 10) % 10]
    return f"{n}'{suffix}"


def poss_gen(n: int) -> str:
    """75'inin, 50'sinin, 30'unun."""
    text = poss(n)
    return f'{text}n{text[-1]}n'


def _signed(value) -> dict:
    value = _num(value)
    return {'pos': value >= 0, 'text': f"{'+' if value >= 0 else '−'}{tr(abs(value))}"}


# ── Gömülü varlıklar ───────────────────────────────────────────────────────

def _data_uri(path) -> str:
    try:
        file = Path(path)
        if not file.is_file():
            return ''
        mime = mimetypes.guess_type(file.name)[0] or 'image/png'
        return f'data:{mime};base64,{base64.b64encode(file.read_bytes()).decode("ascii")}'
    except (OSError, TypeError, ValueError):
        return ''


def _photo_uri(path, size: int = 320) -> str:
    """Profil fotoğrafı küçültülüp gömülür; toplu PDF ve WhatsApp eki şişmesin."""
    try:
        file = Path(path)
        if not file.is_file():
            return ''
        from PIL import Image, ImageOps

        with Image.open(file) as img:
            img = ImageOps.exif_transpose(img).convert('RGB')
            img.thumbnail((size, size))
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=82, optimize=True)
        return f'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode("ascii")}'
    except Exception:
        return _data_uri(path)


def _font_css() -> str:
    global _font_css_cache
    if _font_css_cache is None:
        rules = []
        for family, filename, weight in _FONTS:
            path = _FONT_DIR / filename
            if not path.is_file():
                continue
            data = base64.b64encode(path.read_bytes()).decode('ascii')
            rules.append(
                f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;"
                f"src:url(data:font/ttf;base64,{data}) format('truetype');}}"
            )
        _font_css_cache = ''.join(rules)
    return _font_css_cache


def _brandings(payloads: list[dict]) -> dict[int, dict]:
    """answer_id → {theme, logo}. Kurumun koyu zemin logosu yoksa varsayılan beyaz logo."""
    from apps.coaching.application.olcme_karne_pdf import _logo_path
    from apps.coaching.olcme_degerlendirme.models import StudentAnswer
    from apps.kurum.domain.models import Kurum

    ids = [p.get('answer_id') for p in payloads if p.get('answer_id')]
    kurum_of = dict(
        StudentAnswer.objects.filter(id__in=ids).values_list('id', 'session__exam__kurum_id')
    )
    kurumlar = {k.id: k for k in Kurum.objects.filter(id__in=set(kurum_of.values()))}
    default_logo = _data_uri(_logo_path()) if _logo_path() else ''
    cache: dict[int | None, dict] = {}
    out: dict[int, dict] = {}
    for aid in ids:
        kid = kurum_of.get(aid)
        if kid not in cache:
            kurum = kurumlar.get(kid)
            theme = (getattr(kurum, 'tema_rengi', '') or '').strip()
            logo = ''
            if kurum and kurum.login_logo:
                try:
                    logo = _data_uri(kurum.login_logo.path)
                except (NotImplementedError, ValueError):
                    logo = ''
            cache[kid] = {
                'theme': theme if _HEX.match(theme) else DEFAULT_THEME,
                'logo': logo or default_logo,
            }
        out[aid] = cache[kid]
    return out


# ── SVG ────────────────────────────────────────────────────────────────────

def _donut(correct, wrong, empty, size=118, stroke=13) -> str:
    total = max(1, correct + wrong + empty)
    r = (size - stroke) / 2
    circ = 2 * math.pi * r
    offset = 0.0
    segs = []
    for value, color in ((correct, 'var(--good)'), (wrong, 'var(--bad)'), (empty, 'var(--empty)')):
        length = circ * value / total
        segs.append(
            f'<circle r="{r}" cx="{size / 2}" cy="{size / 2}" fill="none" stroke="{color}" '
            f'stroke-width="{stroke}" stroke-dasharray="{length:.2f} {circ - length:.2f}" '
            f'stroke-dashoffset="{-offset:.2f}"/>'
        )
        offset += length
    return (
        f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" style="transform:rotate(-90deg)">'
        + ''.join(segs) + '</svg>'
    )


def _ring(ratio: float, size=46, stroke=5.5) -> str:
    r = (size - stroke) / 2
    circ = 2 * math.pi * r
    length = circ * max(0.0, min(1.0, ratio))
    c = size / 2
    return (
        f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" class="ring {_tone(ratio)}">'
        f'<circle r="{r}" cx="{c}" cy="{c}" class="track" stroke-width="{stroke}" fill="none"/>'
        f'<circle r="{r}" cx="{c}" cy="{c}" class="val" stroke-width="{stroke}" fill="none" '
        f'stroke-dasharray="{length:.2f} {circ:.2f}" transform="rotate(-90 {c} {c})" stroke-linecap="round"/>'
        f'<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle">%{round(ratio * 100)}</text></svg>'
    )


def _line_chart(points: list[dict], avg, theme: str, uid: str, w=330, h=100) -> str:
    if len(points) < 2:
        return ''
    pad_l, pad_r, pad_t, pad_b = 18, 22, 18, 22
    values = [_num(p.get('toplam_net')) for p in points] + ([_num(avg)] if avg else [])
    lo, hi = min(values) - 6, max(values) + 6
    xs = [pad_l + i * (w - pad_l - pad_r) / (len(points) - 1) for i in range(len(points))]

    def y(v):
        return pad_t + (hi - v) * (h - pad_t - pad_b) / ((hi - lo) or 1)

    path = ' '.join(
        f'{"M" if i == 0 else "L"}{x:.1f},{y(_num(p.get("toplam_net"))):.1f}'
        for i, (x, p) in enumerate(zip(xs, points))
    )
    area = path + f' L{xs[-1]:.1f},{h - pad_b} L{xs[0]:.1f},{h - pad_b} Z'
    dots = []
    for x, p in zip(xs, points):
        cur = bool(p.get('is_current'))
        v = _num(p.get('toplam_net'))
        dots.append(
            f'<circle cx="{x:.1f}" cy="{y(v):.1f}" r="{5 if cur else 3.5}" class="dot{" cur" if cur else ""}"/>'
            f'<text x="{x:.1f}" y="{y(v) - 9:.1f}" text-anchor="middle" class="lbl{" cur" if cur else ""}">{tr(v)}</text>'
            f'<text x="{x:.1f}" y="{h - 6}" text-anchor="middle" class="axis">{html.escape(_short_date(p.get("exam_date")))}</text>'
        )
    avg_line = ''
    if avg:
        avg_line = (
            f'<line x1="{pad_l}" x2="{w - pad_r}" y1="{y(_num(avg)):.1f}" y2="{y(_num(avg)):.1f}" class="avg"/>'
            f'<text x="{w - pad_r}" y="{y(_num(avg)) + 11:.1f}" text-anchor="end" class="axis">kurum ort. {tr(avg)}</text>'
        )
    gid = f'g{uid}'
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%" class="trend">'
        f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{theme}" stop-opacity=".22"/>'
        f'<stop offset="1" stop-color="{theme}" stop-opacity="0"/></linearGradient></defs>'
        f'<path d="{area}" fill="url(#{gid})"/>{avg_line}<path d="{path}" class="line"/>{"".join(dots)}</svg>'
    )


def _sparkline(values: list[float | None], top: float, w=150, h=36, pad=5) -> str:
    pts = [(i, v) for i, v in enumerate(values) if v is not None]
    vs = [v for _, v in pts]
    lo, hi = max(0.0, min(vs) - 3), min(top or max(vs) + 3, max(vs) + 3)
    span = (hi - lo) or 1

    def x(i):
        return pad + i * (w - 2 * pad) / max(1, len(values) - 1)

    def y(v):
        return h - pad - (v - lo) * (h - 2 * pad) / span

    path = ' '.join(f"{'M' if k == 0 else 'L'}{x(i):.1f},{y(v):.1f}" for k, (i, v) in enumerate(pts))
    last = pts[-1][0]
    dots = ''.join(f'<circle cx="{x(i):.1f}" cy="{y(v):.1f}" r="{3 if i == last else 2}"/>' for i, v in pts)
    return f'<svg viewBox="0 0 {w} {h}" width="100%"><path d="{path}"/>{dots}</svg>'


# ── Görünüm modeli ─────────────────────────────────────────────────────────

def _tree(rows: list[dict]) -> dict:
    mains = [r for r in rows if not r.get('is_sub_section')]
    subs: dict = {}
    for row in rows:
        if row.get('is_sub_section') and row.get('parent_id'):
            subs.setdefault(row['parent_id'], []).append(row)
    main_ids = {m.get('section_id') for m in mains}
    orphans = [r for r in rows if r.get('is_sub_section') and r.get('parent_id') not in main_ids]
    ordered = mains + orphans
    leaves = [r for r in rows if r.get('is_sub_section') or not subs.get(r.get('section_id'))]
    return {'mains': ordered, 'subs': subs, 'leaves': leaves}


def _scope(data: dict) -> dict:
    """Bütün testler girer. Yalnızca çözülmemiş seçmeli (Felsefe) dışarıda kalır.

    Bağlı TYT ayrı grupta, alan dışı AYT testleri kendi satırında durur. Puan
    hesabı ise yalnız alana giren testlerden yapılır.
    """
    insights = data.get('karne_insights') or {}
    hidden = set(insights.get('hidden_section_ids') or [])
    hidden_grids = set(insights.get('hidden_grid_ids') or []) | hidden
    current, linked, excluded = [], [], []
    for row in data.get('section_details') or []:
        if row.get('section_id') in hidden:
            excluded.append(row)
        elif row.get('source') == 'tyt':
            linked.append(row)
        else:
            current.append(row)
    tree = _tree(current)
    score = [r for r in tree['leaves'] if r.get('alana_dahil') is not False]
    return {
        **tree,
        'tyt': _tree(linked),
        'score_leaves': score or tree['leaves'],
        'score_names': {r.get('section_name') for r in (score or tree['leaves'])},
        'hidden_grids': hidden_grids,
        'excluded_names': {r.get('section_name') for r in excluded},
        # Üst test, çocuğundan biri alandaysa dahildir. Alan dışı testin
        # kitapçık numarası tekrar listesine girmez.
        'out_ids': {r.get('section_id') for r in current if r.get('alana_dahil') is False},
    }


def _wrong_per_correct(data: dict, leaves: list[dict]) -> int:
    """Kaç yanlış bir doğruyu götürür. Sınav ayarı payload'da yok; öğrencinin kendi netinden çıkar."""
    correct = sum(_num(r.get('correct')) for r in leaves)
    wrong = sum(_num(r.get('wrong')) for r in leaves)
    net = sum(_num(r.get('net')) for r in leaves)
    lost = correct - net
    if wrong > 0 and lost > 0.01:
        k = round(wrong / lost)
        if 2 <= k <= 6:
            return k
    if wrong > 0 and abs(lost) <= 0.01:
        return 0
    return 3 if str(data.get('exam_type') or '').startswith('LGS') else 4


def _counts(data: dict, leaves: list[dict]) -> tuple[int, int, int, int]:
    if data.get('exam_type') in AYT_TYPES and leaves:
        c = sum(int(_num(r.get('correct'))) for r in leaves)
        w = sum(int(_num(r.get('wrong'))) for r in leaves)
        e = sum(int(_num(r.get('empty'))) for r in leaves)
        return c, w, e, sum(int(_num(r.get('question_count'))) for r in leaves) or (c + w + e)
    c = int(_num(data.get('total_correct')))
    w = int(_num(data.get('total_wrong')))
    total = int(_num(data.get('alan_soru') or data.get('total_questions')))
    e = max(0, total - c - w) if total else int(_num(data.get('total_empty')))
    return c, w, e, total or (c + w + e)


def _topic_tables(data: dict, scope: dict) -> list[dict]:
    blocks = []
    excluded = scope['excluded_names']
    for block in data.get('topic_blocks') or []:
        if block.get('heading') in excluded:
            continue
        tables = [t for t in block.get('tables') or [] if t.get('title') not in excluded]
        if tables:
            blocks.append({'heading': block.get('heading') or '', 'tables': tables, 'multi': len(block.get('tables') or []) > 1})
    return blocks


def _priorities(blocks: list[dict], scope: dict, penalty: float, limit: int = 3) -> list[dict]:
    """Konular, puana giren testlerden seçilir. Alan dışı boş test sahte öncelik üretmesin."""
    names = scope['score_names']
    rows = []
    for block in blocks:
        for table in block['tables']:
            if names and table.get('title') not in names and block.get('heading') not in names:
                continue
            for r in table.get('rows') or []:
                wrong, empty = int(_num(r.get('yanlis'))), int(_num(r.get('bos')))
                if wrong + empty <= 0:
                    continue
                gain = wrong * (1 + penalty) + empty
                rows.append((gain, _num(r.get('basari')), r.get('name') or '', table.get('title') or '', wrong, empty))
    if not rows:
        for s in scope['score_leaves']:
            wrong, empty = int(_num(s.get('wrong'))), int(_num(s.get('empty')))
            if wrong + empty <= 0:
                continue
            gain = wrong * (1 + penalty) + empty
            rows.append((gain, _ratio(s.get('net'), s.get('question_count')), s.get('section_name') or '', '', wrong, empty))
    rows.sort(key=lambda t: (-t[0], t[1]))
    out = []
    for gain, _b, name, title, wrong, empty in rows[:limit]:
        bits = [f'{wrong} yanlış' if wrong else '', f'{empty} boş' if empty else '']
        detail = ' · '.join(b for b in [title, *bits] if b)
        out.append({'name': name, 'detail': detail, 'gain': tr(gain)})
    return out


def _difficulty(data: dict, penalty: float) -> dict | None:
    diff = data.get('difficulty') or {}
    bands = {b.get('key'): b for b in diff.get('bands') or []}
    if not bands:
        return None
    rows = []
    for key in ('kolay', 'orta', 'zor'):
        b = bands.get(key)
        if not b or not b.get('soru'):
            continue
        total = _num(b.get('soru')) or 1
        rows.append({
            'label': b.get('label') or key.title(),
            'soru': int(_num(b.get('soru'))),
            'dogru': int(_num(b.get('dogru'))),
            'yanlis': int(_num(b.get('yanlis'))),
            'bos': int(_num(b.get('bos'))),
            'w_dogru': f"{_num(b.get('dogru')) / total * 100:.1f}",
            'w_yanlis': f"{_num(b.get('yanlis')) / total * 100:.1f}",
            'w_bos': f"{_num(b.get('bos')) / total * 100:.1f}",
        })
    if not rows:
        return None
    lost_w = sum(int(_num(bands.get(k, {}).get('yanlis'))) for k in ('kolay', 'orta'))
    lost_e = sum(int(_num(bands.get(k, {}).get('bos'))) for k in ('kolay', 'orta'))
    scope_alan = any(b.get('scope') == 'alan' for b in bands.values())
    return {
        'rows': rows,
        'note': diff.get('note') or '',
        'hint': 'Zorluk, kurumdaki doğru oranına göre belirlenir.'
                + (' Orta ve zor sorular alan derslerinden sayılır.' if scope_alan else ''),
        'recover_count': lost_w + lost_e,
        'recover_net': lost_w * (1 + penalty) + lost_e,
        'has_kolay': 'kolay' in bands,
    }


def _section_history(data: dict, mains: list[dict], history: list[dict]) -> list[dict]:
    """Ana derslerin son sınavlardaki netleri. Önizleme net_trend verir; PDF için okunur."""
    if len(history) < 2 or not mains:
        return []
    exam_ids = [h['exam_id'] for h in history]
    nets: dict = {}
    trend = data.get('net_trend') or []
    if trend:
        for t in trend:
            if t.get('exam_id') in exam_ids:
                nets[t['exam_id']] = t.get('section_nets') or {}
    elif data.get('student_id'):
        from apps.coaching.olcme_degerlendirme.models import StudentSectionScore

        rows = (
            StudentSectionScore.objects
            .filter(
                student_answer__student_id=data['student_id'],
                student_answer__session__exam_id__in=exam_ids,
                student_answer__session__status='COMPLETED',
                section__parent_section__isnull=True,
            )
            .values_list('student_answer__session__exam_id', 'section__name', 'net')
        )
        for exam_id, name, net in rows:
            nets.setdefault(exam_id, {})[name] = _num(net)
    cards = []
    for m in mains:
        name = m.get('section_name')
        values = [nets.get(eid, {}).get(name) for eid in exam_ids]
        pts = [v for v in values if v is not None]
        if len(pts) < 2:
            continue
        first, last = pts[0], pts[-1]
        cards.append({
            'name': name,
            'svg': mark_safe(_sparkline(values, _num(m.get('question_count')))),
            'first': tr(first),
            'last': tr(last),
            'soru': int(_num(m.get('question_count'))),
            'delta': _signed(last - first),
        })
    return cards


def _ranking(data: dict) -> dict | None:
    pts = data.get('puan_turleri') or {}
    avgs = data.get('puan_turleri_avgs') or {}
    alan_pt = data.get('alan_puan_turu')
    labels = {'SAY': 'Sayısal', 'EA': 'Eşit Ağırlık', 'SOZ': 'Sözel', 'DIL': 'Dil'}
    order = sorted(pts.keys(), key=lambda k: (k != alan_pt, k))
    rows = []
    for key in order:
        pt = pts[key] or {}
        rows.append({
            'label': labels.get(key, key),
            'is_alan': key == alan_pt,
            'puan': tr(pt.get('puan')),
            'avg': tr(avgs.get(key)) if avgs.get(key) is not None else '–',
            'net': tr(pt.get('ayt_net')),
            'kurum': f"{pt['kurum_ici_sira']}. / {data.get('toplam_ogrenci') or '–'}" if pt.get('kurum_ici_sira') else '–',
            'turkiye': f"~{tr_int(pt['tahmini_siralama'])}" if pt.get('tahmini_siralama') else '–',
        })
    if not rows:
        return None
    tyt = data.get('tyt_siralama') or None
    tyt_row = None
    if tyt:
        tyt_row = {
            'name': data.get('linked_tyt_exam_name') or 'TYT',
            'net': tr(tyt.get('net')),
            'puan': tr(tyt.get('puan')),
            'kurum': f"{tyt['kurum_ici_sira']}. / {tyt.get('toplam_ogrenci') or '–'}" if tyt.get('kurum_ici_sira') else '–',
            'turkiye': f"~{tr_int(tyt['tahmini_siralama'])}" if tyt.get('tahmini_siralama') else '–',
        }
    return {'rows': rows, 'tyt': tyt_row, 'year': data.get('referans_yil')}


def _retry(data: dict, scope: dict) -> list[dict]:
    out = []
    for g in data.get('answer_grids') or []:
        if g.get('section_id') in scope['hidden_grids'] or g.get('section_id') in scope['out_ids']:
            continue
        qs = g.get('questions') or []
        wrong = [q.get('n') for q in qs if q.get('result') == 'wrong']
        empty = [q.get('n') for q in qs if q.get('result') not in ('wrong', 'correct') and q.get('correct')]
        if wrong or empty:
            out.append({'name': g.get('section_name') or '', 'wrong': wrong, 'empty': empty})
    return out


def _answer_rows(data: dict, scope: dict) -> list[dict]:
    out = []
    for g in data.get('answer_grids') or []:
        if g.get('section_id') in scope['hidden_grids']:
            continue
        cells = []
        for q in g.get('questions') or []:
            res = q.get('result')
            cls = 'good' if res == 'correct' else 'bad' if res == 'wrong' else 'empty'
            cells.append({
                'n': q.get('n'),
                'given': q.get('given') or '·',
                'fix': q.get('correct') if res != 'correct' and q.get('correct') else '',
                'cls': cls,
            })
        if cells:
            out.append({'name': g.get('section_name') or '', 'cells': cells})
    return out


def _outcome_blocks(blocks: list[dict]) -> list[dict]:
    out = []
    for block in blocks:
        tables = []
        for t in block['tables']:
            rows = [{
                'name': r.get('name') or '',
                'dots': (['good'] * int(_num(r.get('dogru'))) + ['bad'] * int(_num(r.get('yanlis')))
                         + ['empty'] * int(_num(r.get('bos')))),
            } for r in t.get('rows') or []]
            tables.append({'title': t.get('title') if block['multi'] else '', 'rows': rows})
        out.append({'heading': block['heading'], 'tables': tables})
    return out


def _lessons(scope: dict) -> list[dict]:
    out = []
    for m in scope['mains']:
        q = _num(m.get('question_count'))
        ratio = _ratio(m.get('net'), q)
        subs = []
        for s in scope['subs'].get(m.get('section_id'), []):
            sq = _num(s.get('question_count'))
            r = _ratio(s.get('net'), sq)
            subs.append({
                'name': s.get('section_name') or '',
                'net': tr(s.get('net')),
                'soru': int(sq),
                'w': f'{r * 100:.0f}',
                'kw': f"{_ratio(s.get('kurum_avg_net'), sq) * 100:.0f}",
                'tone': _tone(r),
            })
        out.append({
            'name': m.get('section_name') or '',
            'ring': mark_safe(_ring(ratio, size=48)),
            'net': tr(m.get('net')),
            'soru': int(q),
            'diff': _signed(m.get('diff_kurum')),
            'subs': subs,
            'out': m.get('alana_dahil') is False,
        })
    return out


def _table_rows(scope: dict, *, group: str = '') -> list[dict]:
    rows = [{'kind': 'group', 'name': group}] if group and scope['mains'] else []

    def row(s, kind):
        q = _num(s.get('question_count'))
        r = _ratio(s.get('net'), q)
        return {
            'kind': kind,
            'name': s.get('section_name') or '',
            'note': 'Puana girmez' if s.get('alana_dahil') is False and not s.get('is_sub_section') else '',
            'soru': int(q),
            'd': s.get('correct'), 'y': s.get('wrong'), 'b': s.get('empty'),
            'net': tr(s.get('net')),
            'w': f'{r * 100:.0f}', 'pct': round(r * 100), 'tone': _tone(r),
            'avg': tr(s.get('kurum_avg_net')),
            'diff': _signed(s.get('diff_kurum')),
        }

    for m in scope['mains']:
        kids = scope['subs'].get(m.get('section_id'), [])
        rows.append(row(m, 'main' if kids else 'plain'))
        rows.extend(row(s, 'subrow') for s in kids)
    return rows


def build_karne_context(data: dict, branding: dict | None = None, uid: str = '0') -> dict:
    branding = branding or {'theme': DEFAULT_THEME, 'logo': ''}
    scope = _scope(data)
    is_ayt = data.get('exam_type') in AYT_TYPES
    k = _wrong_per_correct(data, scope['score_leaves'])
    penalty = 1 / k if k else 0.0
    correct, wrong, empty, soru = _counts(data, scope['score_leaves'])
    net = data.get('alan_net') if data.get('alan_net') is not None else data.get('toplam_net')

    history = [h for h in data.get('net_history') or [] if h.get('exam_id')]
    prev = history[-2] if len(history) >= 2 and history[-1].get('is_current') else None
    delta = _signed(_num(history[-1].get('toplam_net')) - _num(prev.get('toplam_net'))) if prev else None

    name = (data.get('student_name') or '').strip()
    initials = ''.join(p[0] for p in name.split()[:2] if p).upper()
    alan_pt = data.get('alan_puan_turu') if is_ayt else None

    blocks = _topic_tables(data, scope)
    difficulty = _difficulty(data, penalty)
    lessons = _lessons(scope)
    tyt_lessons = _lessons(scope['tyt'])
    ahead = data.get('kurum_ici_yuzdelik')
    net_label = 'net'
    if is_ayt and data.get('net_etiket') and data.get('net_etiket') != 'NET':
        net_label = data['net_etiket'].replace(' NET', '') + ' net'

    has_trend = len(history) >= 2
    shown = [lesson for lesson in lessons if not lesson['out']] or lessons
    cmp_source = scope['mains'] if len(scope['mains']) >= 3 else scope['leaves']
    cmp_source = [m for m in cmp_source if m.get('alana_dahil') is not False] or cmp_source
    cmp_rows = [{
        'name': m.get('section_name') or '',
        'w': f"{_ratio(m.get('net'), m.get('question_count')) * 100:.0f}",
        'kw': f"{_ratio(m.get('kurum_avg_net'), m.get('question_count')) * 100:.0f}",
        'tone': _tone(_ratio(m.get('net'), m.get('question_count'))),
        'diff': _signed(m.get('diff_kurum')),
    } for m in cmp_source]
    ranking = _ranking(data)
    kurum_scale = None
    if not has_trend and soru:
        kurum_scale = {
            'student': f'{_ratio(net, soru) * 100:.1f}',
            'avg': f"{_ratio(data.get('kurum_avg_net'), soru) * 100:.1f}",
            'net': tr(net),
            'avg_net': tr(data.get('kurum_avg_net')),
            'soru': soru,
            'diff': _signed(_num(net) - _num(data.get('kurum_avg_net'))),
        }

    meta = [data.get('sinif') or '', f"No {data['raw_student_id']}" if data.get('raw_student_id') else '', data.get('kurum_ad') or '']
    photo = _photo_uri(data.get('profil_foto_path')) if data.get('profil_foto_path') else ''

    return {
        'uid': uid,
        'theme': branding['theme'],
        'logo': branding['logo'],
        'photo': photo,
        'initials': initials,
        'name': name,
        'meta': ' · '.join(m for m in meta if m),
        'kurum_ad': data.get('kurum_ad') or '',
        'exam_name': data.get('exam_name') or '',
        'exam_label': data.get('exam_type_label') or '',
        'date': tr_date(data.get('session_date')),
        'donut': mark_safe(_donut(correct, wrong, empty)),
        'correct': correct, 'wrong': wrong, 'empty': empty, 'soru': soru,
        'net': tr(net),
        'net_label': net_label,
        'puan_label': f'{alan_pt} puanı' if alan_pt else 'Puan',
        'puan': tr(data.get('puan')) if data.get('puan') is not None else '–',
        'kurum_avg_puan': tr(data.get('kurum_avg_puan')) if data.get('kurum_avg_puan') is not None else '',
        'delta': delta,
        'kurum_sira': data.get('kurum_ici_sira'),
        'toplam_ogrenci': data.get('toplam_ogrenci'),
        'ahead': poss_gen(round(_num(ahead))) if ahead is not None else '',
        'turkiye': tr_int(data['tahmini_siralama']) if data.get('tahmini_siralama') else '',
        'yuzdelik': poss_gen(round(_num(data.get('yuzdelik_dilim')))) if data.get('yuzdelik_dilim') is not None else '',
        'yil': data.get('referans_yil') or '',
        'comments': list((data.get('karne_insights') or {}).get('comment') or [])[:4],
        'lessons': shown,
        'flat': all(not lesson['subs'] for lesson in shown),
        'has_out': any(lesson['out'] for lesson in shown),
        'rank_on_cover': bool(scope['out_ids']) and ranking is not None,
        'tyt_lessons': tyt_lessons,
        'tyt_flat': all(not lesson['subs'] for lesson in tyt_lessons),
        'tyt_title': data.get('linked_tyt_exam_name') or 'TYT',
        'trend_svg': mark_safe(_line_chart(history, data.get('kurum_avg_net'), branding['theme'], uid)),
        'kurum_scale': kurum_scale,
        'cmp_rows': cmp_rows if len(cmp_rows) > 1 else [],
        'priorities': _priorities(blocks, scope, penalty, limit=3 if has_trend else 5),
        'target': (
            {'count': difficulty['recover_count'], 'net': tr(_num(net) + difficulty['recover_net']),
             'label': 'Kolay ve orta' if difficulty['has_kolay'] else 'Orta'}
            if difficulty and difficulty['recover_count'] else None
        ),
        'table_rows': _table_rows(scope) + _table_rows(
            scope['tyt'], group=f"Bağlı TYT · {data.get('linked_tyt_exam_name') or 'TYT'}",
        ),
        'difficulty': difficulty,
        'accuracy_ring': mark_safe(_ring(_num(data.get('dogruluk_orani')) / 100, size=64, stroke=7)),
        'accuracy': poss(round(_num(data.get('dogruluk_orani')))),
        'lost_net': tr(wrong * penalty),
        'penalty_text': f'{k} yanlış 1 doğruyu götürür' if k else 'yanlışlar neti düşürmez',
        'strong': data.get('strong_areas') or [],
        'weak': data.get('weak_areas') or [],
        'ranking': ranking,
        'sparks': _section_history(data, scope['mains'], history),
        'spark_count': len(history),
        'retry': _retry(data, scope),
        'retry_note': (
            {'SAY': 'sayısal puanına giren sorular', 'EA': 'eşit ağırlık puanına giren sorular',
             'SOZ': 'sözel puanına giren sorular'}.get(alan_pt, '')
            if scope['out_ids'] else ''
        ),
        'outcomes': _outcome_blocks(blocks),
        'answers': _answer_rows(data, scope),
    }


# ── Dışa açık API ──────────────────────────────────────────────────────────

def render_karne_html(payloads: list[dict], *, title: str = 'Sınav Karnesi') -> str:
    """Kendi içinde tam belge: font, logo ve fotoğraf gömülüdür; önizleme ve PDF aynıdır."""
    brandings = _brandings(payloads)
    students = [
        build_karne_context(p, brandings.get(p.get('answer_id')), uid=str(i))
        for i, p in enumerate(payloads)
    ]
    return render_to_string('olcme/karne/karne.html', {
        'title': title,
        'font_css': mark_safe(_font_css()),
        'students': students,
    })


def render_karne_pdf_html(payloads: list[dict]) -> bytes:
    from apps.communication.application.html_to_pdf import render_html_to_pdf

    document = render_karne_html(payloads)
    return render_html_to_pdf(document, timeout=60 + 3 * len(payloads), css_page_size=True)
