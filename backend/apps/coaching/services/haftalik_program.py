"""Koç haftalık programı: ödev kontrol günleri + görüşme randevuları."""
from __future__ import annotations

import html
import re
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment
from apps.coaching.models import CoachProfile, GorusmeKaydi

DAY_NAMES = (
    'Pazartesi',
    'Salı',
    'Çarşamba',
    'Perşembe',
    'Cuma',
    'Cumartesi',
    'Pazar',
)
DAY_SHORT = ('Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz')
MONTHS = (
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
)

_HOMEWORK_SKIP = {
    ManualAssignment.Status.DRAFT,
    ManualAssignment.Status.CANCELLED,
}
_HOMEWORK_STATUS = {
    ManualAssignment.Status.ASSIGNED: 'Kontrol',
    ManualAssignment.Status.IN_PROGRESS: 'Devam',
    ManualAssignment.Status.COMPLETED: 'Tamam',
    ManualAssignment.Status.OVERDUE: 'Gecikti',
}
_MEETING_STATUS = dict(GorusmeKaydi.DURUM_CHOICES)
_MEETING_KIND = dict(GorusmeKaydi.GORUSME_TURU_CHOICES)
_MEETING_METHOD = dict(GorusmeKaydi.YONTEM_CHOICES)
_TR = str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def parse_week_start(raw: str | None) -> date:
    if not raw:
        return monday_of(timezone.localdate())
    try:
        day = date.fromisoformat(str(raw)[:10])
    except ValueError as exc:
        raise ValueError('Geçersiz hafta.') from exc
    return monday_of(day)


def week_label(start: date, end: date) -> str:
    if start.month == end.month and start.year == end.year:
        return f'{start.day} – {end.day} {MONTHS[end.month - 1]} {end.year}'
    if start.year == end.year:
        return (
            f'{start.day} {MONTHS[start.month - 1]} – '
            f'{end.day} {MONTHS[end.month - 1]} {end.year}'
        )
    return (
        f'{start.day} {MONTHS[start.month - 1]} {start.year} – '
        f'{end.day} {MONTHS[end.month - 1]} {end.year}'
    )


def coach_display_name(coach: CoachProfile) -> str:
    teacher = coach.teacher
    return f'{teacher.ad} {teacher.soyad}'.strip() or f'Koç #{coach.id}'


def _student_name(student) -> str:
    return f'{getattr(student, "ad", "")} {getattr(student, "soyad", "")}'.strip() or 'Öğrenci'


def _local_due(value: datetime) -> datetime:
    if timezone.is_aware(value):
        return timezone.localtime(value)
    return value


def _homework_status(rows) -> tuple[str, str]:
    codes = {row.status for row in rows}
    if ManualAssignment.Status.OVERDUE in codes:
        return ManualAssignment.Status.OVERDUE, 'Gecikti'
    if codes and codes <= {ManualAssignment.Status.COMPLETED}:
        return ManualAssignment.Status.COMPLETED, 'Tamam'
    if ManualAssignment.Status.IN_PROGRESS in codes:
        return ManualAssignment.Status.IN_PROGRESS, 'Devam'
    return ManualAssignment.Status.ASSIGNED, 'Kontrol'


def collect_week(*, coach: CoachProfile, week_start: date, kurum_id: int, sube_id: int) -> dict:
    week_start = monday_of(week_start)
    week_end = week_start + timedelta(days=6)
    days = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        days.append({
            'date': day.isoformat(),
            'name': DAY_NAMES[offset],
            'short_name': DAY_SHORT[offset],
            'day': day.day,
            'items': [],
        })
    by_date = {row['date']: row for row in days}

    user_id = coach.teacher.user_id
    if user_id:
        start_dt = timezone.make_aware(datetime.combine(week_start, time.min))
        end_dt = timezone.make_aware(datetime.combine(week_end + timedelta(days=1), time.min))
        assignments = (
            ManualAssignment.objects.filter(
                coach_id=user_id,
                is_active=True,
                student__kurum_id=kurum_id,
                student__sube_id=sube_id,
                due_date__gte=start_dt,
                due_date__lt=end_dt,
            )
            .exclude(status__in=_HOMEWORK_SKIP)
            .select_related('student')
            .order_by('due_date', 'id')
        )
        grouped: dict[tuple[str, int], list] = {}
        for row in assignments:
            local = _local_due(row.due_date)
            iso = local.date().isoformat()
            if iso not in by_date:
                continue
            grouped.setdefault((iso, row.student_id), []).append(row)

        for (iso, _student_id), rows in grouped.items():
            student = rows[0].student
            status, status_label = _homework_status(rows)
            titles = [row.title.strip() for row in rows if (row.title or '').strip()]
            if len(rows) == 1:
                title = titles[0] if titles else 'Ödev kontrol'
                detail = ''
            else:
                title = f'{len(rows)} ödev kontrol'
                shown = titles[:3]
                detail = ', '.join(shown)
                extra = len(titles) - len(shown)
                if extra > 0:
                    detail = f'{detail} +{extra}'
            by_date[iso]['items'].append({
                'kind': 'odev',
                'kind_label': 'Ödev kontrol',
                'time': None,
                'sort': '99:99',
                'student': _student_name(student),
                'title': title,
                'detail': detail,
                'status': status,
                'status_label': status_label or _HOMEWORK_STATUS.get(status, ''),
            })

    meetings = (
        GorusmeKaydi.objects.filter(
            koc=coach,
            kurum_id=kurum_id,
            ogrenci__sube_id=sube_id,
            gorusme_tarihi__gte=week_start,
            gorusme_tarihi__lte=week_end,
        )
        .exclude(durum='iptal')
        .select_related('ogrenci')
        .order_by('gorusme_tarihi', 'gorusme_saati', 'id')
    )
    for meeting in meetings:
        iso = meeting.gorusme_tarihi.isoformat()
        if iso not in by_date:
            continue
        clock = meeting.gorusme_saati.strftime('%H:%M') if meeting.gorusme_saati else None
        method = _MEETING_METHOD.get(meeting.yontem, '')
        detail = method
        if meeting.sure_dakika:
            detail = f'{method} · {meeting.sure_dakika} dk' if method else f'{meeting.sure_dakika} dk'
        by_date[iso]['items'].append({
            'kind': 'gorusme',
            'kind_label': _MEETING_KIND.get(meeting.gorusme_turu, 'Görüşme'),
            'time': clock,
            'sort': clock or '99:99',
            'student': _student_name(meeting.ogrenci),
            'title': (meeting.konu or 'Görüşme').strip(),
            'detail': detail,
            'status': meeting.durum,
            'status_label': _MEETING_STATUS.get(meeting.durum, ''),
        })

    odev_count = 0
    gorusme_count = 0
    for day in days:
        day['items'].sort(key=lambda item: (item['sort'], item['student'], item['title']))
        for item in day['items']:
            item.pop('sort', None)
            if item['kind'] == 'odev':
                odev_count += 1
            else:
                gorusme_count += 1

    return {
        'coach_id': coach.id,
        'coach_name': coach_display_name(coach),
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'week_label': week_label(week_start, week_end),
        'days': days,
        'counts': {'odev': odev_count, 'gorusme': gorusme_count},
    }


def empty_week(week_start: date) -> dict:
    week_start = monday_of(week_start)
    week_end = week_start + timedelta(days=6)
    days = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        days.append({
            'date': day.isoformat(),
            'name': DAY_NAMES[offset],
            'short_name': DAY_SHORT[offset],
            'day': day.day,
            'items': [],
        })
    return {
        'coach_id': None,
        'coach_name': '',
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'week_label': week_label(week_start, week_end),
        'days': days,
        'counts': {'odev': 0, 'gorusme': 0},
    }


def pdf_filename(payload: dict) -> str:
    raw = (payload.get('coach_name') or 'koc').translate(_TR)
    slug = re.sub(r'[^A-Za-z0-9]+', '-', raw).strip('-') or 'koc'
    return f'{slug}-{payload.get("week_start") or "hafta"}.pdf'


def build_haftalik_program_html(payload: dict) -> str:
    coach = html.escape(payload.get('coach_name') or 'Koç')
    label = html.escape(payload.get('week_label') or '')
    counts = payload.get('counts') or {}
    summary = html.escape(
        f"{counts.get('odev', 0)} ödev kontrol · {counts.get('gorusme', 0)} görüşme"
    )
    columns = []
    for day in payload.get('days') or []:
        cards = []
        for item in day.get('items') or []:
            kind = 'odev' if item.get('kind') == 'odev' else 'gorusme'
            clock = html.escape(item.get('time') or 'Gün içi')
            cards.append(
                '<article class="card {kind}">'
                '<div class="meta"><span>{clock}</span><span>{kind_label}</span></div>'
                '<strong>{student}</strong>'
                '<p>{title}</p>'
                '{detail}'
                '<em>{status}</em>'
                '</article>'.format(
                    kind=kind,
                    clock=clock,
                    kind_label=html.escape(item.get('kind_label') or ''),
                    student=html.escape(item.get('student') or ''),
                    title=html.escape(item.get('title') or ''),
                    detail=(
                        f'<small>{html.escape(item.get("detail") or "")}</small>'
                        if item.get('detail') else ''
                    ),
                    status=html.escape(item.get('status_label') or ''),
                )
            )
        if not cards:
            cards.append('<p class="empty">Kayıt yok</p>')
        columns.append(
            '<section class="day">'
            '<header><b>{short}</b><span>{day} {name}</span></header>'
            '{cards}'
            '</section>'.format(
                short=html.escape(day.get('short_name') or ''),
                day=html.escape(str(day.get('day') or '')),
                name=html.escape(day.get('name') or ''),
                cards=''.join(cards),
            )
        )

    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>{coach} · {label}</title>
<style>
  @page {{ size: A4 landscape; margin: 8mm; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #1e293b; }}
  .head {{ display: flex; justify-content: space-between; align-items: flex-end;
           border-bottom: 3px solid #0061A6; padding-bottom: 6px; margin-bottom: 8px; }}
  h1 {{ margin: 0; font-size: 16px; color: #0061A6; }}
  .sub {{ margin: 2px 0 0; font-size: 11px; color: #475569; }}
  .board {{ display: flex; gap: 6px; align-items: stretch; }}
  .day {{ flex: 1; min-width: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; }}
  .day header {{ display: flex; justify-content: space-between; align-items: baseline;
                 border-bottom: 1px solid #e2e8f0; margin-bottom: 4px; padding: 2px 2px 4px; }}
  .day header b {{ font-size: 11px; color: #0061A6; }}
  .day header span {{ font-size: 8px; color: #64748b; }}
  .card {{ border-radius: 4px; padding: 4px 5px; margin-bottom: 4px; background: #fff;
           border: 1px solid #e2e8f0; border-left: 3px solid #0061A6; page-break-inside: avoid; }}
  .card.odev {{ border-left-color: #0f766e; }}
  .card .meta {{ display: flex; justify-content: space-between; font-size: 8px; color: #64748b; }}
  .card strong {{ display: block; font-size: 9px; margin-top: 2px; }}
  .card p {{ margin: 1px 0 0; font-size: 8px; line-height: 1.25; }}
  .card small {{ display: block; font-size: 7.5px; color: #64748b; }}
  .card em {{ display: block; margin-top: 2px; font-style: normal; font-size: 7.5px; color: #0061A6; }}
  .card.odev em {{ color: #0f766e; }}
  .empty {{ margin: 8px 2px; font-size: 8px; color: #94a3b8; }}
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>{coach}</h1>
      <p class="sub">Haftalık program · {label}</p>
    </div>
    <p class="sub">{summary}</p>
  </div>
  <div class="board">{''.join(columns)}</div>
</body>
</html>'''
