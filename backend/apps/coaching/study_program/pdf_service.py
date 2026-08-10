"""Haftalık çalışma programı PDF (sunucu tarafı HTML → PDF)."""
from __future__ import annotations

import html
from datetime import timedelta

from .models import WeeklyProgram

WEEKDAYS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']


def _fmt_date(d) -> str:
    if not d:
        return ''
    return d.strftime('%d.%m.%Y')


def build_study_program_html(program: WeeklyProgram) -> str:
    student = program.student
    student_name = f'{student.ad} {student.soyad}'.strip() if student else 'Öğrenci'
    coach_name = ''
    if program.coach_id:
        coach_name = program.coach.get_full_name() if program.coach else ''

    study_end = program.week_end - timedelta(days=1) if program.week_end else program.week_end
    if study_end and program.week_start and study_end < program.week_start:
        study_end = program.week_start
    range_label = f'{_fmt_date(program.week_start)} – {_fmt_date(study_end)}'

    days = list(program.days.order_by('day_date').prefetch_related('blocks__lesson'))
    study_days = [d for d in days if d.day_date != program.week_end]

    day_sections: list[str] = []
    for day in study_days:
        blocks = list(day.blocks.all().order_by('order', 'id'))
        rows = []
        for b in blocks:
            lesson = (b.lesson.ad if b.lesson_id and b.lesson else '') or ''
            topic = (b.topic_name or '').strip()
            title = topic or (b.title or '').strip() or 'Çalışma'
            q = b.question_count or 0
            rows.append(
                f'<tr><td>{html.escape(lesson)}</td>'
                f'<td>{html.escape(title)}</td>'
                f'<td style="text-align:right">{q}</td></tr>'
            )
        note = (day.coach_note or '').strip()
        note_html = (
            f'<div style="margin-top:6px;padding:6px 8px;background:#fffbeb;'
            f'border:1px solid #fde68a;border-radius:6px;font-size:11px;color:#78350f">'
            f'<strong>Koç notu:</strong> {html.escape(note)}</div>'
            if note else ''
        )
        body = (
            f'<table style="width:100%;border-collapse:collapse;font-size:11px">'
            f'<thead><tr style="background:#f1f5f9">'
            f'<th style="text-align:left;padding:4px 6px">Ders</th>'
            f'<th style="text-align:left;padding:4px 6px">Konu</th>'
            f'<th style="text-align:right;padding:4px 6px">Soru</th>'
            f'</tr></thead><tbody>{"".join(rows)}</tbody></table>'
            if rows else
            '<div style="padding:8px;color:#94a3b8;font-size:11px">Dinlenme / serbest çalışma</div>'
        )
        wd = WEEKDAYS_TR[day.weekday] if 0 <= day.weekday < 7 else 'Gün'
        day_sections.append(
            f'<div style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">'
            f'<div style="background:#0061a6;color:#fff;padding:8px 12px;font-weight:600;font-size:12px">'
            f'{html.escape(wd)} · {_fmt_date(day.day_date)}'
            f'</div>'
            f'<div style="padding:8px">{body}{note_html}</div></div>'
        )

    week_note = (program.coach_note or '').strip()
    week_note_html = (
        f'<div style="margin:12px 0;padding:10px;background:#fffbeb;border:1px solid #fde68a;'
        f'border-radius:8px;font-size:11px;color:#92400e">'
        f'<strong>Haftalık koç notu</strong><div style="margin-top:4px;white-space:pre-wrap">'
        f'{html.escape(week_note)}</div></div>'
        if week_note else ''
    )

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Çalışma Programı</title></head>
<body style="font-family:Arial,sans-serif;color:#0f172a;padding:16px;max-width:720px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#003d6b,#0061a6);color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:14px">
    <div style="font-size:11px;opacity:.85;text-transform:uppercase;letter-spacing:1px">Haftalık Çalışma Programı</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px">{html.escape(student_name)}</div>
    <div style="font-size:12px;margin-top:6px;opacity:.9">{html.escape(range_label)}
      {(' · Koç: ' + html.escape(coach_name)) if coach_name else ''}
    </div>
  </div>
  {week_note_html}
  {''.join(day_sections)}
</body></html>"""


def render_study_program_pdf(program: WeeklyProgram) -> bytes:
    from apps.communication.application.html_to_pdf import render_html_to_pdf

    return render_html_to_pdf(build_study_program_html(program))


def study_program_pdf_filename(program: WeeklyProgram) -> str:
    name = 'ogrenci'
    if program.student_id:
        name = f'{program.student.ad}_{program.student.soyad}'.strip().replace(' ', '_')
    return f'calisma-programi-{name}-{program.week_start}.pdf'
