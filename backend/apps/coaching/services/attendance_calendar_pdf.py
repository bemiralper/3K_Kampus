"""Öğrenci devamsızlık takvimi PDF (ay ay)."""
from __future__ import annotations

import base64
import calendar
import html
import re
from datetime import date
from pathlib import Path
from typing import Any

MONTHS_TR = (
    '',
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
)
WEEKDAYS_TR = ('Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz')


def _logo_data_uri() -> str:
    candidates = [
        Path(__file__).resolve().parents[3] / 'static' / 'img' / 'beyaz-logo.png',
        Path(__file__).resolve().parents[4] / 'frontend' / 'public' / 'img' / 'beyaz-logo.png',
    ]
    for path in candidates:
        if path.is_file():
            encoded = base64.b64encode(path.read_bytes()).decode('ascii')
            return f'data:image/png;base64,{encoded}'
    return ''


def attendance_calendar_filename(student_name: str) -> str:
    slug = re.sub(r'[^\w\-]+', '-', (student_name or '').strip(), flags=re.UNICODE).strip('-')
    return f'{slug or "ogrenci"}-devamsizlik.pdf'


def _fmt(day: date) -> str:
    return f'{day.day} {MONTHS_TR[day.month]} {day.year}'


def _months(start: date, end: date):
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        yield year, month
        month += 1
        if month == 13:
            month = 1
            year += 1


def _mark_line(mark: dict[str, Any]) -> str:
    if mark.get('source') == 'library':
        label = 'Kütüphane'
        period = (mark.get('period_label') or '').strip()
        return f'{label} · {period}' if period else label
    return 'Sınıf'


def _day_note(row: dict[str, Any] | None) -> tuple[str, str, str]:
    if not row:
        return '', '', ''
    if row.get('absent'):
        kind, label = 'absent', 'Gelmedi'
    elif row.get('late'):
        kind, label = 'late', 'Geç'
    else:
        return '', '', ''
    lines: list[str] = []
    for mark in row.get('marks') or []:
        if mark.get('status') != kind:
            continue
        text = _mark_line(mark)
        if text not in lines:
            lines.append(text)
    return kind, label, '<br>'.join(html.escape(line) for line in lines)


def calendar_stat_counts(payload: dict[str, Any]) -> tuple[int, int]:
    """PDF başlığındaki gelmedi / geç sayıları. Aynı gün hem geç hem gelmedi ise gelmedi sayılır."""
    by_date = {row.get('date'): row for row in payload.get('days') or []}
    absent = sum(1 for row in by_date.values() if row.get('absent'))
    late = sum(1 for row in by_date.values() if row.get('late') and not row.get('absent'))
    return absent, late


def build_attendance_calendar_html(payload: dict[str, Any], start: date, end: date) -> str:
    if end < start:
        start, end = end, start
    by_date = {row.get('date'): row for row in payload.get('days') or []}
    student = html.escape(payload.get('student_name') or 'Öğrenci')
    sinif = html.escape(payload.get('sinif_name') or 'Sınıf yok')
    coach = html.escape(payload.get('coach_name') or 'Koç yok')
    absent_count, late_count = calendar_stat_counts(payload)

    months: list[str] = []
    cal = calendar.Calendar(firstweekday=0)
    for index, (year, month) in enumerate(_months(start, end)):
        weeks = []
        for week in cal.monthdatescalendar(year, month):
            cells = []
            for day in week:
                if day.month != month:
                    cells.append('<td class="pad"></td>')
                    continue
                in_range = start <= day <= end
                row = by_date.get(day.isoformat()) if in_range else None
                kind, label, source = _day_note(row)
                classes = 'day'
                if not in_range:
                    classes += ' muted'
                elif kind:
                    classes += f' is-{kind}'
                note = ''
                if label:
                    note = f'<div class="tag">{html.escape(label)}</div>'
                    if source:
                        note += f'<div class="src">{source}</div>'
                cells.append(
                    f'<td class="{classes}"><div class="num">{day.day}</div>{note}</td>'
                )
            weeks.append(f'<tr>{"".join(cells)}</tr>')
        break_attr = ' break' if index else ''
        months.append(
            f'<section class="month{break_attr}">'
            f'<div class="month-head"><h2>{MONTHS_TR[month]} {year}</h2>'
            f'<span>{student}</span></div>'
            f'<div class="cal-wrap"><table class="cal"><thead><tr>'
            + ''.join(f'<th>{name}</th>' for name in WEEKDAYS_TR)
            + f'</tr></thead><tbody>{"".join(weeks)}</tbody></table></div></section>'
        )

    logo_uri = _logo_data_uri()
    logo_html = f'<img src="{logo_uri}" alt="3K Kampüs" />' if logo_uri else ''

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Devamsızlık Takvimi</title>
<style>
  @page {{ size: A4; margin: 12mm; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }}
  header {{
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px 28px;
    align-items: end;
    padding: 18px 20px 16px;
    border-radius: 18px;
    background: linear-gradient(135deg, #003d6b 0%, #0061a6 58%, #0085e0 100%);
    color: #fff;
  }}
  .brand {{ display: flex; align-items: center; gap: 14px; min-width: 0; }}
  .brand img {{ height: 46px; width: auto; display: block; }}
  .kicker {{
    margin: 0 0 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: rgba(255,255,255,.78);
  }}
  h1 {{ margin: 0; font-size: 26px; line-height: 1.05; letter-spacing: -0.03em; }}
  .meta {{ margin: 6px 0 0; font-size: 12px; color: #cbd5e1; }}
  .aside {{ text-align: right; }}
  .range {{
    display: inline-block;
    margin: 0 0 10px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,.1);
    font-size: 11px;
    font-weight: 700;
    color: #e2e8f0;
  }}
  .stats {{ white-space: nowrap; }}
  .stat {{
    display: inline-block;
    min-width: 78px;
    margin-left: 8px;
    padding: 8px 12px 7px;
    border-radius: 12px;
    text-align: left;
    vertical-align: top;
  }}
  .stat b {{ display: block; font-size: 20px; line-height: 1; letter-spacing: -0.03em; }}
  .stat span {{
    display: block;
    margin-top: 3px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
  }}
  .stat.absent {{ background: #ffe4e6; color: #be123c; }}
  .stat.late {{ background: #ffedd5; color: #c2410c; }}
  .month {{ margin-top: 16px; }}
  .month.break {{ break-before: page; page-break-before: always; }}
  .month-head {{
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 2px 8px;
  }}
  .month-head h2 {{ margin: 0; font-size: 18px; letter-spacing: -0.03em; }}
  .month-head span {{ font-size: 11px; color: #64748b; }}
  .cal-wrap {{ border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }}
  table.cal {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  th {{
    padding: 8px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    text-align: left;
    color: #64748b;
  }}
  td {{ height: 76px; vertical-align: top; padding: 6px 7px; border-top: 1px solid #eef2f6; border-left: 1px solid #eef2f6; }}
  tr td:first-child {{ border-left: 0; }}
  td.pad {{ background: #f8fafc; }}
  td.muted {{ color: #cbd5e1; background: #f8fafc; }}
  td.is-absent {{ background: #fff1f2; }}
  td.is-late {{ background: #fff7ed; }}
  .num {{ font-size: 12px; font-weight: 800; color: #0f172a; }}
  td.muted .num {{ color: #cbd5e1; font-weight: 700; }}
  .tag {{ margin-top: 5px; font-size: 11px; font-weight: 800; letter-spacing: -0.01em; }}
  td.is-absent .tag {{ color: #be123c; }}
  td.is-late .tag {{ color: #c2410c; }}
  .src {{ margin-top: 2px; font-size: 8px; line-height: 1.35; color: #64748b; }}
</style></head>
<body>
  <header>
    <div class="brand">
      {logo_html}
      <div>
        <p class="kicker">Devamsızlık takvimi</p>
        <h1>{student}</h1>
        <p class="meta">{sinif} · {coach}</p>
      </div>
    </div>
    <div class="aside">
      <p class="range">{html.escape(_fmt(start))} – {html.escape(_fmt(end))}</p>
      <div class="stats">
        <div class="stat absent"><b>{absent_count}</b><span>Gelmedi</span></div>
        <div class="stat late"><b>{late_count}</b><span>Geç</span></div>
      </div>
    </div>
  </header>
  {''.join(months)}
</body></html>"""


def render_attendance_calendar_pdf(payload: dict[str, Any], start: date, end: date) -> bytes:
    from apps.communication.application.html_to_pdf import render_html_to_pdf

    return render_html_to_pdf(build_attendance_calendar_html(payload, start, end))
