"""
Günlük sınıf yoklama — sabah / öğleden sonra periyot tespiti ve roster.
"""
from __future__ import annotations

from datetime import date, time
from typing import Any, Optional

from django.db import transaction

from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.placement_queries import active_student_placements
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_day import WeeklyDay
from apps.academic.services.lesson_session_service import LessonSessionError, _active_year
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term

NOON = time(12, 0)


def _resolve_version(term_id: int, version_id: Optional[int]) -> ScheduleVersion:
    if version_id:
        version = ScheduleVersion.objects.select_related(
            'weekly_cycle', 'schedule_template', 'term',
        ).get(pk=version_id)
    else:
        active = ScheduleVersion.get_active_for_term(term_id=term_id)
        if not active:
            raise LessonSessionError('Aktif program versiyonu bulunamadı.', 'version_id')
        version = ScheduleVersion.objects.select_related(
            'weekly_cycle', 'schedule_template', 'term',
        ).get(pk=active.id)
    if version.term_id != term_id:
        raise LessonSessionError('Versiyon seçili döneme ait değil.', 'version_id')
    return version


def lunch_split_time(schedule_template_id: int | None) -> time | None:
    """Şablondaki ilk LUNCH_BREAK başlangıcı; yoksa None."""
    if not schedule_template_id:
        return None
    slot = (
        TimeSlot.objects.filter(
            schedule_template_id=schedule_template_id,
            slot_type=SlotType.LUNCH_BREAK,
            is_active=True,
        )
        .order_by('order', 'start_time')
        .first()
    )
    return slot.start_time if slot and slot.start_time else None


def classify_period(start: time, *, lunch_start: time | None) -> str:
    """Ders başlangıcına göre MORNING / AFTERNOON."""
    boundary = lunch_start or NOON
    if start < boundary:
        return ClassPeriodCode.MORNING
    return ClassPeriodCode.AFTERNOON


def periods_available_for_date(
    *,
    term_id: int,
    session_date: date,
    classroom_id: int,
    version_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    """O gün sınıfta ders olan periyotları döner (oturum yoksa da planlanır)."""
    version = _resolve_version(term_id, version_id)
    weekday = session_date.weekday()
    day = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        day_of_week=weekday,
        is_active=True,
    ).first()
    if not day:
        return []

    lunch = lunch_split_time(version.schedule_template_id)
    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        weekly_day=day,
        is_active=True,
        status=CellStatus.FILLED,
        sinif_id=classroom_id,
        ders__isnull=False,
        timeslot__isnull=False,
    ).select_related('timeslot')

    present: set[str] = set()
    for cell in cells:
        st = getattr(cell.timeslot, 'start_time', None)
        if not st:
            continue
        present.add(classify_period(st, lunch_start=lunch))

    # Ders yoksa tabloya hiç bakma — boş liste + bilgilendirme UI tarafında
    if not present:
        return []

    existing = {
        s.period: s
        for s in ClassPeriodAttendanceSession.objects.filter(
            is_active=True,
            sinif_id=classroom_id,
            session_date=session_date,
            period__in=list(present),
        )
    }

    order = [ClassPeriodCode.MORNING, ClassPeriodCode.AFTERNOON]
    rows = []
    for code in order:
        if code not in present:
            continue
        sess = existing.get(code)
        rows.append({
            'period': code,
            'period_label': dict(ClassPeriodCode.choices)[code],
            'session_id': sess.id if sess else None,
            'has_lessons': True,
        })
    return rows


@transaction.atomic
def ensure_period_session(
    *,
    term_id: int,
    session_date: date,
    classroom_id: int,
    period: str,
    version_id: Optional[int] = None,
    user=None,
) -> ClassPeriodAttendanceSession:
    if period not in ClassPeriodCode.values:
        raise LessonSessionError('Geçersiz periyot.', 'period')

    available = periods_available_for_date(
        term_id=term_id,
        session_date=session_date,
        classroom_id=classroom_id,
        version_id=version_id,
    )
    if not any(r['period'] == period for r in available):
        raise LessonSessionError(
            'Bu gün/sınıf için seçilen periyotta ders yok.',
            'period',
        )

    year = _active_year()
    try:
        term = Term.objects.get(pk=term_id)
        sinif = Sinif.objects.get(pk=classroom_id)
    except (Term.DoesNotExist, Sinif.DoesNotExist) as exc:
        raise LessonSessionError('Dönem veya sınıf bulunamadı.') from exc

    version = _resolve_version(term_id, version_id)
    session, _ = ClassPeriodAttendanceSession.objects.get_or_create(
        sinif=sinif,
        session_date=session_date,
        period=period,
        is_active=True,
        defaults={
            'egitim_yili': year,
            'term': term,
            'schedule_version': version,
            'created_by': user if getattr(user, 'is_authenticated', False) else None,
        },
    )
    return session


def serialize_period_session(session: ClassPeriodAttendanceSession) -> dict[str, Any]:
    return {
        'id': session.id,
        'term_id': session.term_id,
        'sinif_id': session.sinif_id,
        'sinif_name': getattr(session.sinif, 'ad', '') if session.sinif_id else '',
        'session_date': session.session_date.isoformat(),
        'period': session.period,
        'period_label': session.period_label,
        'schedule_version_id': session.schedule_version_id,
    }


def get_or_build_period_roster(session: ClassPeriodAttendanceSession) -> list[dict[str, Any]]:
    existing = {
        r.student_id: r
        for r in ClassPeriodAttendanceRecord.objects.filter(session=session).select_related('student')
    }
    placements = active_student_placements(
        classroom_id=session.sinif_id,
        term_id=session.term_id,
    ).select_related('student').order_by('student__ad', 'student__soyad')

    rows: list[dict[str, Any]] = []
    for p in placements:
        st = p.student
        if not st or not st.aktif_mi:
            continue
        rec = existing.get(st.id)
        rows.append({
            'student_id': st.id,
            'student_name': f'{st.ad} {st.soyad}'.strip(),
            'status': rec.status if rec else StudentAttendanceStatus.PRESENT,
            'status_display': (
                rec.get_status_display() if rec
                else dict(StudentAttendanceStatus.choices)[StudentAttendanceStatus.PRESENT]
            ),
            'note': rec.note if rec else '',
            'record_id': rec.id if rec else None,
        })
    return rows


@transaction.atomic
def save_period_attendance(
    *,
    session_id: int,
    records: list[dict[str, Any]],
    user=None,
) -> list[dict[str, Any]]:
    try:
        session = ClassPeriodAttendanceSession.objects.select_related('sinif').get(
            pk=session_id, is_active=True,
        )
    except ClassPeriodAttendanceSession.DoesNotExist as exc:
        raise LessonSessionError('Günlük yoklama oturumu bulunamadı.') from exc

    for item in records:
        sid = item.get('student_id')
        status = item.get('status') or StudentAttendanceStatus.PRESENT
        if status not in StudentAttendanceStatus.values:
            raise LessonSessionError(f'Geçersiz yoklama durumu: {status}', 'status')
        if not sid:
            continue
        ClassPeriodAttendanceRecord.objects.update_or_create(
            session=session,
            student_id=sid,
            defaults={
                'status': status,
                'note': item.get('note') or '',
                'marked_by': user if getattr(user, 'is_authenticated', False) else None,
            },
        )
    return get_or_build_period_roster(session)


def list_period_sessions_for_date(
    *,
    term_id: int,
    session_date: date,
    classroom_id: int,
    version_id: Optional[int] = None,
    user=None,
    ensure: bool = True,
) -> dict[str, Any]:
    """Mevcut/üretilmiş periyot oturumlarını listeler."""
    available = periods_available_for_date(
        term_id=term_id,
        session_date=session_date,
        classroom_id=classroom_id,
        version_id=version_id,
    )
    sessions = []
    for row in available:
        if ensure:
            sess = ensure_period_session(
                term_id=term_id,
                session_date=session_date,
                classroom_id=classroom_id,
                period=row['period'],
                version_id=version_id,
                user=user,
            )
            sessions.append(serialize_period_session(sess))
        else:
            sessions.append({
                **row,
                'id': row.get('session_id'),
            })
    info = ''
    if not available:
        info = (
            'Bu sınıfın seçilen günde programda dersi yok. '
            'Günlük yoklama yalnızca sabah ve/veya öğleden sonra dersi olan günlerde açılır.'
        )
    return {
        'date': session_date.isoformat(),
        'classroom_id': classroom_id,
        'periods': available,
        'sessions': sessions,
        'info': info,
        'yoklama_kapali': not available,
    }
