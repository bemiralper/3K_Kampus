"""
Veli Sınav Genel Durum Raporu — modern editoryal HTML + vektörel SVG ve PDF üretici.

Hem önizleme stüdyosunda canlı A4 belgesi olarak hem de Chromium headless
(`render_html_to_pdf(..., css_page_size=True)`) ile vektörel PDF olarak birebir render edilir.
"""
from __future__ import annotations

import base64
from html import escape
from typing import Any

from apps.communication.application.html_to_pdf import render_html_to_pdf
from apps.ozel_ders.services.pdf_brand import _logo_path

ACCENT_BY_GROUP = {
    'TYT': {
        'primary': '#4F46E5',
        'dark': '#3730A3',
        'soft': '#EEF2FF',
        'border': '#C7D2FE',
        'grad_top': 'rgba(79, 70, 229, 0.24)',
        'grad_bot': 'rgba(79, 70, 229, 0.01)',
    },
    'AYT': {
        'primary': '#0891B2',
        'dark': '#155E75',
        'soft': '#ECFEFF',
        'border': '#A5F3FC',
        'grad_top': 'rgba(8, 145, 178, 0.24)',
        'grad_bot': 'rgba(8, 145, 178, 0.01)',
    },
    'LGS': {
        'primary': '#7C3AED',
        'dark': '#5B21B6',
        'soft': '#F5F3FF',
        'border': '#DDD6FE',
        'grad_top': 'rgba(124, 58, 237, 0.24)',
        'grad_bot': 'rgba(124, 58, 237, 0.01)',
    },
    'CLASS': {
        'primary': '#2563EB',
        'dark': '#1D4ED8',
        'soft': '#EFF6FF',
        'border': '#BFDBFE',
        'grad_top': 'rgba(37, 99, 235, 0.24)',
        'grad_bot': 'rgba(37, 99, 235, 0.01)',
    },
}


def _fmt_num(val: float | int | None, digits: int = 2) -> str:
    if val is None:
        return '—'
    num = float(val)
    if digits == 0:
        return f'{round(num)}'
    formatted = f'{num:.{digits}f}'.rstrip('0').rstrip('.')
    return formatted.replace('.', ',')


def _fmt_signed(val: float | int | None, digits: int = 2) -> str:
    if val is None:
        return '—'
    num = float(val)
    sign = '+' if num > 0 else ''
    return f'{sign}{_fmt_num(num, digits)}'


def _logo_data_uri() -> str | None:
    path = _logo_path()
    if not path:
        return None
    try:
        raw = path.read_bytes()
        b64 = base64.b64encode(raw).decode('ascii')
        return f'data:image/png;base64,{b64}'
    except Exception:
        return None


def _smooth_path(points: list[tuple[float, float]]) -> str:
    if not points:
        return ''
    if len(points) == 1:
        x, y = points[0]
        return f'M {x:.1f} {y:.1f}'
    if len(points) == 2:
        return f'M {points[0][0]:.1f} {points[0][1]:.1f} L {points[1][0]:.1f} {points[1][1]:.1f}'

    parts = [f'M {points[0][0]:.1f} {points[0][1]:.1f}']
    for i in range(len(points) - 1):
        p0 = points[i - 1] if i > 0 else points[i]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[i + 2] if i + 2 < len(points) else points[i + 1]
        cp1x = p1[0] + (p2[0] - p0[0]) / 6.0
        cp1y = p1[1] + (p2[1] - p0[1]) / 6.0
        cp2x = p2[0] - (p3[0] - p1[0]) / 6.0
        cp2y = p2[1] - (p3[1] - p1[1]) / 6.0
        parts.append(f'C {cp1x:.1f} {cp1y:.1f}, {cp2x:.1f} {cp2y:.1f}, {p2[0]:.1f} {p2[1]:.1f}')
    return ' '.join(parts)


def _svg_trend_chart(
    series: list[dict[str, Any]],
    *,
    group: str,
    include_kurum_avg: bool,
    compact: bool = False,
) -> str:
    accent = ACCENT_BY_GROUP.get(group, ACCENT_BY_GROUP['TYT'])
    w = 340 if compact else 640
    h = 166 if compact else 188
    pad_l = 38
    pad_r = 24
    pad_t = 26
    pad_b = 34
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    inset_x = 12.0 if len(series) > 1 else 0.0

    student_vals = [float(p['net']) for p in series]
    kurum_vals = [
        float(p['kurum_avg_net'])
        for p in series
        if include_kurum_avg and p.get('kurum_avg_net') is not None
    ]
    all_vals = student_vals + kurum_vals
    raw_min = min(all_vals) if all_vals else 0.0
    raw_max = max(all_vals) if all_vals else 10.0
    span = max(raw_max - raw_min, 8.0)
    y_min = max(0.0, raw_min - span * 0.22)
    y_max = raw_max + span * 0.24
    if y_max <= y_min:
        y_max = y_min + 10.0

    def sx(idx: int) -> float:
        if len(series) <= 1:
            return pad_l + plot_w / 2.0
        usable = max(10.0, plot_w - 2 * inset_x)
        return pad_l + inset_x + (idx / (len(series) - 1)) * usable

    def sy(val: float) -> float:
        ratio = (val - y_min) / (y_max - y_min)
        return pad_t + plot_h - ratio * plot_h

    # Yatay ızgara çizgileri (4 seviye)
    grid_svg = []
    for step in range(4):
        frac = step / 3.0
        val = y_min + frac * (y_max - y_min)
        gy = sy(val)
        grid_svg.append(
            f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{w - pad_r}" y2="{gy:.1f}" '
            f'stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />'
            f'<text x="{pad_l - 6}" y="{gy + 3.2:.1f}" text-anchor="end" '
            f'fill="#94A3B8" font-size="9" font-weight="600">{_fmt_num(val, 0)}</text>'
        )

    pts = [(sx(i), sy(float(p['net']))) for i, p in enumerate(series)]
    line_d = _smooth_path(pts)
    base_y = pad_t + plot_h
    area_d = (
        f'{line_d} L {pts[-1][0]:.1f} {base_y:.1f} L {pts[0][0]:.1f} {base_y:.1f} Z'
        if len(pts) >= 2
        else ''
    )

    # Kurum ortalaması kesikli çizgi
    kurum_pts = [
        (sx(i), sy(float(p['kurum_avg_net'])))
        for i, p in enumerate(series)
        if include_kurum_avg and p.get('kurum_avg_net') is not None
    ]
    kurum_path_svg = ''
    if len(kurum_pts) >= 2:
        kd = _smooth_path(kurum_pts)
        kurum_path_svg = (
            f'<path d="{kd}" fill="none" stroke="#94A3B8" stroke-width="1.8" '
            f'stroke-dasharray="5 4" stroke-linecap="round" />'
        )
    elif len(kurum_pts) == 1:
        kx, ky = kurum_pts[0]
        kurum_path_svg = (
            f'<line x1="{pad_l}" y1="{ky:.1f}" x2="{w - pad_r}" y2="{ky:.1f}" '
            f'stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="5 4" />'
        )

    # Veri noktaları + değer etiketleri + X ekseni tarihleri
    nodes_svg = []
    label_step = 1 if len(series) <= 6 else (2 if len(series) <= 10 else 3)
    for i, (px, py) in enumerate(pts):
        is_last = i == len(pts) - 1
        val_txt = _fmt_num(series[i]['net'], 1)
        show_val = is_last or i == 0 or (len(series) <= 7) or (i % label_step == 0)
        if is_last:
            nodes_svg.append(
                f'<circle cx="{px:.1f}" cy="{py:.1f}" r="7.5" fill="{accent["primary"]}" opacity="0.18" />'
                f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4.2" fill="{accent["primary"]}" stroke="#FFFFFF" stroke-width="2" />'
            )
        else:
            nodes_svg.append(
                f'<circle cx="{px:.1f}" cy="{py:.1f}" r="3.4" fill="#FFFFFF" stroke="{accent["primary"]}" stroke-width="2" />'
            )

        if show_val:
            ly = max(12.0, py - 10.5)
            fw = '700' if is_last else '600'
            col = accent['dark'] if is_last else '#334155'
            nodes_svg.append(
                f'<text x="{px:.1f}" y="{ly:.1f}" text-anchor="middle" '
                f'fill="{col}" font-size="9.5" font-weight="{fw}">{escape(val_txt)}</text>'
            )

        show_x = is_last or i == 0 or (i % label_step == 0)
        if show_x:
            xlbl = series[i].get('short_label') or f'S{i + 1}'
            nodes_svg.append(
                f'<text x="{px:.1f}" y="{h - 10}" text-anchor="middle" '
                f'fill="#64748B" font-size="8.8" font-weight="600">{escape(xlbl)}</text>'
            )

    grad_id = f'areaGrad_{group}_{"c" if compact else "w"}'
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%" height="{h}" xmlns="http://www.w3.org/2000/svg" '
        f'style="display:block;overflow:visible;">'
        f'<defs>'
        f'<linearGradient id="{grad_id}" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0%" stop-color="{accent["primary"]}" stop-opacity="0.22" />'
        f'<stop offset="100%" stop-color="{accent["primary"]}" stop-opacity="0.01" />'
        f'</linearGradient>'
        f'</defs>'
        f'{"".join(grid_svg)}'
        f'{f"""<path d="{area_d}" fill="url(#{grad_id})" />""" if area_d else ""}'
        f'{kurum_path_svg}'
        f'<path d="{line_d}" fill="none" stroke="{accent["primary"]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />'
        f'{"".join(nodes_svg)}'
        f'</svg>'
    )


def _svg_error_donut(error_profile: dict[str, Any]) -> str:
    wrong_pct = int(error_profile.get('wrong_pct') or 0)
    empty_pct = int(error_profile.get('empty_pct') or 0)
    total_loss = int(error_profile.get('total_loss') or 0)

    r = 36
    circ = 2 * 3.14159265 * r
    w_len = (wrong_pct / 100.0) * circ
    e_len = (empty_pct / 100.0) * circ

    return (
        f'<svg viewBox="0 0 100 100" width="94" height="94" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0;">'
        f'<circle cx="50" cy="50" r="{r}" fill="none" stroke="#F1F5F9" stroke-width="11" />'
        f'<circle cx="50" cy="50" r="{r}" fill="none" stroke="#F59E0B" stroke-width="11" '
        f'stroke-dasharray="{e_len:.1f} {circ:.1f}" stroke-dashoffset="{-w_len:.1f}" '
        f'transform="rotate(-90 50 50)" />'
        f'<circle cx="50" cy="50" r="{r}" fill="none" stroke="#E11D48" stroke-width="11" '
        f'stroke-dasharray="{w_len:.1f} {circ:.1f}" stroke-dashoffset="0" '
        f'transform="rotate(-90 50 50)" />'
        f'<text x="50" y="47" text-anchor="middle" fill="#0F172A" font-size="16" font-weight="800">{total_loss}</text>'
        f'<text x="50" y="60" text-anchor="middle" fill="#64748B" font-size="7.8" font-weight="600">SORU KAYBI</text>'
        f'</svg>'
    )


def _delta_pill(val: float | None, suffix: str = ' net') -> str:
    if val is None:
        return '<span class="pill pill-muted">İlk ölçüm</span>'
    if val > 0.05:
        return f'<span class="pill pill-up">▲ {_fmt_signed(val, 1)}{escape(suffix)}</span>'
    if val < -0.05:
        return f'<span class="pill pill-down">▼ {_fmt_signed(val, 1)}{escape(suffix)}</span>'
    return '<span class="pill pill-flat">● Dengeli</span>'


def _render_kpi_grid(tracks: list[dict[str, Any]], include_kurum_avg: bool) -> str:
    """Tek veya çift sınav türü için üst KPI kart şeridi."""
    if len(tracks) == 1:
        t = tracks[0]
        k = t['kpi']
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        kurum_val = (
            _fmt_signed(k['vs_kurum_delta'], 1)
            if include_kurum_avg and k.get('vs_kurum_delta') is not None
            else _fmt_num(k['min_net'], 1)
        )
        kurum_lbl = (
            'Kurum Ortalamasına Fark'
            if include_kurum_avg and k.get('vs_kurum_delta') is not None
            else 'En Düşük Net'
        )
        kurum_sub = (
            f'Kurum ort. {_fmt_num(k["kurum_avg_net"], 1)} net'
            if include_kurum_avg and k.get('kurum_avg_net') is not None
            else f'{k["exam_count"]} deneme aralığı'
        )
        kurum_cls = (
            'kpi-val-up'
            if (include_kurum_avg and (k.get('vs_kurum_delta') or 0) > 0.05)
            else 'kpi-val-down'
            if (include_kurum_avg and (k.get('vs_kurum_delta') or 0) < -0.05)
            else ''
        )
        return (
            '<div class="kpi-grid kpi-4">'
            f'<div class="kpi-card" style="--accent:{accent["primary"]}">'
            f'  <div class="kpi-label">Son {escape(t["short_label"])} Neti</div>'
            f'  <div class="kpi-value">{_fmt_num(k["latest_net"], 2)}</div>'
            f'  <div class="kpi-foot">{_delta_pill(k.get("prev_delta"), " önceki sınava göre")}</div>'
            '</div>'
            f'<div class="kpi-card" style="--accent:#0F172A">'
            f'  <div class="kpi-label">Dönem Ortalaması</div>'
            f'  <div class="kpi-value">{_fmt_num(k["avg_net"], 2)}</div>'
            f'  <div class="kpi-foot"><span class="kpi-sub">{k["exam_count"]} deneme ortalaması</span></div>'
            '</div>'
            f'<div class="kpi-card" style="--accent:#059669">'
            f'  <div class="kpi-label">En Yüksek Net</div>'
            f'  <div class="kpi-value">{_fmt_num(k["max_net"], 2)}</div>'
            f'  <div class="kpi-foot">{_delta_pill(k.get("trend_delta"), " dönem içi")}</div>'
            '</div>'
            f'<div class="kpi-card" style="--accent:#6366F1">'
            f'  <div class="kpi-label">{escape(kurum_lbl)}</div>'
            f'  <div class="kpi-value {kurum_cls}">{kurum_val}</div>'
            f'  <div class="kpi-foot"><span class="kpi-sub">{escape(kurum_sub)}</span></div>'
            '</div>'
            '</div>'
        )

    # Çift sınav türü (ör. TYT + AYT birlikte): 2'li geniş editoryal özet kartları
    cards = []
    for t in tracks[:2]:
        k = t['kpi']
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        vs_kurum = ''
        if include_kurum_avg and k.get('kurum_avg_net') is not None:
            vs_kurum = (
                f'<div class="dual-mini">'
                f'  <span class="dual-mini-k">Kurum Ort.</span>'
                f'  <span class="dual-mini-v">{_fmt_num(k["kurum_avg_net"], 1)} '
                f'  <small class="{"txt-up" if (k.get("vs_kurum_delta") or 0) >= 0 else "txt-down"}">'
                f'({_fmt_signed(k.get("vs_kurum_delta"), 1)})</small></span>'
                f'</div>'
            )
        cards.append(
            f'<div class="dual-kpi-card" style="--accent:{accent["primary"]};--accent-soft:{accent["soft"]}">'
            f'  <div class="dual-kpi-top">'
            f'    <span class="track-badge" style="background:{accent["soft"]};color:{accent["dark"]};border-color:{accent["border"]}">'
            f'      {escape(t["label"])}'
            f'    </span>'
            f'    <span class="dual-count">{k["exam_count"]} deneme</span>'
            f'  </div>'
            f'  <div class="dual-kpi-main">'
            f'    <div>'
            f'      <div class="dual-big-lbl">Dönem Ortalaması</div>'
            f'      <div class="dual-big-val">{_fmt_num(k["avg_net"], 2)} <small>net</small></div>'
            f'    </div>'
            f'    <div class="dual-right-pill">{_delta_pill(k.get("trend_delta"), " trend")}</div>'
            f'  </div>'
            f'  <div class="dual-mini-row">'
            f'    <div class="dual-mini"><span class="dual-mini-k">Son Sınav</span><span class="dual-mini-v">{_fmt_num(k["latest_net"], 2)}</span></div>'
            f'    <div class="dual-mini"><span class="dual-mini-k">En Yüksek</span><span class="dual-mini-v">{_fmt_num(k["max_net"], 2)}</span></div>'
            f'    {vs_kurum}'
            f'  </div>'
            f'</div>'
        )
    return f'<div class="kpi-grid kpi-2">{"".join(cards)}</div>'


def _render_charts_block(tracks: list[dict[str, Any]], include_kurum_avg: bool) -> str:
    compact = len(tracks) >= 2
    cards = []
    for t in tracks[:2]:
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        has_kurum = include_kurum_avg and any(p.get('kurum_avg_net') is not None for p in t['series'])
        legend = (
            '<div class="chart-legend">'
            f'<span><i class="dot" style="background:{accent["primary"]}"></i>Öğrenci Neti</span>'
            + (
                '<span><i class="dash"></i>Kurum Ortalaması</span>'
                if has_kurum
                else ''
            )
            + '</div>'
        )
        svg = _svg_trend_chart(
            t['series'],
            group=t['group'],
            include_kurum_avg=include_kurum_avg,
            compact=compact,
        )
        cards.append(
            '<div class="panel-card chart-card">'
            '  <div class="panel-head">'
            f'    <div><div class="eyebrow">{escape(t["short_label"])} GELİŞİM EĞRİSİ</div>'
            f'    <h3 class="panel-title">{escape(t["label"])} Net Seyri</h3></div>'
            f'    {legend}'
            '  </div>'
            f'  <div class="chart-wrap">{svg}</div>'
            '</div>'
        )
    grid_cls = 'charts-grid charts-2' if compact else 'charts-grid charts-1'
    return f'<div class="{grid_cls}">{"".join(cards)}</div>'


def _svg_sparkline(vals: list[float], color: str) -> str:
    if len(vals) < 2:
        return ''
    w, h = 58, 20
    pad_x, pad_y = 3.5, 3.5
    lo, hi = min(vals), max(vals)
    span = max(hi - lo, 1.0)
    pts = []
    for i, v in enumerate(vals):
        x = pad_x + (i / (len(vals) - 1)) * (w - 2 * pad_x)
        y = h - pad_y - ((v - lo) / span) * (h - 2 * pad_y)
        pts.append((x, y))
    d = _smooth_path(pts)
    lx, ly = pts[-1]
    return (
        f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg" '
        f'style="display:block;flex-shrink:0;">'
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />'
        f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="2.6" fill="{color}" />'
        f'</svg>'
    )


def _render_progress_bridge_block(tracks: list[dict[str, Any]]) -> str:
    cards = []
    for t in tracks[:2]:
        br = t.get('progress_bridge')
        cons = t.get('consistency')
        if not br and not cons:
            continue
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        risers_html = ''
        if br and br.get('top_risers'):
            risers_html = ''.join(
                f'<span class="riser-chip">{escape(r["name"])} {_fmt_signed(r["delta"], 1)}</span>'
                for r in br['top_risers']
            )
            risers_html = f'<div class="bridge-risers"><span class="riser-lbl">Öne çıkan yükseliş:</span> {risers_html}</div>'

        cons_html = ''
        if cons:
            c_cls = (
                'cons-high' if cons['level'] == 'high'
                else 'cons-med' if cons['level'] == 'medium'
                else 'cons-vol'
            )
            cons_html = (
                '<div class="cons-box">'
                f'  <div class="cons-head"><span class="cons-k">İSTİKRAR</span>'
                f'  <span class="cons-badge {c_cls}">{escape(cons["label"])}</span></div>'
                f'  <div class="cons-txt">{escape(cons["summary_text"])}</div>'
                '</div>'
            )

        bridge_html = ''
        if br:
            bridge_html = (
                '<div class="bridge-flow">'
                '  <div class="bridge-node">'
                f'    <span class="bridge-lbl">{escape(br["early_label"])}</span>'
                f'    <span class="bridge-val">{_fmt_num(br["early_avg"], 1)} <small>net</small></span>'
                '  </div>'
                '  <div class="bridge-arrow">'
                '    <span class="bridge-line">→</span>'
                f'    {_delta_pill(br["delta"], " net")}'
                '  </div>'
                '  <div class="bridge-node bridge-node-end">'
                f'    <span class="bridge-lbl">{escape(br["recent_label"])}</span>'
                f'    <span class="bridge-val" style="color:{accent["dark"]}">{_fmt_num(br["recent_avg"], 1)} <small>net</small></span>'
                '  </div>'
                '</div>'
                f'{risers_html}'
            )

        cards.append(
            '<div class="panel-card bridge-card">'
            '  <div class="panel-head" style="margin-bottom:8px;">'
            f'    <div><div class="eyebrow">NEREDEN NEREYE? · {escape(t["short_label"])}</div>'
            f'    <h3 class="panel-title">Dönem İçi Gelişim Köprüsü ve İstikrar</h3></div>'
            '  </div>'
            f'  {bridge_html}'
            f'  {cons_html}'
            '</div>'
        )
    if not cards:
        return ''
    grid_cls = 'bridge-grid bridge-2' if len(cards) >= 2 else 'bridge-grid bridge-1'
    return f'<div class="{grid_cls}">{"".join(cards)}</div>'


def _render_net_breakdown_bar(breakdown: list[dict[str, Any]]) -> str:
    if not breakdown:
        return ''
    segs = ''.join(
        f'<div class="nb-seg" style="width:{b["share_pct"]}%;background:{b["color"]}" title="{escape(b["name"])}"></div>'
        for b in breakdown
    )
    legends = ''.join(
        f'<span class="nb-leg"><i style="background:{b["color"]}"></i>'
        f'<strong>{escape(b["name"])}</strong> %{b["share_pct"]} <small>({_fmt_num(b["avg_net"], 1)})</small></span>'
        for b in breakdown[:6]
    )
    return (
        '<div class="nb-wrap">'
        '  <div class="nb-title">Netin Nereden Geliyor? · Ders Katkı Dağılımı</div>'
        f'  <div class="nb-bar">{segs}</div>'
        f'  <div class="nb-legends">{legends}</div>'
        '</div>'
    )


def _render_exam_table_section(tracks: list[dict[str, Any]], include_kurum_avg: bool) -> str:
    blocks = []
    for t in tracks:
        rows = t.get('series') or []
        if not rows:
            continue
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        tr_html = []
        for r in rows:
            delta = r.get('prev_delta')
            if delta is None:
                d_cell = '<span class="tbl-muted">—</span>'
            elif delta > 0.05:
                d_cell = f'<span class="tbl-up">{_fmt_signed(delta, 1)}</span>'
            elif delta < -0.05:
                d_cell = f'<span class="tbl-down">{_fmt_signed(delta, 1)}</span>'
            else:
                d_cell = '<span class="tbl-muted">0,0</span>'

            kurum_cell = ''
            if include_kurum_avg:
                vk = r.get('vs_kurum')
                if r.get('kurum_avg_net') is not None:
                    vk_cls = 'tbl-up' if (vk or 0) > 0.05 else ('tbl-down' if (vk or 0) < -0.05 else 'tbl-muted')
                    kurum_cell = (
                        f'<td class="td-r">{_fmt_num(r["kurum_avg_net"], 1)} '
                        f'<small class="{vk_cls}">({_fmt_signed(vk, 1)})</small></td>'
                    )
                else:
                    kurum_cell = '<td class="td-r tbl-muted">—</td>'

            tr_html.append(
                '<tr>'
                f'  <td class="td-date">{escape(r.get("date_label") or "—")}</td>'
                f'  <td class="td-name">{escape(r["name"])}</td>'
                f'  <td class="td-r td-dyb"><strong>{r["correct"]}D</strong> · {r["wrong"]}Y · {r["empty"]}B</td>'
                f'  <td class="td-r td-net">{_fmt_num(r["net"], 2)}</td>'
                f'  <td class="td-r">{d_cell}</td>'
                f'  {kurum_cell}'
                '</tr>'
            )

        blocks.append(
            '<div class="panel-card exam-tbl-card">'
            '  <div class="panel-head" style="margin-bottom:8px;">'
            f'    <div><div class="eyebrow">{escape(t["short_label"])} DENEME GEÇMİŞİ</div>'
            f'    <h3 class="panel-title">İncelenen {escape(t["label"])} ({len(rows)} sınav)</h3></div>'
            f'    <span class="track-badge" style="background:{accent["soft"]};color:{accent["dark"]};border-color:{accent["border"]}">'
            f'      En Yüksek: {_fmt_num(t["kpi"]["max_net"], 2)} net'
            '    </span>'
            '  </div>'
            '  <table class="exam-tbl">'
            '    <thead><tr>'
            '      <th>Tarih</th><th>Deneme</th><th class="td-r">D / Y / B</th>'
            '      <th class="td-r">Net</th><th class="td-r">Öncekiye</th>'
            + ('<th class="td-r">Kurum Ort.</th>' if include_kurum_avg else '')
            + '    </tr></thead>'
            f'    <tbody>{"".join(tr_html)}</tbody>'
            '  </table>'
            '</div>'
        )
    return ''.join(blocks)


def _render_error_profile_block(tracks: list[dict[str, Any]], tone: str = 'balanced') -> str:
    # Tüm seçili track'lerin hata profilini birleştir
    tw = sum(int((t.get('error_profile') or {}).get('total_wrong') or 0) for t in tracks)
    te = sum(int((t.get('error_profile') or {}).get('total_empty') or 0) for t in tracks)
    tl = tw + te
    if tl <= 0:
        return ''
    wp = round((tw / tl) * 100)
    ep = 100 - wp
    if wp >= 62:
        headline = 'Kayıplar ağırlıklı olarak yanlış işaretlemeden kaynaklanıyor'
        if tone == 'supportive':
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), %{ep}\'i boş ({te} soru). '
                'Öğrencimiz soruları cesaretle çözüyor; sakin okuma ve küçük bir son kontrol alışkanlığı hızlı net artışı sağlayacaktır.'
            )
        elif tone == 'focused':
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), %{ep}\'i boş ({te} soru). '
                'Emin olunmayan sorularda tahmin riskini azaltmak ve çeldirici analizi yapmak öncelikli hedefimiz.'
            )
        else:
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), '
                f'%{ep}\'i boş ({te} soru). Dikkatli soru okuma, çeldirici eleme ve son kontrol alışkanlığı en hızlı net kazancını sağlar.'
            )
    elif ep >= 62:
        headline = 'Kayıplar ağırlıklı olarak boş bırakılan sorulardan kaynaklanıyor'
        if tone == 'supportive':
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{ep}\'i boş ({te} soru), %{wp}\'i yanlış ({tw} soru). '
                'Emin olmadığı soruları boş bırakarak netini koruyor; eksik konular tamamlandıkça bu sorular nete dönüşecektir.'
            )
        elif tone == 'focused':
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{ep}\'i boş ({te} soru), %{wp}\'i yanlış ({tw} soru). '
                'Haftalık programda konu tamamlama ve süreli deneme pratiğine öncelik verilmesi gerekiyor.'
            )
        else:
            summary = (
                f'İncelenen sınavlardaki toplam {tl} soru kaybının %{ep}\'i boş ({te} soru), '
                f'%{wp}\'i yanlış ({tw} soru). Öncelikli konu tekrarları ve süreli deneme pratiği net artışı için etkilidir.'
            )
    else:
        headline = 'Yanlış ve boş kaynaklı soru kayıpları dengeli dağılıyor'
        if tone == 'supportive':
            summary = (
                f'İncelenen sınavlarda toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), %{ep}\'i boş ({te} soru). '
                'Kısa tekrarlar ve düzenli soru çözüm rutiniyle çok sağlıklı bir yükseliş potansiyeli bulunuyor.'
            )
        elif tone == 'focused':
            summary = (
                f'İncelenen sınavlarda toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), %{ep}\'i boş ({te} soru). '
                'Hem temel konu tekrarlarını hem de deneme sonrası yanlış analizini birlikte takip etmeliyiz.'
            )
        else:
            summary = (
                f'İncelenen sınavlarda toplam {tl} soru kaybının %{wp}\'i yanlış ({tw} soru), '
                f'%{ep}\'i boş ({te} soru). Kısa konu tekrarlarıyla birlikte düzenli karma soru çözümü önerilir.'
            )

    donut = _svg_error_donut({'wrong_pct': wp, 'empty_pct': ep, 'total_loss': tl})
    return (
        '<div class="panel-card error-card">'
        '  <div class="error-flex">'
        f'    {donut}'
        '    <div class="error-body">'
        '      <div class="eyebrow">HATA PROFİLİ · NEDEN NET KAYBEDİLİYOR?</div>'
        f'      <h3 class="error-title">{escape(headline)}</h3>'
        f'      <p class="error-desc">{escape(summary)}</p>'
        '      <div class="error-pills">'
        f'        <span class="err-chip err-wrong"><strong>%{wp}</strong> Yanlış ({tw} soru)</span>'
        f'        <span class="err-chip err-empty"><strong>%{ep}</strong> Boş ({te} soru)</span>'
        '      </div>'
        '    </div>'
        '  </div>'
        '</div>'
    )


def _render_subjects_section(tracks: list[dict[str, Any]], include_net_breakdown: bool = True) -> str:
    blocks = []
    for t in tracks:
        subs = t.get('subjects') or []
        if not subs:
            continue
        accent = ACCENT_BY_GROUP.get(t['group'], ACCENT_BY_GROUP['TYT'])
        rows = []
        for s in subs:
            pct = int(s.get('performance_pct') or 0)
            st = s.get('status') or 'stable'
            bar_col = (
                '#059669' if st == 'improving'
                else '#E11D48' if st == 'declining'
                else accent['primary']
            )
            st_cls = (
                'st-up' if st == 'improving'
                else 'st-down' if st == 'declining'
                else 'st-flat'
            )
            delta = float(s.get('vs_avg_delta') or 0)
            delta_txt = _fmt_signed(delta, 1) if abs(delta) >= 0.1 else '0,0'
            delta_cls = 'txt-up' if delta > 0.1 else ('txt-down' if delta < -0.1 else 'txt-muted')
            spark_svg = _svg_sparkline(s.get('sparkline_nets') or [], bar_col)
            rows.append(
                '<div class="subj-row">'
                '  <div class="subj-name-col">'
                f'    <div class="subj-name">{escape(s["name"])}</div>'
                f'    <div class="subj-meta">{s["question_count"]} soru · Ort. '
                f'<strong>{_fmt_num(s["avg_correct"], 1)}D</strong> / '
                f'{_fmt_num(s["avg_wrong"], 1)}Y / {_fmt_num(s["avg_empty"], 1)}B</div>'
                '  </div>'
                '  <div class="subj-bar-col">'
                f'    <div class="subj-track"><div class="subj-fill" style="width:{pct}%;background:{bar_col}"></div></div>'
                f'    <span class="subj-pct">%{pct}</span>'
                f'    <span class="subj-spark">{spark_svg}</span>'
                '  </div>'
                '  <div class="subj-net-col">'
                f'    <div class="subj-net">{_fmt_num(s["avg_net"], 2)} <small>ort.</small></div>'
                f'    <div class="subj-diff {delta_cls}">Son: {_fmt_num(s["latest_net"], 1)} ({delta_txt})</div>'
                '  </div>'
                f'  <div class="subj-st-col"><span class="st-badge {st_cls}">{escape(s["status_label"])}</span></div>'
                '</div>'
            )
        breakdown_html = (
            _render_net_breakdown_bar(t.get('net_breakdown') or [])
            if include_net_breakdown
            else ''
        )
        blocks.append(
            '<div class="panel-card subj-card">'
            '  <div class="panel-head">'
            f'    <div><div class="eyebrow">{escape(t["short_label"])} DERS ORTALAMALARI</div>'
            f'    <h3 class="panel-title">{escape(t["label"])} — Ders Bazlı Performans</h3></div>'
            f'    <span class="track-badge" style="background:{accent["soft"]};color:{accent["dark"]};border-color:{accent["border"]}">'
            f'      Ort. {_fmt_num(t["kpi"]["avg_net"], 2)} net'
            '    </span>'
            '  </div>'
            f'  {breakdown_html}'
            f'  <div class="subj-list">{"".join(rows)}</div>'
            '</div>'
        )
    return ''.join(blocks)


def _render_balance_blocks(tracks: list[dict[str, Any]], options: dict[str, Any]) -> str:
    show_str = options.get('include_strengths', True)
    show_foc = options.get('include_study_focus', True)
    if not show_str and not show_foc:
        return ''

    strengths = []
    for t in tracks:
        for s in (t.get('strengths') or []):
            strengths.append({**s, 'track': t['short_label']})
    strengths.sort(key=lambda x: (x['status'] != 'improving', -x['performance_pct'], -x['avg_net']))
    strengths = strengths[:4]

    focus_items = []
    for t in tracks:
        for f in (t.get('study_focus') or []):
            focus_items.append({**f, 'track': t['short_label']})
    focus_items.sort(key=lambda x: (not x['is_planned'], -x['est_net_gain'], -x['total_loss']))
    focus_items = focus_items[:5]

    cols = []
    if show_str:
        if strengths:
            items_html = ''.join(
                '<div class="bal-item">'
                f'  <div class="bal-item-head"><strong>{escape(s["name"])}</strong>'
                f'  <span class="bal-tag bal-tag-green">{escape(s["track"])} · Ort. {_fmt_num(s["avg_net"], 1)} net</span></div>'
                f'  <div class="bal-item-sub">Başarı oranı %{s["performance_pct"]} · '
                f'{"Yükseliş eğiliminde" if s["status"] == "improving" else "İstikrarlı performans"}</div>'
                '</div>'
                for s in strengths
            )
        else:
            items_html = '<p class="bal-empty">Güçlü alan değerlendirmesi için daha fazla deneme verisi bekleniyor.</p>'
        cols.append(
            '<div class="bal-card bal-green">'
            '  <div class="eyebrow eyebrow-green">MORAL & İSTİKRAR</div>'
            '  <h3 class="bal-title">Güçlü Yönler ve İstikrarlı Dersler</h3>'
            f'  <div class="bal-list">{items_html}</div>'
            '</div>'
        )

    if show_foc:
        if focus_items:
            items_html = ''.join(
                '<div class="bal-item">'
                f'  <div class="bal-item-head"><strong>{escape(f["name"])}</strong>'
                f'  <span class="bal-tag bal-tag-indigo">≈ +{_fmt_num(f["est_net_gain"], 1)} net/sınav</span></div>'
                f'  <div class="bal-item-sub">{escape(f["track"])} · {escape(f["subject"])} · '
                f'{f["missed_exams"]}/{f["measured_exams"]} sınavda tekrarladı'
                + (' · <span class="planned-dot">Koç Planında</span>' if f['is_planned'] else '')
                + '</div>'
                '</div>'
                for f in focus_items
            )
        else:
            items_html = '<p class="bal-empty">Bu dönem için öne çıkan tekrarlayan kazanım kaybı saptanmadı.</p>'
        cols.append(
            '<div class="bal-card bal-indigo">'
            '  <div class="eyebrow eyebrow-indigo">ÖNÜMÜZDEKİ DÖNEM ODAĞI</div>'
            '  <h3 class="bal-title">Öncelikli Çalışma Konuları</h3>'
            f'  <div class="bal-list">{items_html}</div>'
            '</div>'
        )

    grid_cls = 'bal-grid bal-2' if len(cols) == 2 else 'bal-grid bal-1'
    return f'<div class="{grid_cls}">{"".join(cols)}</div>'


def _render_context_strip(payload: dict[str, Any]) -> str:
    options = payload.get('options') or {}
    tracks = payload.get('tracks') or []
    assignments = payload.get('assignments')
    chips = []

    if options.get('include_assignments') and assignments:
        chips.append(
            '<div class="ctx-pill">'
            '  <span class="ctx-k">Ödev Tamamlama</span>'
            f'  <span class="ctx-v">%{assignments["avg_completion_pct"]}</span>'
            f'  <span class="ctx-s">{assignments["completed"]}/{assignments["total"]} ödev tamamlandı</span>'
            '</div>'
        )

    if options.get('include_attendance'):
        parts = [t['participation'] for t in tracks if t.get('participation')]
        if parts:
            att = sum(p['attended'] for p in parts)
            avail = sum(p['available'] for p in parts)
            rate = min(100, round((att / avail) * 100)) if avail else 100
            chips.append(
                '<div class="ctx-pill">'
                '  <span class="ctx-k">Deneme Katılımı</span>'
                f'  <span class="ctx-v">%{rate}</span>'
                f'  <span class="ctx-s">{att}/{avail} denemeye katılım</span>'
                '</div>'
            )

    if options.get('include_ranking'):
        for t in tracks:
            k = t['kpi']
            if k.get('latest_rank') and k.get('latest_total_students'):
                chips.append(
                    '<div class="ctx-pill">'
                    f'  <span class="ctx-k">Son {escape(t["short_label"])} Kurum Sırası</span>'
                    f'  <span class="ctx-v">{k["latest_rank"]}.</span>'
                    f'  <span class="ctx-s">{k["latest_total_students"]} öğrenci içinde</span>'
                    '</div>'
                )

    if not chips:
        return ''
    return f'<div class="ctx-strip">{"".join(chips)}</div>'


def _render_coach_note(payload: dict[str, Any]) -> str:
    note = (payload.get('coach_note') or '').strip()
    meta = payload.get('meta') or {}
    coach_name = meta.get('coach_name') or 'Eğitim Koçu'
    date_label = meta.get('generated_date_label') or ''
    if not note:
        return (
            '<div class="sign-footer">'
            f'  <div><strong>{escape(coach_name)}</strong> · Eğitim Koçu</div>'
            f'  <div>{escape(meta.get("kurum_ad") or "3K Kampüs")} · {escape(date_label)}</div>'
            '</div>'
        )
    paragraphs = ''.join(
        f'<p>{escape(line)}</p>' for line in note.splitlines() if line.strip()
    )
    return (
        '<div class="coach-note-card">'
        '  <div class="eyebrow eyebrow-indigo">KOÇ DEĞERLENDİRMESİ VE ÖNERİLER</div>'
        f'  <div class="coach-note-body">{paragraphs}</div>'
        '  <div class="coach-note-sign">'
        f'    <span class="sign-name">{escape(coach_name)}</span>'
        f'    <span class="sign-role">Eğitim Koçu · {escape(date_label)}</span>'
        '  </div>'
        '</div>'
    )


def render_parent_exam_report_html(payload: dict[str, Any]) -> str:
    """Modern editoryal A4 HTML belgesi döndürür (canlı önizleme + PDF çıktısı için ortak kaynak)."""
    meta = payload.get('meta') or {}
    options = payload.get('options') or {}
    tracks = payload.get('tracks') or []
    theme = options.get('theme') or 'midnight'
    tone = options.get('tone') or 'balanced'
    kicker_title = (options.get('custom_title') or '').strip() or 'VELİ SINAV GENEL DURUM RAPORU'
    greeting = (options.get('recipient_greeting') or '').strip()

    logo_uri = _logo_data_uri()
    if logo_uri and theme != 'print':
        logo_html = f'<img src="{logo_uri}" alt="Logo" class="hero-logo" />'
    else:
        logo_html = f'<div class="hero-logo-txt">{escape(meta.get("kurum_ad") or "3K Kampüs")}</div>'

    student_name = meta.get('student_name') or 'Öğrenci'
    meta_chips = [
        c for c in (
            meta.get('sinif_ad'),
            meta.get('alan_ad') or (tracks[0].get('alan_label') if tracks else ''),
            meta.get('egitim_yili'),
            meta.get('period_label'),
        ) if c
    ]
    chips_html = ''.join(f'<span class="hero-chip">{escape(c)}</span>' for c in meta_chips)
    greeting_html = (
        f'<div class="hero-greeting">Sayın {escape(greeting)} için hazırlanmıştır</div>'
        if greeting
        else ''
    )

    if not tracks:
        body_inner = (
            '<div class="empty-box">'
            '  <h3>Seçilen kriterlerde sınav verisi bulunamadı</h3>'
            '  <p>Farklı bir sınav türü, dönem veya deneme seçerek raporu yeniden oluşturabilirsiniz.</p>'
            '</div>'
        )
    else:
        include_kurum = bool(options.get('include_kurum_avg', True))
        kpi_html = _render_kpi_grid(tracks, include_kurum)
        charts_html = _render_charts_block(tracks, include_kurum)
        bridge_html = (
            _render_progress_bridge_block(tracks)
            if options.get('include_progress_bridge', True)
            else ''
        )
        err_html = (
            _render_error_profile_block(tracks, tone=tone)
            if options.get('include_error_profile', True)
            else ''
        )
        subj_html = _render_subjects_section(
            tracks,
            include_net_breakdown=bool(options.get('include_net_breakdown', True)),
        )
        exam_tbl_html = (
            _render_exam_table_section(tracks, include_kurum)
            if options.get('include_exam_table', True)
            else ''
        )
        bal_html = _render_balance_blocks(tracks, options)
        ctx_html = _render_context_strip(payload)
        note_html = _render_coach_note(payload)

        body_inner = (
            f'{kpi_html}'
            f'{charts_html}'
            f'{bridge_html}'
            f'{err_html}'
            '<div class="section-break"></div>'
            f'{subj_html}'
            f'{exam_tbl_html}'
            f'{bal_html}'
            f'{ctx_html}'
            f'{note_html}'
        )

    kurum_ad = (meta.get('kurum_ad') or '3K Kampüs').strip()
    sube_ad = (meta.get('sube_ad') or '').strip()
    distinct_sube = sube_ad if (sube_ad and sube_ad.lower() != kurum_ad.lower()) else ''
    kurum_footer = ' · '.join(
        x for x in (kurum_ad, distinct_sube, 'Veli Sınav Genel Durum Raporu') if x
    )

    hero_cls = f'hero hero-{theme}'

    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{escape(student_name)} — {escape(kicker_title)}</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 11mm 12mm 12mm 12mm;
  }}
  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}
  html, body {{
    margin: 0;
    padding: 0;
    background: #FFFFFF;
    color: #0F172A;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 11.5px;
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
  }}
  .sheet {{
    max-width: 794px;
    margin: 0 auto;
    padding: 0;
  }}
  @media screen {{
    .sheet {{
      padding: 22px 24px 26px;
    }}
  }}

  /* ── Hero Header + 3 Themes ── */
  .hero {{
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    padding: 20px 24px 18px;
    margin-bottom: 14px;
  }}
  .hero-midnight {{
    background: linear-gradient(135deg, #0B1220 0%, #15223C 55%, #1E2952 100%);
    color: #FFFFFF;
  }}
  .hero-midnight::after {{
    content: '';
    position: absolute;
    right: -40px;
    top: -50px;
    width: 240px;
    height: 240px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.34) 0%, rgba(99, 102, 241, 0) 70%);
    pointer-events: none;
  }}
  .hero-brand {{
    background: linear-gradient(135deg, #025694 0%, #0262A7 55%, #0384C6 100%);
    color: #FFFFFF;
  }}
  .hero-brand::after {{
    content: '';
    position: absolute;
    right: -30px;
    top: -50px;
    width: 250px;
    height: 250px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 70%);
    pointer-events: none;
  }}
  .hero-print {{
    background: #FFFFFF;
    color: #0F172A;
    border: 1px solid #CBD5E1;
    border-top: 4px solid #4F46E5;
  }}
  .hero-print .hero-kicker {{ color: #4F46E5; }}
  .hero-print .hero-date {{ color: #64748B; }}
  .hero-print .hero-name {{ color: #0F172A; }}
  .hero-print .hero-kurum {{ color: #0F172A; }}
  .hero-print .hero-logo-txt {{ color: #4F46E5; border: 1.5px solid #C7D2FE; padding: 4px 10px; border-radius: 8px; background: #EEF2FF; }}
  .hero-print .hero-chip {{ background: #F1F5F9; border-color: #E2E8F0; color: #334155; }}
  .hero-print .hero-greeting {{ color: #475569; }}
  .hero-greeting {{
    margin-top: 6px;
    font-size: 10px;
    font-weight: 500;
    color: #CBD5E1;
  }}
  .hero-top {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
  }}
  .hero-kicker {{
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #A5B4FC;
  }}
  .hero-date {{
    font-size: 9.5px;
    color: #CBD5E1;
    font-weight: 500;
  }}
  .hero-logo {{
    height: 30px;
    width: auto;
    object-fit: contain;
    display: block;
  }}
  .hero-logo-txt {{
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #FFFFFF;
  }}
  .hero-main {{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    position: relative;
    z-index: 1;
  }}
  .hero-name {{
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.12;
    color: #FFFFFF;
  }}
  .hero-chips {{
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }}
  .hero-chip {{
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.11);
    border: 1px solid rgba(255, 255, 255, 0.16);
    font-size: 9.5px;
    font-weight: 600;
    color: #E2E8F0;
  }}
  .hero-right {{
    text-align: right;
    flex-shrink: 0;
  }}
  .hero-kurum {{
    font-size: 11px;
    font-weight: 700;
    color: #F8FAFC;
  }}

  /* ── Typography Helpers ── */
  .eyebrow {{
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: #64748B;
    margin-bottom: 3px;
  }}
  .eyebrow-green {{ color: #047857; }}
  .eyebrow-indigo {{ color: #4338CA; }}
  .panel-title {{
    margin: 0;
    font-size: 13px;
    font-weight: 750;
    letter-spacing: -0.015em;
    color: #0F172A;
  }}
  .txt-up {{ color: #059669; font-weight: 700; }}
  .txt-down {{ color: #E11D48; font-weight: 700; }}
  .txt-muted {{ color: #64748B; }}

  /* ── KPI Grids ── */
  .kpi-grid {{
    display: grid;
    gap: 10px;
    margin-bottom: 12px;
  }}
  .kpi-4 {{ grid-template-columns: repeat(4, 1fr); }}
  .kpi-2 {{ grid-template-columns: repeat(2, 1fr); }}
  .kpi-card {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-top: 3px solid var(--accent, #4F46E5);
    border-radius: 12px;
    padding: 11px 13px 10px;
    break-inside: avoid;
  }}
  .kpi-label {{
    font-size: 9.5px;
    font-weight: 700;
    color: #64748B;
    margin-bottom: 5px;
  }}
  .kpi-value {{
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #0F172A;
    line-height: 1.1;
    margin-bottom: 6px;
  }}
  .kpi-val-up {{ color: #059669; }}
  .kpi-val-down {{ color: #E11D48; }}
  .kpi-sub {{
    font-size: 9.2px;
    color: #64748B;
    font-weight: 500;
  }}

  .dual-kpi-card {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-top: 3px solid var(--accent, #4F46E5);
    border-radius: 14px;
    padding: 13px 15px 12px;
    break-inside: avoid;
  }}
  .dual-kpi-top {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }}
  .dual-count {{
    font-size: 9.5px;
    font-weight: 700;
    color: #64748B;
  }}
  .dual-kpi-main {{
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 10px;
  }}
  .dual-big-lbl {{
    font-size: 9.2px;
    font-weight: 600;
    color: #64748B;
  }}
  .dual-big-val {{
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #0F172A;
    line-height: 1.05;
  }}
  .dual-big-val small {{
    font-size: 11px;
    font-weight: 600;
    color: #64748B;
  }}
  .dual-mini-row {{
    display: flex;
    gap: 14px;
    padding-top: 8px;
    border-top: 1px solid #E2E8F0;
  }}
  .dual-mini {{
    display: flex;
    flex-direction: column;
    gap: 1px;
  }}
  .dual-mini-k {{
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94A3B8;
  }}
  .dual-mini-v {{
    font-size: 11.5px;
    font-weight: 750;
    color: #1E293B;
  }}

  /* ── Pills & Badges ── */
  .pill {{
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.3;
  }}
  .pill-up {{ background: #DCFCE7; color: #166534; }}
  .pill-down {{ background: #FFE4E6; color: #9F1239; }}
  .pill-flat {{ background: #F1F5F9; color: #475569; }}
  .pill-muted {{ background: #F1F5F9; color: #64748B; }}
  .track-badge {{
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 9.5px;
    font-weight: 750;
    border: 1px solid transparent;
  }}

  /* ── Panel Cards & Charts ── */
  .panel-card {{
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 13px 16px;
    margin-bottom: 12px;
    break-inside: avoid;
  }}
  .panel-head {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
  }}
  .charts-grid {{
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
  }}
  .charts-grid .panel-card {{ margin-bottom: 0; }}
  .charts-1 {{ grid-template-columns: 1fr; }}
  .charts-2 {{ grid-template-columns: 1fr 1fr; }}
  .chart-legend {{
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 9px;
    font-weight: 650;
    color: #475569;
    flex-wrap: wrap;
  }}
  .chart-legend span {{
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }}
  .chart-legend .dot {{
    width: 8px;
    height: 8px;
    border-radius: 999px;
    display: inline-block;
  }}
  .chart-legend .dash {{
    width: 14px;
    height: 0;
    border-top: 2px dashed #94A3B8;
    display: inline-block;
  }}

  /* ── Error Profile Card ── */
  .error-card {{
    background: linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%);
  }}
  .error-flex {{
    display: flex;
    align-items: center;
    gap: 16px;
  }}
  .error-body {{ flex: 1; }}
  .error-title {{
    margin: 0 0 4px;
    font-size: 12.5px;
    font-weight: 750;
    color: #0F172A;
  }}
  .error-desc {{
    margin: 0 0 8px;
    font-size: 10.5px;
    color: #475569;
    line-height: 1.45;
  }}
  .error-pills {{
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }}
  .err-chip {{
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 8px;
    font-size: 9.8px;
    font-weight: 600;
  }}
  .err-wrong {{ background: #FFF1F2; color: #9F1239; border: 1px solid #FECDD3; }}
  .err-empty {{ background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }}

  /* ── Subject Performance Rows ── */
  .subj-list {{
    display: flex;
    flex-direction: column;
    gap: 7px;
  }}
  .subj-row {{
    display: grid;
    grid-template-columns: 168px 1fr 112px 92px;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 10px;
    background: #F8FAFC;
    border: 1px solid #F1F5F9;
    break-inside: avoid;
  }}
  .subj-name {{
    font-size: 11px;
    font-weight: 750;
    color: #0F172A;
  }}
  .subj-meta {{
    font-size: 9px;
    color: #64748B;
    margin-top: 1px;
  }}
  .subj-bar-col {{
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .subj-track {{
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: #E2E8F0;
    overflow: hidden;
  }}
  .subj-fill {{
    height: 100%;
    border-radius: 999px;
  }}
  .subj-pct {{
    width: 30px;
    text-align: right;
    font-size: 9.8px;
    font-weight: 750;
    color: #334155;
  }}
  .subj-net-col {{
    text-align: right;
  }}
  .subj-net {{
    font-size: 11.5px;
    font-weight: 800;
    color: #0F172A;
  }}
  .subj-net small {{
    font-size: 8.8px;
    font-weight: 600;
    color: #64748B;
  }}
  .subj-diff {{
    font-size: 8.8px;
    margin-top: 1px;
  }}
  .subj-st-col {{
    text-align: right;
  }}
  .st-badge {{
    display: inline-block;
    padding: 2.5px 8px;
    border-radius: 999px;
    font-size: 8.8px;
    font-weight: 750;
  }}
  .st-up {{ background: #DCFCE7; color: #166534; }}
  .st-down {{ background: #FFE4E6; color: #9F1239; }}
  .st-flat {{ background: #E2E8F0; color: #334155; }}

  /* ── Strengths & Study Focus Balance ── */
  .bal-grid {{
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
  }}
  .bal-2 {{ grid-template-columns: 1fr 1fr; }}
  .bal-1 {{ grid-template-columns: 1fr; }}
  .bal-card {{
    border-radius: 14px;
    padding: 13px 15px;
    border: 1px solid #E2E8F0;
    break-inside: avoid;
  }}
  .bal-green {{
    background: linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%);
    border-color: #BBF7D0;
  }}
  .bal-indigo {{
    background: linear-gradient(180deg, #EEF2FF 0%, #FFFFFF 100%);
    border-color: #C7D2FE;
  }}
  .bal-title {{
    margin: 0 0 9px;
    font-size: 12.2px;
    font-weight: 750;
    color: #0F172A;
  }}
  .bal-list {{
    display: flex;
    flex-direction: column;
    gap: 7px;
  }}
  .bal-item {{
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(15, 23, 42, 0.06);
    border-radius: 10px;
    padding: 7px 10px;
  }}
  .bal-item-head {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    font-size: 10.6px;
    color: #0F172A;
  }}
  .bal-item-sub {{
    font-size: 9.2px;
    color: #64748B;
    margin-top: 2px;
  }}
  .bal-tag {{
    font-size: 8.8px;
    font-weight: 750;
    padding: 2px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }}
  .bal-tag-green {{ background: #DCFCE7; color: #166534; }}
  .bal-tag-indigo {{ background: #E0E7FF; color: #3730A3; }}
  .planned-dot {{
    color: #059669;
    font-weight: 750;
  }}
  .bal-empty {{
    margin: 0;
    font-size: 10px;
    color: #64748B;
  }}

  /* ── Optional Context Strip ── */
  .ctx-strip {{
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
    break-inside: avoid;
  }}
  .ctx-pill {{
    flex: 1;
    min-width: 140px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 9px 13px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }}
  .ctx-k {{
    font-size: 8.8px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #64748B;
  }}
  .ctx-v {{
    font-size: 16px;
    font-weight: 800;
    color: #0F172A;
  }}
  .ctx-s {{
    font-size: 9.2px;
    color: #64748B;
  }}

  /* ── Coach Note & Footer ── */
  .coach-note-card {{
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-left: 4px solid #4F46E5;
    border-radius: 12px;
    padding: 13px 16px;
    margin-bottom: 10px;
    break-inside: avoid;
  }}
  .coach-note-body p {{
    margin: 5px 0 0;
    font-size: 10.8px;
    color: #1E293B;
    line-height: 1.55;
  }}
  .coach-note-sign {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #E2E8F0;
  }}
  .sign-name {{
    font-size: 10.5px;
    font-weight: 750;
    color: #0F172A;
  }}
  .sign-role {{
    font-size: 9.5px;
    color: #64748B;
  }}
  .sign-footer {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 4px 2px;
    border-top: 1px solid #E2E8F0;
    font-size: 9.5px;
    color: #475569;
  }}
  .doc-footer {{
    margin-top: 8px;
    text-align: center;
    font-size: 8.6px;
    color: #94A3B8;
  }}
  .empty-box {{
    text-align: center;
    padding: 40px 24px;
    border-radius: 14px;
    border: 1px dashed #CBD5E1;
    color: #64748B;
  }}
  .subj-spark {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    flex-shrink: 0;
  }}

  /* ── Progress Bridge & Consistency ── */
  .bridge-grid {{
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
  }}
  .bridge-grid .panel-card {{ margin-bottom: 0; }}
  .bridge-1 {{ grid-template-columns: 1fr; }}
  .bridge-2 {{ grid-template-columns: 1fr 1fr; }}
  .bridge-flow {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 11px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    margin-bottom: 8px;
  }}
  .bridge-node {{
    display: flex;
    flex-direction: column;
    gap: 2px;
  }}
  .bridge-node-end {{ text-align: right; }}
  .bridge-lbl {{
    font-size: 8.6px;
    font-weight: 700;
    color: #64748B;
  }}
  .bridge-val {{
    font-size: 16px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.02em;
  }}
  .bridge-val small {{
    font-size: 9.5px;
    font-weight: 600;
    color: #64748B;
  }}
  .bridge-arrow {{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }}
  .bridge-line {{
    font-size: 14px;
    font-weight: 800;
    color: #94A3B8;
    line-height: 1;
  }}
  .bridge-risers {{
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 8px;
  }}
  .riser-lbl {{
    font-size: 9px;
    font-weight: 650;
    color: #64748B;
  }}
  .riser-chip {{
    display: inline-flex;
    padding: 2px 7px;
    border-radius: 999px;
    background: #ECFDF5;
    border: 1px solid #A7F3D0;
    color: #047857;
    font-size: 8.8px;
    font-weight: 700;
  }}
  .cons-box {{
    padding: 8px 10px;
    border-radius: 10px;
    background: #F8FAFC;
    border: 1px dashed #CBD5E1;
  }}
  .cons-head {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 3px;
  }}
  .cons-k {{
    font-size: 8.2px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #64748B;
  }}
  .cons-badge {{
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 8.6px;
    font-weight: 750;
  }}
  .cons-high {{ background: #DCFCE7; color: #166534; }}
  .cons-med {{ background: #EEF2FF; color: #3730A3; }}
  .cons-vol {{ background: #FEF3C7; color: #92400E; }}
  .cons-txt {{
    font-size: 9.4px;
    color: #475569;
    line-height: 1.4;
  }}

  /* ── Net Breakdown Stacked Bar ── */
  .nb-wrap {{
    margin-bottom: 11px;
    padding: 9px 11px;
    border-radius: 10px;
    background: #F8FAFC;
    border: 1px solid #F1F5F9;
  }}
  .nb-title {{
    font-size: 8.6px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748B;
    margin-bottom: 6px;
  }}
  .nb-bar {{
    display: flex;
    height: 9px;
    border-radius: 999px;
    overflow: hidden;
    gap: 1.5px;
    background: #E2E8F0;
    margin-bottom: 7px;
  }}
  .nb-seg {{
    height: 100%;
    min-width: 4px;
  }}
  .nb-legends {{
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
  }}
  .nb-leg {{
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9.2px;
    color: #334155;
  }}
  .nb-leg i {{
    width: 7px;
    height: 7px;
    border-radius: 999px;
    display: inline-block;
  }}
  .nb-leg small {{
    color: #64748B;
  }}

  /* ── Exam History Table ── */
  .exam-tbl {{
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }}
  .exam-tbl th {{
    text-align: left;
    font-size: 8.4px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748B;
    padding: 5px 8px 6px;
    border-bottom: 1px solid #E2E8F0;
  }}
  .exam-tbl td {{
    padding: 6px 8px;
    border-bottom: 1px solid #F1F5F9;
    color: #1E293B;
  }}
  .exam-tbl tbody tr:last-child td {{ border-bottom: 0; }}
  .exam-tbl .td-r {{ text-align: right; }}
  .exam-tbl .td-date {{ color: #64748B; font-weight: 600; white-space: nowrap; }}
  .exam-tbl .td-name {{ font-weight: 650; color: #0F172A; }}
  .exam-tbl .td-dyb {{ color: #64748B; white-space: nowrap; }}
  .exam-tbl .td-net {{ font-weight: 800; color: #0F172A; font-size: 10.6px; }}
  .tbl-up {{ color: #059669; font-weight: 750; }}
  .tbl-down {{ color: #E11D48; font-weight: 750; }}
  .tbl-muted {{ color: #94A3B8; }}

  .section-break {{
    height: 2px;
  }}
</style>
</head>
<body>
  <div class="sheet">
    <header class="{hero_cls}">
      <div class="hero-top">
        <div>
          <div class="hero-kicker">{escape(kicker_title)}</div>
          <div class="hero-date">{escape(meta.get('generated_date_label') or '')}</div>
        </div>
        {logo_html}
      </div>
      <div class="hero-main">
        <div>
          <h1 class="hero-name">{escape(student_name)}</h1>
          <div class="hero-chips">{chips_html}</div>
          {greeting_html}
        </div>
        <div class="hero-right">
          <div class="hero-kurum">{escape(kurum_ad)}</div>
          {f'<div class="hero-date">{escape(distinct_sube)}</div>' if distinct_sube else ''}
        </div>
      </div>
    </header>

    {body_inner}

    <footer class="doc-footer">{escape(kurum_footer)}</footer>
  </div>
</body>
</html>'''


def render_parent_exam_report_pdf(payload: dict[str, Any]) -> bytes:
    """Modern HTML + SVG raporu vektörel A4 PDF baytlarına dönüştürür."""
    html = render_parent_exam_report_html(payload)
    return render_html_to_pdf(html, css_page_size=True)
