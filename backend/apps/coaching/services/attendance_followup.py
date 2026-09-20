"""
Yoklama sonrası koç bildirimi + eşik/risk.

Günlük yoklama → koça bilgilendirme (Risk Merkezi'ne düşmez).
Eşik / ardışık gelmeme → tek pending RISK kaydı (auto_attendance).
Sabah / öğle / akşam aynı takvim günü = 1 gün.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.coaching.models import (
    AttendanceCoachDigest,
    AttendanceThresholdSetting,
    CoachStudentAssignment,
    CoachingEvent,
)
from apps.takvim.domain.enums import RecipientType
from apps.takvim.infrastructure.repository import AppNotificationRepository

logger = logging.getLogger('coaching.attendance_followup')

EVENT_SOURCE = 'auto_attendance'
GOREVLER_YOKLAMA_URL = '/coach/gorevler?tab=yoklama'

PRESENT_STATUSES = frozenset({'PRESENT', 'LATE', 'NOT_AT_DESK'})
LATE_STATUSES = frozenset({'LATE'})
ABSENT_STATUSES = frozenset({'ABSENT'})
EXCUSED_STATUSES = frozenset({'EXCUSED'})

DEFAULT_ACTION_ATTENTION = 'Öğrenciyle görüş'
DEFAULT_ACTION_ALARM = 'Öğrenciyle görüş'

PERIOD_LABELS = {
    'morning': 'Sabah',
    'afternoon': 'Öğle',
    'evening': 'Akşam',
}
_PERIOD_ALIASES = {
    'MORNING': 'morning',
    'SABAH': 'morning',
    'AFTERNOON': 'afternoon',
    'OGLE': 'afternoon',
    'OGLEDEN_SONRA': 'afternoon',
    'EVENING': 'evening',
    'AKSAM': 'evening',
}


def _normalize_period(code: str | None) -> str:
    return _PERIOD_ALIASES.get((code or '').upper(), '')


def _flagged_kind(status: str | None, has_exit: bool) -> str:
    code = (status or '').upper()
    if code in LATE_STATUSES:
        return 'late'
    if code in ABSENT_STATUSES:
        return 'absent'
    if has_exit:
        return 'exit'
    return ''


@dataclass
class DayFlags:
    present: bool = False
    late: bool = False
    absent: bool = False
    exit: bool = False
    excused: bool = False
    marks: list[dict[str, Any]] = field(default_factory=list)

    def apply(
        self,
        status: str | None,
        *,
        has_exit: bool = False,
        source: str = 'class',
        period: str = '',
    ) -> None:
        code = (status or '').upper()
        if code in LATE_STATUSES:
            self.late = True
            self.present = True
        elif code in PRESENT_STATUSES:
            self.present = True
        elif code in ABSENT_STATUSES:
            self.absent = True
        elif code in EXCUSED_STATUSES:
            self.excused = True
        if has_exit:
            self.exit = True
        self._add_mark(status, has_exit=has_exit, source=source, period=period)

    def _add_mark(
        self,
        status: str | None,
        *,
        has_exit: bool,
        source: str,
        period: str,
    ) -> None:
        kind = _flagged_kind(status, has_exit)
        if not kind:
            return
        slot = period if source == 'library' else ''
        mark = {
            'source': source,
            'period': slot,
            'period_label': PERIOD_LABELS.get(slot, '') if source == 'library' else '',
            'status': kind,
            'exit': bool(has_exit and kind != 'absent'),
        }
        key = (mark['source'], mark['period'], mark['status'], mark['exit'])
        if any(
            (row['source'], row['period'], row['status'], row['exit']) == key
            for row in self.marks
        ):
            return
        self.marks.append(mark)

    @property
    def is_school_day(self) -> bool:
        return self.present or self.late or self.absent or self.exit or self.excused

    @property
    def is_absent_day(self) -> bool:
        return self.absent and not self.present

    @property
    def is_late_day(self) -> bool:
        return self.late

    @property
    def is_exit_day(self) -> bool:
        return self.exit


@dataclass
class StudentDaySummary:
    student_id: int
    student_name: str
    days: dict[date, DayFlags] = field(default_factory=dict)

    @property
    def school_dates(self) -> list[date]:
        return sorted(d for d, flags in self.days.items() if flags.is_school_day)

    @property
    def absent_days(self) -> int:
        return sum(1 for flags in self.days.values() if flags.is_absent_day)

    @property
    def late_days(self) -> int:
        return sum(1 for flags in self.days.values() if flags.is_late_day)

    @property
    def exit_days(self) -> int:
        return sum(1 for flags in self.days.values() if flags.is_exit_day)

    @property
    def consecutive_absent(self) -> int:
        dates = self.school_dates
        if not dates:
            return 0
        count = 0
        for day in reversed(dates):
            if self.days[day].is_absent_day:
                count += 1
            else:
                break
        return count

    def last_n_days(self, n: int = 3) -> list[dict[str, Any]]:
        rows = []
        for day in reversed(self.school_dates[-n:]):
            flags = self.days[day]
            rows.append({
                'date': day.isoformat(),
                'attended': flags.present,
                'absent': flags.is_absent_day,
                'late': flags.is_late_day,
                'exit': flags.is_exit_day,
            })
        return list(reversed(rows))


def get_or_create_thresholds(kurum_id: int) -> AttendanceThresholdSetting:
    obj, _ = AttendanceThresholdSetting.objects.get_or_create(
        kurum_id=kurum_id,
        defaults={
            'absence_attention': 3,
            'absence_alarm': 5,
            'late_attention': 3,
            'late_alarm': 5,
            'consecutive_absent_alarm': 2,
            'recommended_action_attention': DEFAULT_ACTION_ATTENTION,
            'recommended_action_alarm': DEFAULT_ACTION_ALARM,
        },
    )
    return obj


def serialize_thresholds(setting: AttendanceThresholdSetting) -> dict[str, Any]:
    return {
        'absence_attention': setting.absence_attention,
        'absence_alarm': setting.absence_alarm,
        'late_attention': setting.late_attention,
        'late_alarm': setting.late_alarm,
        'consecutive_absent_alarm': setting.consecutive_absent_alarm,
        'recommended_action_attention': setting.recommended_action_attention,
        'recommended_action_alarm': setting.recommended_action_alarm,
        'updated_at': setting.updated_at.isoformat() if setting.updated_at else None,
    }


def classify_severity(
    *,
    absent_days: int,
    late_days: int,
    consecutive_absent: int,
    setting: AttendanceThresholdSetting,
) -> tuple[str, list[str], str]:
    """Returns (none|attention|alarm, reasons, threshold_label)."""
    alarm_reasons: list[str] = []
    attention_reasons: list[str] = []
    labels: list[str] = []

    if setting.consecutive_absent_alarm and consecutive_absent >= setting.consecutive_absent_alarm:
        alarm_reasons.append('consecutive')
        labels.append(f'{setting.consecutive_absent_alarm} ardışık gün gelmeme')
    if setting.absence_alarm and absent_days >= setting.absence_alarm:
        alarm_reasons.append('absence')
        labels.append(f'{setting.absence_alarm} devamsızlık')
    if setting.late_alarm and late_days >= setting.late_alarm:
        alarm_reasons.append('late')
        labels.append(f'{setting.late_alarm} geç kalma')

    if not alarm_reasons:
        if setting.absence_attention and absent_days >= setting.absence_attention:
            attention_reasons.append('absence')
            labels.append(f'{setting.absence_attention} devamsızlık')
        if setting.late_attention and late_days >= setting.late_attention:
            attention_reasons.append('late')
            labels.append(f'{setting.late_attention} geç kalma')

    if alarm_reasons:
        return 'alarm', alarm_reasons, ' · '.join(labels)
    if attention_reasons:
        return 'attention', attention_reasons, ' · '.join(labels)
    return 'none', [], ''


@dataclass(frozen=True)
class FollowupScope:
    kurum_id: int
    sube_id: int | None
    term_id: int | None
    year_id: int | None
    start: date
    end: date


def resolve_followup_scope(
    *,
    kurum_id: int,
    on_date: date,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
    term=None,
) -> FollowupScope:
    """Aktif dönem penceresi. Pasif / eski dönem yoklaması bu aralığın dışındadır."""
    if term is None:
        from apps.term.domain.models import Term

        qs = Term.objects.filter(kurum_id=kurum_id, is_active=True)
        if sube_id:
            qs = qs.filter(sube_id=sube_id)
        if egitim_yili_id:
            qs = qs.filter(egitim_yili_id=egitim_yili_id)
        term = qs.order_by('-start_date', '-id').first()
    if term:
        start = term.start_date
        end = min(on_date, term.end_date)
        if end < start:
            end = start
        return FollowupScope(
            kurum_id=kurum_id,
            sube_id=sube_id or getattr(term, 'sube_id', None),
            term_id=term.id,
            year_id=term.egitim_yili_id,
            start=start,
            end=end,
        )
    try:
        from apps.academic.interfaces.repositories.active_year import get_active_academic_year

        year = get_active_academic_year()
        if year:
            return FollowupScope(
                kurum_id=kurum_id,
                sube_id=sube_id,
                term_id=None,
                year_id=year.id,
                start=date(year.baslangic_yil, 9, 1),
                end=on_date,
            )
    except Exception:
        logger.debug('Aktif dönem/yıl okunamadı, 180 günlük pencere kullanılacak.')
    return FollowupScope(
        kurum_id=kurum_id,
        sube_id=sube_id,
        term_id=None,
        year_id=None,
        start=on_date - timedelta(days=180),
        end=on_date,
    )


def _package_types_by_student(student_ids: list[int]) -> dict[int, set[str]]:
    from collections import defaultdict

    from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
    from apps.odeme_takip.domain.models import SozlesmeKalemi
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    types: dict[int, set[str]] = defaultdict(set)
    if not student_ids:
        return types

    for student_id, tur in OgrenciEgitimPaketi.objects.filter(
        ogrenci_id__in=student_ids,
        aktif_mi=True,
    ).values_list('ogrenci_id', 'paket_turu'):
        if tur:
            types[student_id].add(tur)

    kalem_map = {
        KalemTuru.GRUP_DERSI: 'grup_dersi',
        KalemTuru.OZEL_DERS: 'ozel_ders',
        KalemTuru.PREMIUM: 'premium',
        KalemTuru.DENEME: 'deneme',
    }
    for student_id, tur in SozlesmeKalemi.objects.filter(
        sozlesme__ogrenci_id__in=student_ids,
        sozlesme__durum__in=(
            SozlesmeDurum.AKTIF,
            SozlesmeDurum.TAMAMLANDI,
            SozlesmeDurum.DONDURULMUS,
        ),
        kalem_turu__in=tuple(kalem_map),
    ).values_list('sozlesme__ogrenci_id', 'kalem_turu'):
        mapped = kalem_map.get(tur)
        if mapped:
            types[student_id].add(mapped)
    return types


def followup_roster_student_ids(
    *,
    kurum_id: int,
    sube_id: int,
    on_date: date,
    egitim_yili_id: int | None = None,
    scope: FollowupScope | None = None,
) -> set[int]:
    """Sınıf yerleşimi veya kütüphane box'ı olanlar. Özel ders / deneme kulübü yok."""
    from django.db.models import Q

    from apps.academic.domain.placement_queries import active_student_placements
    from apps.kutuphane.domain.models import AssignmentStatus, SeatAssignment
    from apps.ogrenci.domain.models import Ogrenci
    from apps.ogrenci.services.kayit_turu import is_deneme_kulubu_kayit

    scope = scope or resolve_followup_scope(
        kurum_id=kurum_id,
        sube_id=sube_id,
        on_date=on_date,
        egitim_yili_id=egitim_yili_id,
    )
    placement_filters: dict[str, Any] = {
        'classroom__aktif_mi': True,
        'classroom__kurum_id': kurum_id,
        'classroom__sube_id': sube_id,
    }
    if scope.term_id:
        placement_filters['term_id'] = scope.term_id
    elif scope.year_id:
        placement_filters['academic_year_id'] = scope.year_id
    placed_ids = set(active_student_placements(**placement_filters).values_list('student_id', flat=True))

    box_qs = SeatAssignment.objects.filter(
        durum=AssignmentStatus.ACTIVE,
        library__is_deleted=False,
        library__aktif_mi=True,
        library__kurum_id=kurum_id,
        library__sube_id=sube_id,
        baslangic_tarihi__lte=on_date,
    ).filter(Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=on_date))
    boxed_ids = set(box_qs.values_list('ogrenci_id', flat=True))

    candidate_ids = placed_ids | boxed_ids
    if not candidate_ids:
        return set()

    students = {
        row.id: row
        for row in Ogrenci.objects.filter(id__in=candidate_ids, aktif_mi=True)
    }
    package_types = _package_types_by_student(list(students))
    eligible: set[int] = set()
    for student_id, student in students.items():
        if is_deneme_kulubu_kayit(student):
            continue
        kinds = package_types.get(student_id, set())
        only_ozel = 'ozel_ders' in kinds and not (kinds & {'grup_dersi', 'premium'})
        if only_ozel and student_id not in placed_ids:
            continue
        eligible.add(student_id)
    return eligible


def followup_roster_students(
    *,
    kurum_id: int,
    sube_id: int,
    on_date: date,
    egitim_yili_id: int | None = None,
    allowed_ids: Iterable[int] | None = None,
):
    from apps.ogrenci.domain.models import Ogrenci

    ids = followup_roster_student_ids(
        kurum_id=kurum_id,
        sube_id=sube_id,
        on_date=on_date,
        egitim_yili_id=egitim_yili_id,
    )
    if allowed_ids is not None:
        ids &= {int(x) for x in allowed_ids}
    return list(
        Ogrenci.objects.filter(id__in=ids, aktif_mi=True).order_by('ad', 'soyad')
    )


def _primary_assignments(student_ids: Iterable[int]) -> dict[int, CoachStudentAssignment]:
    ids = [int(x) for x in student_ids if x]
    if not ids:
        return {}
    rows = (
        CoachStudentAssignment.objects.filter(
            student_id__in=ids,
            is_primary=True,
            end_date__isnull=True,
        )
        .select_related('coach__teacher', 'student')
    )
    return {row.student_id: row for row in rows}


def _student_name(student) -> str:
    return f'{student.ad} {student.soyad}'.strip()


def _load_day_map(student_ids: list[int], scope: FollowupScope) -> dict[int, dict[date, DayFlags]]:
    day_map: dict[int, dict[date, DayFlags]] = defaultdict(lambda: defaultdict(DayFlags))
    if not student_ids:
        return day_map

    from apps.academic.domain.class_period_attendance import ClassPeriodAttendanceRecord
    from apps.academic.domain.lesson_attendance import LessonAttendanceRecord
    from apps.kutuphane.domain.models import AttendanceRecord

    period_qs = ClassPeriodAttendanceRecord.objects.filter(
        student_id__in=student_ids,
        session__is_active=True,
        session__session_date__gte=scope.start,
        session__session_date__lte=scope.end,
    )
    if scope.term_id:
        period_qs = period_qs.filter(session__term_id=scope.term_id)
    elif scope.year_id:
        period_qs = period_qs.filter(session__egitim_yili_id=scope.year_id)
    for student_id, day, status, period in period_qs.values_list(
        'student_id', 'session__session_date', 'status', 'session__period',
    ):
        day_map[student_id][day].apply(
            status,
            source='class',
            period=_normalize_period(period),
        )

    lesson_qs = LessonAttendanceRecord.objects.filter(
        student_id__in=student_ids,
        session__session_date__gte=scope.start,
        session__session_date__lte=scope.end,
    )
    if scope.term_id:
        lesson_qs = lesson_qs.filter(session__term_id=scope.term_id)
    elif scope.year_id:
        lesson_qs = lesson_qs.filter(session__egitim_yili_id=scope.year_id)
    for student_id, day, status in lesson_qs.values_list(
        'student_id', 'session__session_date', 'status',
    ):
        day_map[student_id][day].apply(status, source='class')

    library_qs = AttendanceRecord.objects.filter(
        ogrenci_id__in=student_ids,
        attendance_session__tarih__gte=scope.start,
        attendance_session__tarih__lte=scope.end,
        attendance_session__library__is_deleted=False,
        attendance_session__library__aktif_mi=True,
        attendance_session__library__kurum_id=scope.kurum_id,
    )
    if scope.sube_id:
        library_qs = library_qs.filter(attendance_session__library__sube_id=scope.sube_id)
    for student_id, day, status, cikis, period in library_qs.values_list(
        'ogrenci_id',
        'attendance_session__tarih',
        'durum',
        'cikis_saati',
        'attendance_session__periyot_kodu',
    ):
        day_map[student_id][day].apply(
            status,
            has_exit=bool(cikis),
            source='library',
            period=_normalize_period(period),
        )

    return day_map


def build_student_summaries(
    students: list[Any],
    *,
    scope: FollowupScope,
) -> list[StudentDaySummary]:
    ids = [s.id for s in students]
    day_map = _load_day_map(ids, scope)
    summaries = []
    for student in students:
        summaries.append(StudentDaySummary(
            student_id=student.id,
            student_name=_student_name(student),
            days=dict(day_map.get(student.id) or {}),
        ))
    return summaries


def _recommended_action(severity: str, setting: AttendanceThresholdSetting) -> str:
    if severity == 'alarm':
        return setting.recommended_action_alarm or DEFAULT_ACTION_ALARM
    if severity == 'attention':
        return setting.recommended_action_attention or DEFAULT_ACTION_ATTENTION
    return ''


def _notify_coach_digest(
    *,
    coach,
    source_key: str,
    session_date: date,
    student_ids: list[int],
    title: str,
    message: str,
    kurum_id: int,
) -> None:
    user_id = getattr(getattr(coach, 'teacher', None), 'user_id', None)
    if not user_id or not student_ids:
        return

    digest, created = AttendanceCoachDigest.objects.get_or_create(
        coach=coach,
        source_key=source_key,
        defaults={
            'session_date': session_date,
            'student_ids': student_ids,
        },
    )
    previous = {int(x) for x in (digest.student_ids or [])}
    current = {int(x) for x in student_ids}
    grew = current - previous
    if not created and not grew:
        return

    repo = AppNotificationRepository()
    notif = repo.create({
        'kurum_id': kurum_id,
        'user_id': user_id,
        'alici_tip': RecipientType.OGRETMEN,
        'baslik': title,
        'mesaj': message,
        'ikon': '📋',
        'renk': '#C2410C',
        'url': f'{GOREVLER_YOKLAMA_URL}&date={session_date.isoformat()}',
        'ekran_mesaji': False,
    })
    digest.session_date = session_date
    digest.student_ids = sorted(current)
    digest.notification_id = str(notif.id)
    digest.save(update_fields=['session_date', 'student_ids', 'notification_id', 'updated_at'])


def _upsert_risk_event(
    *,
    assignment: CoachStudentAssignment,
    summary: StudentDaySummary,
    setting: AttendanceThresholdSetting,
    severity: str,
    reasons: list[str],
    threshold_label: str,
    session_date: date,
) -> CoachingEvent | None:
    if severity not in {'attention', 'alarm'}:
        return None

    last_3 = summary.last_n_days(3)
    last_3_absent = sum(1 for row in last_3 if row['absent'])
    action = _recommended_action(severity, setting)
    title = '🔴 Devam Alarmı' if severity == 'alarm' else '🟠 Devam Dikkat'
    lines = [
        summary.student_name,
        f'{summary.absent_days} devamsızlık',
        f'{summary.late_days} geç kalma',
    ]
    if last_3:
        lines.append(f"Son {len(last_3)} günlük yoklamadan {last_3_absent}'sine katılmadı")
    if threshold_label:
        lines.append(f'Eşik: {threshold_label}')
    if action:
        lines.append(f'Önerilen aksiyon: {action}')
    description = '\n'.join(lines)
    metadata = {
        'reason': title,
        'attendance': {
            'severity': severity,
            'reasons': reasons,
            'absent_days': summary.absent_days,
            'late_days': summary.late_days,
            'exit_days': summary.exit_days,
            'consecutive_absent': summary.consecutive_absent,
            'last_3_days': last_3,
            'last_3_absent': last_3_absent,
            'threshold_label': threshold_label,
            'recommended_action': action,
        },
    }

    open_event = (
        CoachingEvent.objects.filter(
            student_id=summary.student_id,
            event_type='RISK',
            event_source=EVENT_SOURCE,
            status__in=['pending', 'in_progress'],
        )
        .order_by('-id')
        .first()
    )
    now = timezone.now()
    if open_event:
        prev = (open_event.metadata or {}).get('attendance') or {}
        if (
            prev.get('severity') == severity
            and prev.get('absent_days') == summary.absent_days
            and prev.get('late_days') == summary.late_days
            and prev.get('consecutive_absent') == summary.consecutive_absent
        ):
            return open_event
        open_event.title = title
        open_event.description = description
        open_event.event_date = now
        open_event.coach = assignment.coach
        open_event.metadata = metadata
        open_event.save(update_fields=[
            'title', 'description', 'event_date', 'coach', 'metadata', 'updated_at',
        ])
        return open_event

    return CoachingEvent.objects.create(
        student=assignment.student,
        coach=assignment.coach,
        event_type='RISK',
        title=title,
        description=description,
        event_date=now,
        status='pending',
        event_source=EVENT_SOURCE,
        reference_id=None,
        metadata=metadata,
    )


def _evaluate_students(
    *,
    assignments: dict[int, CoachStudentAssignment],
    summaries: list[StudentDaySummary],
    setting: AttendanceThresholdSetting,
    session_date: date,
    flagged_ids: set[int],
) -> None:
    by_id = {row.student_id: row for row in summaries}
    for student_id in flagged_ids:
        assignment = assignments.get(student_id)
        summary = by_id.get(student_id)
        if not assignment or not summary:
            continue
        severity, reasons, label = classify_severity(
            absent_days=summary.absent_days,
            late_days=summary.late_days,
            consecutive_absent=summary.consecutive_absent,
            setting=setting,
        )
        _upsert_risk_event(
            assignment=assignment,
            summary=summary,
            setting=setting,
            severity=severity,
            reasons=reasons,
            threshold_label=label,
            session_date=session_date,
        )


def _format_names(names: list[str], limit: int = 4) -> str:
    if not names:
        return ''
    shown = names[:limit]
    extra = len(names) - limit
    text = ', '.join(shown)
    if extra > 0:
        text = f'{text} ve {extra} öğrenci daha'
    return text


def process_period_attendance_followup(session_id: int) -> dict[str, Any]:
    from apps.academic.domain.class_period_attendance import ClassPeriodAttendanceRecord
    from apps.academic.domain.class_period_attendance import ClassPeriodAttendanceSession
    from apps.academic.domain.lesson_attendance import StudentAttendanceStatus

    try:
        session = ClassPeriodAttendanceSession.objects.select_related('sinif').get(pk=session_id)
    except ClassPeriodAttendanceSession.DoesNotExist:
        return {'ok': False, 'error': 'session_missing'}

    records = list(
        ClassPeriodAttendanceRecord.objects.filter(session=session).select_related('student')
    )
    flagged = [
        r for r in records
        if r.status in (StudentAttendanceStatus.ABSENT, StudentAttendanceStatus.LATE)
    ]
    return _process_flagged_records(
        source_key=f'period:{session.id}',
        session_date=session.session_date,
        label=f'{session.sinif} · {session.period_label}',
        flagged_students=[r.student for r in flagged],
        absent_names=[_student_name(r.student) for r in flagged if r.status == StudentAttendanceStatus.ABSENT],
        late_names=[_student_name(r.student) for r in flagged if r.status == StudentAttendanceStatus.LATE],
        exit_names=[],
        term=session.term,
    )


def process_library_attendance_followup(session_id) -> dict[str, Any]:
    from apps.kutuphane.domain.models import AttendanceRecord, AttendanceSession, AttendanceStatus

    try:
        session = AttendanceSession.objects.select_related('library').get(pk=session_id)
    except AttendanceSession.DoesNotExist:
        return {'ok': False, 'error': 'session_missing'}

    records = list(AttendanceRecord.objects.filter(attendance_session=session))
    from apps.ogrenci.domain.models import Ogrenci

    student_ids = [r.ogrenci_id for r in records]
    students = {o.id: o for o in Ogrenci.objects.filter(id__in=student_ids)}
    flagged_students = []
    absent_names, late_names, exit_names = [], [], []
    for rec in records:
        student = students.get(rec.ogrenci_id)
        if not student:
            continue
        is_absent = rec.durum == AttendanceStatus.ABSENT
        is_late = rec.durum == AttendanceStatus.LATE
        is_exit = bool(rec.cikis_saati)
        if not (is_absent or is_late or is_exit):
            continue
        flagged_students.append(student)
        name = _student_name(student)
        if is_absent:
            absent_names.append(name)
        if is_late:
            late_names.append(name)
        if is_exit:
            exit_names.append(name)

    period = session.get_periyot_kodu_display() if session.periyot_kodu else 'Kütüphane'
    return _process_flagged_records(
        source_key=f'library:{session.id}',
        session_date=session.tarih,
        label=f'{session.library.ad} · {period}',
        flagged_students=flagged_students,
        absent_names=absent_names,
        late_names=late_names,
        exit_names=exit_names,
    )


def _process_flagged_records(
    *,
    source_key: str,
    session_date: date,
    label: str,
    flagged_students: list[Any],
    absent_names: list[str],
    late_names: list[str],
    exit_names: list[str],
    term=None,
) -> dict[str, Any]:
    if not flagged_students:
        return {'ok': True, 'notified': 0, 'risks': 0}

    unique_students = {s.id: s for s in flagged_students}
    assignments = _primary_assignments(unique_students.keys())
    if not assignments:
        return {'ok': True, 'notified': 0, 'risks': 0}

    first_student = next(iter(unique_students.values()))
    kurum_id = first_student.kurum_id
    setting = get_or_create_thresholds(kurum_id)
    active_term = term if term is not None and getattr(term, 'is_active', False) else None
    scope = resolve_followup_scope(
        kurum_id=kurum_id,
        sube_id=first_student.sube_id,
        on_date=session_date,
        term=active_term,
    )
    summaries = build_student_summaries(list(unique_students.values()), scope=scope)

    by_coach: dict[int, dict[str, Any]] = {}
    for student in unique_students.values():
        assignment = assignments.get(student.id)
        if not assignment:
            continue
        bucket = by_coach.setdefault(assignment.coach_id, {
            'coach': assignment.coach,
            'ids': [],
            'absent': [],
            'late': [],
            'exit': [],
        })
        bucket['ids'].append(student.id)
        name = _student_name(student)
        if name in absent_names:
            bucket['absent'].append(name)
        if name in late_names:
            bucket['late'].append(name)
        if name in exit_names:
            bucket['exit'].append(name)

    notified = 0
    for bucket in by_coach.values():
        parts = []
        if bucket['absent']:
            parts.append(f"{len(bucket['absent'])} gelmedi")
        if bucket['late']:
            parts.append(f"{len(bucket['late'])} geç geldi")
        if bucket['exit']:
            parts.append(f"{len(bucket['exit'])} çıkış yaptı")
        title = f"Yoklama: {', '.join(parts)}" if parts else 'Yoklama bildirimi'
        detail_bits = []
        if bucket['absent']:
            detail_bits.append(f"Gelmedi: {_format_names(bucket['absent'])}")
        if bucket['late']:
            detail_bits.append(f"Geç: {_format_names(bucket['late'])}")
        if bucket['exit']:
            detail_bits.append(f"Çıkış: {_format_names(bucket['exit'])}")
        message = f"{label} · {session_date.strftime('%d.%m.%Y')}. " + ' · '.join(detail_bits)
        before = AttendanceCoachDigest.objects.filter(
            coach=bucket['coach'], source_key=source_key,
        ).first()
        prev_count = len(before.student_ids) if before else 0
        _notify_coach_digest(
            coach=bucket['coach'],
            source_key=source_key,
            session_date=session_date,
            student_ids=bucket['ids'],
            title=title,
            message=message,
            kurum_id=kurum_id,
        )
        after = AttendanceCoachDigest.objects.filter(
            coach=bucket['coach'], source_key=source_key,
        ).first()
        if after and len(after.student_ids or []) > prev_count:
            notified += 1
        elif after and prev_count == 0:
            notified += 1

    _evaluate_students(
        assignments=assignments,
        summaries=summaries,
        setting=setting,
        session_date=session_date,
        flagged_ids=set(unique_students.keys()),
    )
    return {'ok': True, 'notified': notified, 'risks': 1}


def safe_process_period_followup(session_id: int) -> None:
    try:
        process_period_attendance_followup(session_id)
    except Exception:
        logger.exception('Sınıf yoklama koç bildirimi başarısız session=%s', session_id)


def safe_process_library_followup(session_id) -> None:
    try:
        process_library_attendance_followup(session_id)
    except Exception:
        logger.exception('Kütüphane yoklama koç bildirimi başarısız session=%s', session_id)


def schedule_period_followup(session_id: int) -> None:
    transaction.on_commit(lambda: safe_process_period_followup(session_id))


def schedule_library_followup(session_id) -> None:
    transaction.on_commit(lambda: safe_process_library_followup(session_id))


def coach_followup_payload(coach, *, on_date: date) -> dict[str, Any]:
    from apps.coaching.services.coach_access import get_active_coach_student_ids
    from apps.ogrenci.domain.models import Ogrenci

    student_ids = list(get_active_coach_student_ids(coach))
    teacher = getattr(coach, 'teacher', None)
    kurum_id = getattr(teacher, 'kurum_id', None)
    sube_id = getattr(teacher, 'sube_id', None)
    if not kurum_id and student_ids:
        first = Ogrenci.objects.filter(id__in=student_ids).only('kurum_id', 'sube_id').first()
        if first:
            kurum_id = first.kurum_id
            sube_id = first.sube_id
    students = followup_roster_students(
        kurum_id=kurum_id,
        sube_id=sube_id,
        on_date=on_date,
        allowed_ids=student_ids,
    ) if kurum_id and sube_id else []
    return followup_payload_for_students(
        students, on_date=on_date, kurum_id=kurum_id or 0, sube_id=sube_id,
    )


def followup_payload_for_students(
    students: list[Any],
    *,
    on_date: date,
    kurum_id: int,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
    scope: FollowupScope | None = None,
) -> dict[str, Any]:
    setting = get_or_create_thresholds(kurum_id)
    scope = scope or resolve_followup_scope(
        kurum_id=kurum_id,
        sube_id=sube_id,
        on_date=on_date,
        egitim_yili_id=egitim_yili_id,
    )
    if not students:
        return {
            'date': on_date.isoformat(),
            'thresholds': serialize_thresholds(setting),
            'day_counts': {
                'total_students': 0,
                'present': 0,
                'late': 0,
                'absent': 0,
                'exit': 0,
                'excused': 0,
            },
            'students': [],
            'filters': {'coaches': [], 'classes': []},
        }

    summaries = build_student_summaries(students, scope=scope)
    class_map = _class_map([s.id for s in students], scope)
    coach_map = _coach_display_map([s.id for s in students])

    day_counts = {
        'total_students': len(summaries),
        'present': 0,
        'late': 0,
        'absent': 0,
        'exit': 0,
        'excused': 0,
    }
    rows = []
    for summary in summaries:
        flags = summary.days.get(on_date) or DayFlags()
        if flags.present and not flags.late:
            day_counts['present'] += 1
        if flags.is_late_day:
            day_counts['late'] += 1
        if flags.is_absent_day:
            day_counts['absent'] += 1
        if flags.is_exit_day:
            day_counts['exit'] += 1
        if flags.excused and not flags.present and not flags.absent:
            day_counts['excused'] += 1

        severity, reasons, label = classify_severity(
            absent_days=summary.absent_days,
            late_days=summary.late_days,
            consecutive_absent=summary.consecutive_absent,
            setting=setting,
        )
        today_status = 'NONE'
        if flags.is_absent_day:
            today_status = 'ABSENT'
        elif flags.is_late_day:
            today_status = 'LATE'
        elif flags.present:
            today_status = 'PRESENT'
        elif flags.excused:
            today_status = 'EXCUSED'
        if flags.is_exit_day and today_status in {'PRESENT', 'LATE', 'NONE'}:
            today_status = 'EXIT' if today_status == 'NONE' else today_status

        last_3 = summary.last_n_days(3)
        klass = class_map.get(summary.student_id) or {}
        coach = coach_map.get(summary.student_id) or {}
        rows.append({
            'student_id': summary.student_id,
            'student_name': summary.student_name,
            'sinif_id': klass.get('id'),
            'sinif_name': klass.get('name') or '',
            'coach_id': coach.get('id'),
            'coach_name': coach.get('name') or '',
            'today_status': today_status,
            'today_absent': flags.is_absent_day,
            'today_late': flags.is_late_day,
            'today_exit': flags.is_exit_day,
            'absent_days': summary.absent_days,
            'late_days': summary.late_days,
            'exit_days': summary.exit_days,
            'consecutive_absent': summary.consecutive_absent,
            'last_3_days': last_3,
            'last_3_absent': sum(1 for item in last_3 if item['absent']),
            'severity': severity,
            'reasons': reasons,
            'threshold_label': label,
            'recommended_action': _recommended_action(severity, setting),
        })

    rank = {'alarm': 0, 'attention': 1, 'none': 2}
    today_rank = {'ABSENT': 0, 'LATE': 1, 'EXIT': 2, 'EXCUSED': 3, 'PRESENT': 4, 'NONE': 5}
    rows.sort(key=lambda r: (
        rank.get(r['severity'], 9),
        today_rank.get(r['today_status'], 9),
        -r['absent_days'],
        r['student_name'],
    ))
    return {
        'date': on_date.isoformat(),
        'thresholds': serialize_thresholds(setting),
        'day_counts': day_counts,
        'students': rows,
        'filters': _filter_options(rows),
    }


def _class_map(student_ids: list[int], scope: FollowupScope | None = None) -> dict[int, dict[str, Any]]:
    from django.db.models import Q

    from apps.academic.domain.placement_queries import active_student_placements

    result: dict[int, dict[str, Any]] = {}
    if not student_ids:
        return result
    filters: dict[str, Any] = {
        'student_id__in': student_ids,
        'classroom__aktif_mi': True,
    }
    if scope:
        filters['classroom__kurum_id'] = scope.kurum_id
        if scope.sube_id:
            filters['classroom__sube_id'] = scope.sube_id
        if scope.term_id:
            filters['term_id'] = scope.term_id
        if scope.year_id:
            filters['academic_year_id'] = scope.year_id
            filters['classroom__egitim_yili_id'] = scope.year_id
    qs = active_student_placements(**filters).select_related('classroom')
    if scope and scope.term_id:
        qs = qs.filter(Q(classroom__term_id=scope.term_id) | Q(classroom__term_id__isnull=True))
    for row in qs:
        classroom = row.classroom
        if classroom is None or not classroom.aktif_mi:
            continue
        result[row.student_id] = {
            'id': row.classroom_id,
            'name': getattr(classroom, 'ad', '') or str(classroom),
        }
    return result


def _coach_display_map(student_ids: list[int]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for student_id, assignment in _primary_assignments(student_ids).items():
        teacher = getattr(assignment.coach, 'teacher', None)
        name = ''
        if teacher:
            name = f'{teacher.ad} {teacher.soyad}'.strip()
        result[student_id] = {
            'id': assignment.coach_id,
            'name': name,
        }
    return result


def _filter_options(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    coaches = {}
    classes = {}
    for row in rows:
        if row.get('coach_id') and row.get('coach_name'):
            coaches[row['coach_id']] = row['coach_name']
        if row.get('sinif_id') and row.get('sinif_name'):
            classes[row['sinif_id']] = row['sinif_name']
    return {
        'coaches': [{'id': cid, 'name': name} for cid, name in sorted(coaches.items(), key=lambda x: x[1])],
        'classes': [{'id': sid, 'name': name} for sid, name in sorted(classes.items(), key=lambda x: x[1])],
    }


_SOURCE_ORDER = {'class': 0, 'library': 1}
_PERIOD_ORDER = {'': 0, 'morning': 1, 'afternoon': 2, 'evening': 3}


def _serialize_marks(flags: DayFlags) -> list[dict[str, Any]]:
    rows = list(flags.marks)
    rows.sort(key=lambda row: (
        _SOURCE_ORDER.get(row.get('source'), 9),
        _PERIOD_ORDER.get(row.get('period') or '', 9),
        row.get('status') or '',
    ))
    return rows


def _serialize_day_flags(day: date, flags: DayFlags) -> dict[str, Any]:
    return {
        'date': day.isoformat(),
        'attended': flags.present,
        'absent': flags.is_absent_day,
        'late': flags.is_late_day,
        'exit': flags.is_exit_day,
        'excused': flags.excused and not flags.present and not flags.absent,
        'marks': _serialize_marks(flags),
    }


def student_history_payload(
    student,
    *,
    on_date: date,
    kurum_id: int,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
) -> dict[str, Any]:
    setting = get_or_create_thresholds(kurum_id)
    scope = resolve_followup_scope(
        kurum_id=kurum_id,
        sube_id=sube_id or student.sube_id,
        on_date=on_date,
        egitim_yili_id=egitim_yili_id,
    )
    summary = build_student_summaries([student], scope=scope)[0]
    klass = _class_map([student.id], scope).get(student.id) or {}
    coach = _coach_display_map([student.id]).get(student.id) or {}
    severity, reasons, label = classify_severity(
        absent_days=summary.absent_days,
        late_days=summary.late_days,
        consecutive_absent=summary.consecutive_absent,
        setting=setting,
    )
    days = [
        _serialize_day_flags(day, summary.days[day])
        for day in sorted(summary.days)
        if summary.days[day].is_school_day
    ]
    last_3 = summary.last_n_days(3)
    return {
        'date': on_date.isoformat(),
        'thresholds': serialize_thresholds(setting),
        'student_id': student.id,
        'student_name': summary.student_name,
        'sinif_id': klass.get('id'),
        'sinif_name': klass.get('name') or '',
        'coach_id': coach.get('id'),
        'coach_name': coach.get('name') or '',
        'absent_days': summary.absent_days,
        'late_days': summary.late_days,
        'exit_days': summary.exit_days,
        'consecutive_absent': summary.consecutive_absent,
        'severity': severity,
        'reasons': reasons,
        'threshold_label': label,
        'recommended_action': _recommended_action(severity, setting),
        'last_3_days': last_3,
        'last_3_absent': sum(1 for item in last_3 if item['absent']),
        'days': days,
    }


def analysis_payload(
    students: list[Any],
    *,
    on_date: date,
    kurum_id: int,
    sube_id: int | None = None,
    egitim_yili_id: int | None = None,
) -> dict[str, Any]:
    setting = get_or_create_thresholds(kurum_id)
    scope = resolve_followup_scope(
        kurum_id=kurum_id,
        sube_id=sube_id,
        on_date=on_date,
        egitim_yili_id=egitim_yili_id,
    )
    if not students:
        return {
            'date': on_date.isoformat(),
            'thresholds': serialize_thresholds(setting),
            'kpis': {
                'total_students': 0,
                'alarm': 0,
                'attention': 0,
                'consecutive_alarm': 0,
                'today_absent': 0,
                'today_late': 0,
                'total_absent_days': 0,
            },
            'by_class': [],
            'by_coach': [],
            'consecutive': [],
            'rising': [],
            'top_absent': [],
        }

    summaries = build_student_summaries(students, scope=scope)
    class_map = _class_map([s.id for s in students], scope)
    coach_map = _coach_display_map([s.id for s in students])
    recent_start = on_date - timedelta(days=6)
    prev_start = on_date - timedelta(days=13)
    prev_end = on_date - timedelta(days=7)

    by_class: dict[str, dict[str, Any]] = {}
    by_coach: dict[str, dict[str, Any]] = {}
    consecutive_rows = []
    rising_rows = []
    top_rows = []
    kpis = {
        'total_students': len(summaries),
        'alarm': 0,
        'attention': 0,
        'consecutive_alarm': 0,
        'today_absent': 0,
        'today_late': 0,
        'total_absent_days': 0,
    }

    for summary in summaries:
        severity, _reasons, label = classify_severity(
            absent_days=summary.absent_days,
            late_days=summary.late_days,
            consecutive_absent=summary.consecutive_absent,
            setting=setting,
        )
        flags = summary.days.get(on_date) or DayFlags()
        if severity == 'alarm':
            kpis['alarm'] += 1
        elif severity == 'attention':
            kpis['attention'] += 1
        if (
            setting.consecutive_absent_alarm
            and summary.consecutive_absent >= setting.consecutive_absent_alarm
        ):
            kpis['consecutive_alarm'] += 1
        if flags.is_absent_day:
            kpis['today_absent'] += 1
        if flags.is_late_day:
            kpis['today_late'] += 1
        kpis['total_absent_days'] += summary.absent_days

        klass = class_map.get(summary.student_id) or {}
        coach = coach_map.get(summary.student_id) or {}
        class_key = klass.get('name') or 'Sınıf yok'
        coach_key = coach.get('name') or 'Koç yok'
        for bucket, key in ((by_class, class_key), (by_coach, coach_key)):
            item = bucket.setdefault(key, {
                'name': key,
                'students': 0,
                'absent_days': 0,
                'late_days': 0,
                'alarm': 0,
                'attention': 0,
                'today_absent': 0,
            })
            item['students'] += 1
            item['absent_days'] += summary.absent_days
            item['late_days'] += summary.late_days
            if severity == 'alarm':
                item['alarm'] += 1
            elif severity == 'attention':
                item['attention'] += 1
            if flags.is_absent_day:
                item['today_absent'] += 1

        row = {
            'student_id': summary.student_id,
            'student_name': summary.student_name,
            'sinif_name': klass.get('name') or '',
            'coach_name': coach.get('name') or '',
            'absent_days': summary.absent_days,
            'late_days': summary.late_days,
            'consecutive_absent': summary.consecutive_absent,
            'severity': severity,
            'threshold_label': label,
        }
        top_rows.append(row)
        if (
            setting.consecutive_absent_alarm
            and summary.consecutive_absent >= setting.consecutive_absent_alarm
        ):
            consecutive_rows.append(row)

        recent = sum(
            1 for day, day_flags in summary.days.items()
            if recent_start <= day <= on_date and day_flags.is_absent_day
        )
        previous = sum(
            1 for day, day_flags in summary.days.items()
            if prev_start <= day <= prev_end and day_flags.is_absent_day
        )
        if recent >= 2 and recent > previous:
            rising_rows.append({**row, 'recent_absent': recent, 'previous_absent': previous})

    def _sort_groups(items: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(items.values(), key=lambda x: (-x['absent_days'], -x['alarm'], x['name']))

    consecutive_rows.sort(key=lambda x: (-x['consecutive_absent'], -x['absent_days'], x['student_name']))
    rising_rows.sort(key=lambda x: (-x['recent_absent'], -x['absent_days'], x['student_name']))
    top_rows.sort(key=lambda x: (-x['absent_days'], -x['late_days'], x['student_name']))
    return {
        'date': on_date.isoformat(),
        'thresholds': serialize_thresholds(setting),
        'kpis': kpis,
        'by_class': _sort_groups(by_class),
        'by_coach': _sort_groups(by_coach),
        'consecutive': consecutive_rows[:30],
        'rising': rising_rows[:30],
        'top_absent': top_rows[:20],
    }
