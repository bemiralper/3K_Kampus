"""
Ders oturumu operasyon servisi — materialize, lifecycle, yoklama, ücret özeti.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Optional

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.academic.domain.lesson_attendance import (
    LessonAttendanceRecord,
    StudentAttendanceStatus,
    format_late_time,
    late_time_or_now,
)
from apps.academic.domain.lesson_session import (
    LessonSession,
    SessionKind,
    SessionStatus,
    TeacherAttendanceStatus,
)
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_change_log import (
    ScheduleChangeAction,
    ScheduleChangeLog,
)
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.placement_queries import active_student_placements
from apps.academic.domain.weekly_day import WeeklyDay
from apps.egitim_yili.domain.models import EgitimYili
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term


class LessonSessionError(Exception):
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(message)


def _active_year() -> EgitimYili:
    year = EgitimYili.objects.filter(aktif_mi=True).first()
    if not year:
        raise LessonSessionError('Aktif eğitim yılı bulunamadı.')
    return year


def log_schedule_change(
    *,
    action: str,
    summary: str,
    detail: Optional[dict] = None,
    term: Optional[Term] = None,
    schedule_version: Optional[ScheduleVersion] = None,
    lesson_session: Optional[LessonSession] = None,
    user=None,
) -> ScheduleChangeLog:
    year = _active_year()
    return ScheduleChangeLog.objects.create(
        egitim_yili=year,
        term=term or (schedule_version.term if schedule_version else None),
        schedule_version=schedule_version,
        lesson_session=lesson_session,
        action=action,
        summary=summary[:500],
        detail=detail or {},
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )


def _check_teacher_slot_conflict(
    *,
    ogretmen_id: int,
    session_date: date,
    start_time: time,
    end_time: time,
    exclude_id: Optional[int] = None,
) -> None:
    qs = LessonSession.objects.filter(
        is_active=True,
        ogretmen_id=ogretmen_id,
        session_date=session_date,
        status__in=[
            SessionStatus.SCHEDULED,
            SessionStatus.IN_PROGRESS,
            SessionStatus.COMPLETED,
        ],
    ).filter(
        Q(start_time__lt=end_time) & Q(end_time__gt=start_time)
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    # Also check substitute teaching that slot
    sub_qs = LessonSession.objects.filter(
        is_active=True,
        substitute_ogretmen_id=ogretmen_id,
        teacher_attendance=TeacherAttendanceStatus.SUBSTITUTE,
        session_date=session_date,
        status__in=[
            SessionStatus.SCHEDULED,
            SessionStatus.IN_PROGRESS,
            SessionStatus.COMPLETED,
        ],
    ).filter(Q(start_time__lt=end_time) & Q(end_time__gt=start_time))
    if exclude_id:
        sub_qs = sub_qs.exclude(pk=exclude_id)
    hit = qs.select_related('sinif', 'ders').first() or sub_qs.select_related('sinif', 'ders').first()
    if hit:
        sinif_ad = hit.sinif.ad if hit.sinif_id else 'özel'
        raise LessonSessionError(
            f'Öğretmen aynı saatte başka derste ({sinif_ad} · {hit.ders.ad}).',
            'ogretmen_id',
        )


def serialize_session(session: LessonSession) -> dict[str, Any]:
    teacher = session.effective_teacher
    return {
        'id': session.id,
        'session_date': session.session_date.isoformat(),
        'start_time': session.start_time.strftime('%H:%M') if session.start_time else None,
        'end_time': session.end_time.strftime('%H:%M') if session.end_time else None,
        'duration_minutes': session.resolved_duration_minutes(),
        'session_kind': session.session_kind,
        'session_kind_display': session.get_session_kind_display(),
        'status': session.status,
        'status_display': session.get_status_display(),
        'teacher_attendance': session.teacher_attendance,
        'teacher_attendance_display': session.get_teacher_attendance_display(),
        'payable': session.payable,
        'notes': session.notes,
        'cancel_reason': session.cancel_reason,
        'term_id': session.term_id,
        'schedule_version_id': session.schedule_version_id,
        'source_grid_cell_id': session.source_grid_cell_id,
        'class_lesson_plan_id': session.class_lesson_plan_id,
        'timeslot_id': session.timeslot_id,
        'timeslot_name': session.timeslot.name if session.timeslot_id else None,
        'weekly_day_id': session.weekly_day_id,
        'sinif': (
            {'id': session.sinif_id, 'name': session.sinif.ad}
            if session.sinif_id else None
        ),
        'ders': (
            {'id': session.ders_id, 'name': session.ders.ad}
            if session.ders_id else None
        ),
        'ogretmen': (
            {
                'id': session.ogretmen_id,
                'name': f'{session.ogretmen.ad} {session.ogretmen.soyad}'.strip(),
            }
            if session.ogretmen_id else None
        ),
        'effective_teacher': (
            {
                'id': teacher.id,
                'name': f'{teacher.ad} {teacher.soyad}'.strip(),
            }
            if teacher else None
        ),
        'substitute_ogretmen': (
            {
                'id': session.substitute_ogretmen_id,
                'name': f'{session.substitute_ogretmen.ad} {session.substitute_ogretmen.soyad}'.strip(),
            }
            if session.substitute_ogretmen_id else None
        ),
        'private_student': (
            {
                'id': session.private_student_id,
                'name': f'{session.private_student.ad} {session.private_student.soyad}'.strip(),
            }
            if session.private_student_id else None
        ),
        'replaces_session_id': session.replaces_session_id,
        'attendance_count': getattr(session, '_attendance_count', None),
        'created_at': session.created_at.isoformat() if session.created_at else None,
        'updated_at': session.updated_at.isoformat() if session.updated_at else None,
    }


@transaction.atomic
def materialize_sessions_for_date(
    *,
    term_id: int,
    session_date: date,
    version_id: Optional[int] = None,
    weekly_cycle_id: Optional[int] = None,
    classroom_id: Optional[int] = None,
    sube_id: Optional[int] = None,
    user=None,
) -> dict[str, Any]:
    """
    FILLED grid hücrelerinden o güne REGULAR oturum üret (idempotent).

    Program belirtilmezse dönemin **tüm** çalışma takvimleri işlenir: bir kurumda
    normal ve hafta sonu takvimi gibi birden fazla program olabiliyor ve tek
    programla üretim yapmak diğer takvimin derslerini eksik bırakıyordu.
    `weekly_cycle_id` verilirse yalnızca o takvimin programı işlenir.
    """
    try:
        term = Term.objects.get(pk=term_id)
    except Term.DoesNotExist:
        raise LessonSessionError('Dönem bulunamadı.', 'term_id')

    versions_qs = ScheduleVersion.objects.select_related(
        'weekly_cycle', 'schedule_template', 'term',
    )
    if version_id:
        versions = list(versions_qs.filter(pk=version_id))
        if not versions:
            raise LessonSessionError('Program bulunamadı.', 'version_id')
        if versions[0].term_id != term.id:
            raise LessonSessionError('Program seçili döneme ait değil.', 'version_id')
    else:
        versions = list(
            versions_qs.filter(
                term_id=term.id,
                weekly_cycle__isnull=False,
                **({'weekly_cycle_id': weekly_cycle_id} if weekly_cycle_id else {}),
            ).order_by('-is_active', 'weekly_cycle_id', '-id')
        )
        # Takvim başına tek program: aktif olan, yoksa en yenisi
        by_cycle: dict[int, ScheduleVersion] = {}
        for v in versions:
            by_cycle.setdefault(v.weekly_cycle_id, v)
        versions = list(by_cycle.values())
        if not versions:
            raise LessonSessionError('Bu dönem için program bulunamadı.', 'version_id')

    results = [
        _materialize_one_version(
            term=term,
            version=v,
            session_date=session_date,
            classroom_id=classroom_id,
            sube_id=sube_id,
            user=user,
        )
        for v in versions
    ]

    sessions: list[dict[str, Any]] = []
    for r in results:
        sessions.extend(r['sessions'])
    sessions.sort(
        key=lambda s: (s.get('start_time') or '', (s.get('sinif') or {}).get('name') or ''),
    )

    day_names = [r['day_name'] for r in results if r.get('day_name')]
    infos = [r['info'] for r in results if r.get('info')]
    return {
        'date': session_date.isoformat(),
        'day_name': day_names[0] if day_names else None,
        # Geriye uyumluluk: tek program beklendiği yerler için ilk program
        'version': {'id': versions[0].id, 'name': versions[0].name},
        'versions': [
            {
                'id': v.id,
                'name': v.name,
                'calendar_name': v.weekly_cycle.name if v.weekly_cycle_id else None,
            }
            for v in versions
        ],
        'created_count': sum(r['created_count'] for r in results),
        'existing_count': sum(r['existing_count'] for r in results),
        'skipped_count': sum(r['skipped_count'] for r in results),
        'info': ' '.join(infos) if infos and not sessions else None,
        'sessions': sessions,
    }


def _materialize_one_version(
    *,
    term: Term,
    version: ScheduleVersion,
    session_date: date,
    classroom_id: Optional[int],
    sube_id: Optional[int],
    user,
) -> dict[str, Any]:
    """Tek programın o güne ait hücrelerini oturuma çevirir."""
    year = _active_year()
    weekday = session_date.weekday()
    day = WeeklyDay.objects.filter(
        weekly_cycle=version.weekly_cycle,
        day_of_week=weekday,
        is_active=True,
    ).first()
    if not day:
        cycle_name = version.weekly_cycle.name if version.weekly_cycle_id else version.name
        return {
            'day_name': None,
            'created_count': 0,
            'existing_count': 0,
            'skipped_count': 0,
            'info': f'{cycle_name} takviminde bu gün aktif değil.',
            'sessions': [],
        }

    cells = ProgramGridCell.objects.filter(
        schedule_version=version,
        weekly_day=day,
        is_active=True,
        status=CellStatus.FILLED,
        ders__isnull=False,
        ogretmen__isnull=False,
        sinif__isnull=False,
    ).select_related('ders', 'ogretmen', 'sinif', 'timeslot', 'class_lesson_plan')

    if classroom_id:
        cells = cells.filter(sinif_id=classroom_id)
    if sube_id:
        cells = cells.filter(sinif__sube_id=sube_id)

    created = 0
    existing = 0
    skipped = 0
    session_ids = []

    for cell in cells.order_by('timeslot__order', 'sinif_id'):
        found = LessonSession.objects.filter(
            is_active=True,
            session_kind=SessionKind.REGULAR,
            schedule_version=version,
            session_date=session_date,
            timeslot_id=cell.timeslot_id,
            sinif_id=cell.sinif_id,
        ).first()
        if found:
            existing += 1
            session_ids.append(found.id)
            continue
        if not cell.timeslot_id or not cell.timeslot.start_time or not cell.timeslot.end_time:
            skipped += 1
            continue
        try:
            session = LessonSession.objects.create(
                egitim_yili=year,
                term=term,
                schedule_version=version,
                source_grid_cell=cell,
                class_lesson_plan_id=cell.class_lesson_plan_id,
                session_date=session_date,
                weekly_day=day,
                timeslot=cell.timeslot,
                start_time=cell.timeslot.start_time,
                end_time=cell.timeslot.end_time,
                sinif=cell.sinif,
                ders=cell.ders,
                ogretmen=cell.ogretmen,
                session_kind=SessionKind.REGULAR,
                status=SessionStatus.SCHEDULED,
                teacher_attendance=TeacherAttendanceStatus.PENDING,
                payable=True,
                created_by=user if getattr(user, 'is_authenticated', False) else None,
            )
            created += 1
            session_ids.append(session.id)
        except Exception:
            skipped += 1

    if created:
        log_schedule_change(
            action=ScheduleChangeAction.SESSION_CREATE,
            summary=f'{session_date.isoformat()} için {created} oturum üretildi',
            detail={'created': created, 'existing': existing, 'version_id': version.id},
            term=term,
            schedule_version=version,
            user=user,
        )

    sessions = list(
        LessonSession.objects.filter(id__in=session_ids)
        .select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
        )
        .order_by('start_time', 'sinif__ad')
    )
    return {
        'day_name': day.name,
        'created_count': created,
        'existing_count': existing,
        'skipped_count': skipped,
        'info': None,
        'sessions': [serialize_session(s) for s in sessions],
    }


def list_sessions(
    *,
    term_id: int,
    session_date: Optional[date] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    version_id: Optional[int] = None,
    classroom_id: Optional[int] = None,
    teacher_id: Optional[int] = None,
    session_kind: Optional[str] = None,
    status: Optional[str] = None,
    sube_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    qs = LessonSession.objects.filter(is_active=True, term_id=term_id).select_related(
        'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen', 'private_student',
    )
    if session_date:
        qs = qs.filter(session_date=session_date)
    if date_from:
        qs = qs.filter(session_date__gte=date_from)
    if date_to:
        qs = qs.filter(session_date__lte=date_to)
    if version_id:
        qs = qs.filter(schedule_version_id=version_id)
    if classroom_id:
        qs = qs.filter(sinif_id=classroom_id)
    if teacher_id:
        qs = qs.filter(
            Q(ogretmen_id=teacher_id)
            | Q(substitute_ogretmen_id=teacher_id, teacher_attendance=TeacherAttendanceStatus.SUBSTITUTE)
        )
    if session_kind:
        qs = qs.filter(session_kind=session_kind)
    if status:
        qs = qs.filter(status=status)
    if sube_id:
        qs = qs.filter(
            Q(sinif__sube_id=sube_id) | Q(sinif__isnull=True, term__sube_id=sube_id)
        )
    return [serialize_session(s) for s in qs.order_by('session_date', 'start_time', 'id')]


@transaction.atomic
def create_session(*, data: dict[str, Any], user=None) -> LessonSession:
    year = _active_year()
    try:
        term = Term.objects.get(pk=data['term_id'])
    except (KeyError, Term.DoesNotExist):
        raise LessonSessionError('Dönem zorunlu.', 'term_id')

    kind = data.get('session_kind') or SessionKind.EXTRA
    if kind not in SessionKind.values:
        raise LessonSessionError('Geçersiz oturum türü.', 'session_kind')

    try:
        session_date = date.fromisoformat(data['session_date'])
    except Exception:
        raise LessonSessionError('Geçerli tarih gerekli (YYYY-MM-DD).', 'session_date')

    try:
        from apps.academic.domain.timeslot import TimeSlot
        timeslot = TimeSlot.objects.get(pk=data['timeslot_id'], is_active=True)
    except Exception:
        raise LessonSessionError('Ders saati bulunamadı.', 'timeslot_id')

    try:
        from apps.egitim_tanimlari.models import Ders
        ders = Ders.objects.get(pk=data['ders_id'], aktif_mi=True)
    except Exception:
        raise LessonSessionError('Ders bulunamadı.', 'ders_id')

    try:
        ogretmen = Personel.objects.get(pk=data['ogretmen_id'], aktif_mi=True)
    except Exception:
        raise LessonSessionError('Öğretmen bulunamadı.', 'ogretmen_id')

    sinif = None
    if data.get('sinif_id'):
        try:
            sinif = Sinif.objects.get(pk=data['sinif_id'], aktif_mi=True)
        except Sinif.DoesNotExist:
            raise LessonSessionError('Sınıf bulunamadı.', 'sinif_id')

    if kind == SessionKind.PRIVATE and not data.get('private_student_id'):
        raise LessonSessionError('Özel ders için öğrenci seçin.', 'private_student_id')
    if kind != SessionKind.PRIVATE and not sinif:
        raise LessonSessionError('Sınıf seçimi zorunlu.', 'sinif_id')

    replaces = None
    if kind == SessionKind.MAKEUP:
        if not data.get('replaces_session_id'):
            raise LessonSessionError('Telafi için kaynak oturum seçin.', 'replaces_session_id')
        try:
            replaces = LessonSession.objects.get(pk=data['replaces_session_id'], is_active=True)
        except LessonSession.DoesNotExist:
            raise LessonSessionError('Telafi edilecek oturum bulunamadı.', 'replaces_session_id')

    start_time = timeslot.start_time
    end_time = timeslot.end_time
    if data.get('start_time'):
        start_time = time.fromisoformat(data['start_time'])
    if data.get('end_time'):
        end_time = time.fromisoformat(data['end_time'])

    _check_teacher_slot_conflict(
        ogretmen_id=ogretmen.id,
        session_date=session_date,
        start_time=start_time,
        end_time=end_time,
    )

    version = None
    if data.get('schedule_version_id'):
        version = ScheduleVersion.objects.filter(pk=data['schedule_version_id']).first()

    session = LessonSession.objects.create(
        egitim_yili=year,
        term=term,
        schedule_version=version,
        session_date=session_date,
        timeslot=timeslot,
        start_time=start_time,
        end_time=end_time,
        sinif=sinif,
        ders=ders,
        ogretmen=ogretmen,
        session_kind=kind,
        status=SessionStatus.SCHEDULED,
        private_student_id=data.get('private_student_id'),
        replaces_session=replaces,
        notes=data.get('notes') or '',
        payable=bool(data.get('payable', True)),
        duration_minutes=int(data.get('duration_minutes') or 0),
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )

    if replaces and replaces.status not in (SessionStatus.CANCELLED, SessionStatus.POSTPONED, SessionStatus.NO_SHOW):
        replaces.status = SessionStatus.POSTPONED
        replaces.save(update_fields=['status', 'updated_at'])

    log_schedule_change(
        action=ScheduleChangeAction.SESSION_CREATE,
        summary=f'{session.get_session_kind_display()} oluşturuldu · {session.session_date}',
        detail={'session_id': session.id, 'kind': kind},
        term=term,
        schedule_version=version,
        lesson_session=session,
        user=user,
    )
    return session


def transition_session(
    *,
    session_id: int,
    action: str,
    user=None,
    cancel_reason: str = '',
) -> LessonSession:
    try:
        session = LessonSession.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'term', 'schedule_version',
        ).get(pk=session_id, is_active=True)
    except LessonSession.DoesNotExist:
        raise LessonSessionError('Oturum bulunamadı.')

    action = action.lower()
    if action == 'start':
        if session.status != SessionStatus.SCHEDULED:
            raise LessonSessionError('Yalnızca planlı oturum başlatılabilir.')
        session.status = SessionStatus.IN_PROGRESS
        if session.teacher_attendance == TeacherAttendanceStatus.PENDING:
            session.teacher_attendance = TeacherAttendanceStatus.PRESENT
        session.save(update_fields=['status', 'teacher_attendance', 'updated_at'])
    elif action == 'complete':
        if session.status not in (SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS):
            raise LessonSessionError('Bu oturum tamamlanamaz.')
        session.status = SessionStatus.COMPLETED
        if session.teacher_attendance == TeacherAttendanceStatus.PENDING:
            session.teacher_attendance = TeacherAttendanceStatus.PRESENT
        session.save(update_fields=['status', 'teacher_attendance', 'updated_at'])
        log_schedule_change(
            action=ScheduleChangeAction.SESSION_COMPLETE,
            summary=f'Oturum tamamlandı · {session.session_date} {session.ders.ad}',
            term=session.term,
            schedule_version=session.schedule_version,
            lesson_session=session,
            user=user,
        )
    elif action == 'cancel':
        if session.status in (SessionStatus.COMPLETED, SessionStatus.CANCELLED):
            raise LessonSessionError('Bu oturum iptal edilemez.')
        session.status = SessionStatus.CANCELLED
        session.cancel_reason = cancel_reason or session.cancel_reason
        session.payable = False
        session.save(update_fields=['status', 'cancel_reason', 'payable', 'updated_at'])
        log_schedule_change(
            action=ScheduleChangeAction.SESSION_CANCEL,
            summary=f'Oturum iptal · {session.session_date} {session.ders.ad}',
            detail={'reason': session.cancel_reason},
            term=session.term,
            schedule_version=session.schedule_version,
            lesson_session=session,
            user=user,
        )
    elif action == 'no_show':
        session.status = SessionStatus.NO_SHOW
        session.teacher_attendance = TeacherAttendanceStatus.ABSENT
        session.payable = False
        session.save(update_fields=['status', 'teacher_attendance', 'payable', 'updated_at'])
    else:
        raise LessonSessionError('Geçersiz işlem.', 'action')

    return session


def set_teacher_attendance(
    *,
    session_id: int,
    status: str,
    substitute_ogretmen_id: Optional[int] = None,
    user=None,
) -> LessonSession:
    try:
        session = LessonSession.objects.select_related(
            'ders', 'ogretmen', 'sinif', 'timeslot', 'substitute_ogretmen',
        ).get(pk=session_id, is_active=True)
    except LessonSession.DoesNotExist:
        raise LessonSessionError('Oturum bulunamadı.')

    if status not in TeacherAttendanceStatus.values:
        raise LessonSessionError('Geçersiz öğretmen yoklama durumu.', 'status')

    if status == TeacherAttendanceStatus.SUBSTITUTE:
        if not substitute_ogretmen_id:
            raise LessonSessionError('Yedek öğretmen seçin.', 'substitute_ogretmen_id')
        try:
            sub = Personel.objects.get(pk=substitute_ogretmen_id, aktif_mi=True)
        except Personel.DoesNotExist:
            raise LessonSessionError('Yedek öğretmen bulunamadı.', 'substitute_ogretmen_id')
        _check_teacher_slot_conflict(
            ogretmen_id=sub.id,
            session_date=session.session_date,
            start_time=session.start_time,
            end_time=session.end_time,
            exclude_id=session.id,
        )
        session.substitute_ogretmen = sub
    else:
        session.substitute_ogretmen = None

    session.teacher_attendance = status
    if status == TeacherAttendanceStatus.ABSENT and session.status == SessionStatus.SCHEDULED:
        session.status = SessionStatus.NO_SHOW
        session.payable = False
    elif status == TeacherAttendanceStatus.PRESENT and session.status == SessionStatus.NO_SHOW:
        session.status = SessionStatus.SCHEDULED
        session.payable = True

    session.save(update_fields=[
        'teacher_attendance', 'substitute_ogretmen', 'status', 'payable', 'updated_at',
    ])
    return session


def get_or_build_student_roster(session: LessonSession) -> list[dict[str, Any]]:
    """Sınıf yerleşiminden yoklama listesi; mevcut kayıtları birleştir."""
    existing = {
        r.student_id: r
        for r in LessonAttendanceRecord.objects.filter(session=session).select_related('student')
    }
    rows: list[dict[str, Any]] = []

    if session.session_kind == SessionKind.PRIVATE and session.private_student_id:
        st = session.private_student
        students = [st] if st and getattr(st, 'aktif_mi', True) else []
    elif session.sinif_id:
        placements = active_student_placements(
            classroom_id=session.sinif_id,
            term_id=session.term_id,
        ).select_related('student').order_by('student__ad', 'student__soyad')
        students = [p.student for p in placements if p.student_id]
    else:
        students = []

    for st in students:
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
            'late_time': format_late_time(rec.late_time) if rec else None,
            'record_id': rec.id if rec else None,
        })
    return rows


@transaction.atomic
def save_student_attendance(
    *,
    session_id: int,
    records: list[dict[str, Any]],
    user=None,
) -> list[dict[str, Any]]:
    try:
        session = LessonSession.objects.get(pk=session_id, is_active=True)
    except LessonSession.DoesNotExist:
        raise LessonSessionError('Oturum bulunamadı.')

    if session.status == SessionStatus.CANCELLED:
        raise LessonSessionError('İptal oturuma yoklama girilemez.')

    for item in records:
        sid = item.get('student_id')
        status = item.get('status') or StudentAttendanceStatus.PRESENT
        if status not in StudentAttendanceStatus.values:
            raise LessonSessionError(f'Geçersiz yoklama durumu: {status}', 'status')
        if not sid:
            continue
        late_time = None
        if status == StudentAttendanceStatus.LATE:
            late_time = late_time_or_now(item.get('late_time'))
        LessonAttendanceRecord.objects.update_or_create(
            session=session,
            student_id=sid,
            defaults={
                'status': status,
                'note': item.get('note') or '',
                'late_time': late_time,
                'marked_by': user if getattr(user, 'is_authenticated', False) else None,
            },
        )

    if session.status == SessionStatus.SCHEDULED:
        session.status = SessionStatus.IN_PROGRESS
        session.save(update_fields=['status', 'updated_at'])

    return get_or_build_student_roster(session)


def pay_summary(
    *,
    term_id: int,
    date_from: date,
    date_to: date,
    teacher_id: Optional[int] = None,
    sube_id: Optional[int] = None,
) -> dict[str, Any]:
    qs = LessonSession.objects.filter(
        is_active=True,
        term_id=term_id,
        session_date__gte=date_from,
        session_date__lte=date_to,
        status=SessionStatus.COMPLETED,
        payable=True,
    ).select_related('ogretmen', 'substitute_ogretmen', 'ders', 'sinif')

    if teacher_id:
        qs = qs.filter(
            Q(ogretmen_id=teacher_id, teacher_attendance__in=[
                TeacherAttendanceStatus.PRESENT, TeacherAttendanceStatus.PENDING,
            ])
            | Q(
                substitute_ogretmen_id=teacher_id,
                teacher_attendance=TeacherAttendanceStatus.SUBSTITUTE,
            )
        )
    if sube_id:
        qs = qs.filter(Q(sinif__sube_id=sube_id) | Q(term__sube_id=sube_id))

    by_teacher: dict[int, dict[str, Any]] = {}
    for s in qs:
        teacher = s.effective_teacher
        if not teacher:
            continue
        bucket = by_teacher.setdefault(teacher.id, {
            'teacher_id': teacher.id,
            'teacher_name': f'{teacher.ad} {teacher.soyad}'.strip(),
            'session_count': 0,
            'total_minutes': 0,
            'by_kind': defaultdict(int),
            'sessions': [],
        })
        mins = s.resolved_duration_minutes()
        bucket['session_count'] += 1
        bucket['total_minutes'] += mins
        bucket['by_kind'][s.session_kind] += 1
        bucket['sessions'].append({
            'id': s.id,
            'date': s.session_date.isoformat(),
            'ders': s.ders.ad if s.ders_id else None,
            'sinif': s.sinif.ad if s.sinif_id else None,
            'kind': s.session_kind,
            'minutes': mins,
        })

    teachers = []
    for b in by_teacher.values():
        b['by_kind'] = dict(b['by_kind'])
        b['total_hours'] = round(b['total_minutes'] / 60, 2)
        # Sözleşme ücreti varsa bağla
        rate = None
        try:
            from apps.personel.domain.sozlesme_models import DersUcretTanim, PersonelSozlesme
            soz = (
                PersonelSozlesme.objects.filter(personel_id=b['teacher_id'])
                .order_by('-id')
                .first()
            )
            if soz:
                tanim = DersUcretTanim.objects.filter(sozlesme=soz).order_by('-id').first()
                if tanim is not None:
                    rate = float(tanim.birim_ucret)
        except Exception:
            rate = None
        b['unit_rate'] = rate
        b['estimated_amount'] = (
            float(round(Decimal(str(b['total_hours'])) * Decimal(str(rate)), 2))
            if rate is not None else None
        )
        teachers.append(b)

    teachers.sort(key=lambda x: x['teacher_name'])
    return {
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'term_id': term_id,
        'teachers': teachers,
        'totals': {
            'session_count': sum(t['session_count'] for t in teachers),
            'total_minutes': sum(t['total_minutes'] for t in teachers),
            'total_hours': round(sum(t['total_minutes'] for t in teachers) / 60, 2),
        },
    }


def list_change_logs(
    *,
    term_id: Optional[int] = None,
    version_id: Optional[int] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    qs = ScheduleChangeLog.objects.select_related(
        'schedule_version', 'schedule_version__weekly_cycle',
        'term', 'created_by', 'lesson_session',
    ).all()
    if term_id:
        qs = qs.filter(term_id=term_id)
    if version_id:
        qs = qs.filter(schedule_version_id=version_id)
    rows = []
    for log in qs[:limit]:
        rows.append({
            'id': log.id,
            'action': log.action,
            'action_display': log.get_action_display(),
            'summary': log.summary,
            'detail': log.detail,
            'term_id': log.term_id,
            'schedule_version_id': log.schedule_version_id,
            # Programın adı = çalışma takvimi; versiyon adı kullanıcıya gitmez.
            'calendar_name': (
                log.schedule_version.weekly_cycle.name
                if log.schedule_version_id and log.schedule_version.weekly_cycle_id
                else None
            ),
            'lesson_session_id': log.lesson_session_id,
            'created_at': log.created_at.isoformat() if log.created_at else None,
            'created_by': (
                log.created_by.get_username()
                if log.created_by_id else None
            ),
        })
    return rows
