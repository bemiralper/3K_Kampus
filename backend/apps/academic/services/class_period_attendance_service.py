"""
Günlük sınıf yoklama — sabah / öğleden sonra periyot tespiti ve roster.
"""
from __future__ import annotations

from datetime import date, time
from typing import Any, Optional

from django.db import transaction
from django.db.models import Count

from apps.academic.domain.class_period_attendance import (
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import (
    StudentAttendanceStatus,
    format_late_time,
    late_time_or_now,
)
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.placement_queries import active_student_placements
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_day import WeeklyDay
from apps.academic.services.lesson_session_service import LessonSessionError, _active_year
from apps.sinif.domain.models import Sinif
from apps.term.domain.models import Term

NOON = time(12, 0)


def _resolve_version(
    term_id: int,
    version_id: Optional[int],
    classroom_id: Optional[int] = None,
) -> ScheduleVersion:
    """
    Sınıfın günlük yoklamasında kullanılacak programı bulur.

    Program belirtilmezse önce **sınıfın kendi programı** aranır: bir kurumda
    normal ve hafta sonu gibi birden fazla çalışma takvimi olabiliyor ve dönemin
    aktif programına bakmak, başka takvimdeki sınıflar için "bu gün ders yok"
    sonucu veriyordu. Sınıfa ait program yoksa dönemin aktif programına düşer.
    """
    qs = ScheduleVersion.objects.select_related('weekly_cycle', 'schedule_template', 'term')
    if version_id:
        version = qs.get(pk=version_id)
    else:
        version = None
        if classroom_id:
            version = (
                qs.filter(
                    term_id=term_id,
                    weekly_cycle__isnull=False,
                    grid_cells__sinif_id=classroom_id,
                    grid_cells__is_active=True,
                    grid_cells__status=CellStatus.FILLED,
                )
                .order_by('-is_active', '-id')
                .first()
            )
        if not version:
            active = ScheduleVersion.get_active_for_term(term_id=term_id)
            if not active:
                raise LessonSessionError('Bu dönem için program bulunamadı.', 'version_id')
            version = qs.get(pk=active.id)
    if version.term_id != term_id:
        raise LessonSessionError('Program seçili döneme ait değil.', 'version_id')
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
    version = _resolve_version(term_id, version_id, classroom_id)
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

    version = _resolve_version(term_id, version_id, classroom_id)
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
    taken = ClassPeriodAttendanceRecord.objects.filter(session=session).exists()
    return {
        'id': session.id,
        'term_id': session.term_id,
        'sinif_id': session.sinif_id,
        'sinif_name': getattr(session.sinif, 'ad', '') if session.sinif_id else '',
        'session_date': session.session_date.isoformat(),
        'period': session.period,
        'period_label': session.period_label,
        'schedule_version_id': session.schedule_version_id,
        'taken': taken,
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

    from apps.academic.services.kutuphane_izin import virtual_izin_status

    rows: list[dict[str, Any]] = []
    for p in placements:
        st = p.student
        if not st or not st.aktif_mi:
            continue
        rec = existing.get(st.id)
        izin_fields = virtual_izin_status(
            ogrenci_id=st.id,
            tarih=session.session_date,
            periyot_kodu=session.period,
            rec=rec,
        )
        rows.append({
            'student_id': st.id,
            'student_name': f'{st.ad} {st.soyad}'.strip(),
            'status': izin_fields['status'],
            'status_display': izin_fields['status_display'],
            'note': rec.note if rec else izin_fields['note'],
            'late_time': format_late_time(rec.late_time) if rec else None,
            'record_id': rec.id if rec else None,
            'izinli_mi': izin_fields['izinli_mi'],
            'izin_sebep': izin_fields['izin_sebep'],
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
        late_time = None
        if status == StudentAttendanceStatus.LATE:
            late_time = late_time_or_now(item.get('late_time'))
        from apps.academic.services.kutuphane_izin import apply_izin_badge_on_save

        defaults = apply_izin_badge_on_save(
            student_id=sid,
            session_date=session.session_date,
            periyot_kodu=session.period,
            status=status,
            defaults={
                'status': status,
                'note': item.get('note') or '',
                'late_time': late_time,
                'marked_by': user if getattr(user, 'is_authenticated', False) else None,
            },
        )
        ClassPeriodAttendanceRecord.objects.update_or_create(
            session=session,
            student_id=sid,
            defaults=defaults,
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


def _classroom_attendance_snapshot(
    *,
    classroom_id: int,
    term_id: int | None,
    session_date: date,
    taken_keys: set[tuple[int, str]],
) -> dict[str, Any]:
    periods: list[dict[str, Any]] = []
    if term_id:
        try:
            available = periods_available_for_date(
                term_id=term_id,
                session_date=session_date,
                classroom_id=classroom_id,
            )
        except LessonSessionError:
            available = []
        except Exception:
            available = []
        for row in available:
            periods.append({
                'period': row['period'],
                'period_label': row['period_label'],
                'has_lessons': True,
                'taken': (classroom_id, row['period']) in taken_keys,
            })
    if not periods:
        state = 'no_lesson'
    elif all(item['taken'] for item in periods):
        state = 'done'
    elif any(item['taken'] for item in periods):
        state = 'partial'
    else:
        state = 'pending'
    return {'periods': periods, 'attendance_state': state}


def build_coach_period_attendance_context(
    *,
    user,
    kurum_id: int,
    sube_id: int,
    session_date: date | None = None,
) -> dict[str, Any]:
    """Koç portalı: yalnızca aktif eğitim yılı sınıfları + günün yoklama durumu."""
    from apps.academic.services.active_academic_year import get_active_academic_year
    from apps.coaching.services.coach_access import scoped_student_ids
    from apps.sinif.domain.models import Sinif
    from apps.term.domain.models import Term

    year = get_active_academic_year()
    terms = list(Term.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=year,
    ).order_by('order_no', 'start_date'))
    term_ids = [t.id for t in terms]
    active_term = next((t for t in terms if t.is_active), terms[0] if terms else None)

    student_ids = scoped_student_ids(user)
    placement_qs = active_student_placements(academic_year=year)
    if term_ids:
        placement_qs = placement_qs.filter(term_id__in=term_ids)
    if student_ids is not None:
        if not student_ids:
            placement_qs = placement_qs.none()
        else:
            placement_qs = placement_qs.filter(student_id__in=student_ids)

    placed_ids = list(placement_qs.values_list('classroom_id', flat=True).distinct())
    counts = dict(
        placement_qs.values('classroom_id').annotate(
            n=Count('student_id', distinct=True),
        ).values_list('classroom_id', 'n')
    )
    placement_terms: dict[int, int] = {}
    for classroom_id, term_id in placement_qs.values_list('classroom_id', 'term_id').distinct():
        current = placement_terms.get(classroom_id)
        if current is None or (active_term and term_id == active_term.id):
            placement_terms[classroom_id] = term_id
    term_names = {t.id: t.name for t in terms}

    classroom_qs = Sinif.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=year,
        aktif_mi=True,
    ).select_related('term', 'sinif_seviyesi')
    if student_ids is not None:
        classroom_qs = classroom_qs.filter(id__in=placed_ids)

    day = session_date or date.today()
    classrooms = list(classroom_qs.order_by('sinif_seviyesi__ad', 'ad'))
    taken_keys: set[tuple[int, str]] = set(
        ClassPeriodAttendanceRecord.objects.filter(
            session__is_active=True,
            session__session_date=day,
            session__sinif_id__in=[s.id for s in classrooms],
        ).values_list('session__sinif_id', 'session__period')
    )

    classroom_rows = []
    for s in classrooms:
        term_id = s.term_id or placement_terms.get(s.id) or (active_term.id if active_term else None)
        snap = _classroom_attendance_snapshot(
            classroom_id=s.id,
            term_id=term_id,
            session_date=day,
            taken_keys=taken_keys,
        )
        classroom_rows.append({
            'id': s.id,
            'ad': s.ad,
            'kod': s.kod or '',
            'ogrenci_sayisi': counts.get(s.id, 0),
            'term_id': term_id,
            'term_name': (
                s.term.name if s.term_id and s.term
                else term_names.get(term_id, active_term.name if active_term else '')
            ),
            'seviye': s.sinif_seviyesi.ad if s.sinif_seviyesi_id else '',
            'attendance_state': snap['attendance_state'],
            'periods': snap['periods'],
        })

    term_rows = [{
        'id': t.id,
        'name': t.name,
        'code': t.code,
        'is_active': t.is_active,
        'order_no': t.order_no,
    } for t in terms]
    return {
        'active_year': {
            'id': year.id,
            'yil_str': str(year),
        },
        'terms': term_rows,
        'active_term_id': active_term.id if active_term else None,
        'date': day.isoformat(),
        'classrooms': classroom_rows,
    }


def build_coach_period_day_roster(
    *,
    user,
    kurum_id: int,
    sube_id: int,
    session_date: date | None = None,
) -> dict[str, Any]:
    """Seçilen günde koçun sınıflarındaki tüm öğrenci yoklama durumları."""
    from apps.academic.services.active_academic_year import get_active_academic_year
    from apps.coaching.services.coach_access import scoped_student_ids
    from apps.sinif.domain.models import Sinif
    from apps.term.domain.models import Term

    year = get_active_academic_year()
    terms = list(Term.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=year,
    ).values_list('id', flat=True))
    student_ids = scoped_student_ids(user)
    placement_qs = active_student_placements(academic_year=year)
    if terms:
        placement_qs = placement_qs.filter(term_id__in=terms)
    if student_ids is not None:
        placement_qs = placement_qs.filter(student_id__in=student_ids) if student_ids else placement_qs.none()
    placed_ids = list(placement_qs.values_list('classroom_id', flat=True).distinct())

    classroom_qs = Sinif.objects.filter(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili=year,
        aktif_mi=True,
    )
    if student_ids is not None:
        classroom_qs = classroom_qs.filter(id__in=placed_ids)
    classroom_ids = list(classroom_qs.values_list('id', flat=True))

    day = session_date or date.today()
    records = ClassPeriodAttendanceRecord.objects.filter(
        session__is_active=True,
        session__session_date=day,
        session__sinif_id__in=classroom_ids,
    ).select_related('student', 'session', 'session__sinif')
    if student_ids is not None:
        records = records.filter(student_id__in=student_ids) if student_ids else records.none()

    status_counts = {
        StudentAttendanceStatus.PRESENT: 0,
        StudentAttendanceStatus.LATE: 0,
        StudentAttendanceStatus.ABSENT: 0,
        StudentAttendanceStatus.EXCUSED: 0,
    }
    rows: list[dict[str, Any]] = []
    classrooms: dict[int, str] = {}
    for rec in records.order_by(
        'session__sinif__ad', 'session__period', 'student__ad', 'student__soyad',
    ):
        status = rec.status
        if status in status_counts:
            status_counts[status] += 1
        sinif = rec.session.sinif
        classrooms[sinif.id] = sinif.ad
        student = rec.student
        rows.append({
            'record_id': rec.id,
            'student_id': rec.student_id,
            'student_name': f'{student.ad} {student.soyad}'.strip() if student else '',
            'classroom_id': rec.session.sinif_id,
            'classroom_ad': sinif.ad if sinif else '',
            'period': rec.session.period,
            'period_label': rec.session.period_label,
            'status': status,
            'status_display': rec.get_status_display(),
            'late_time': format_late_time(rec.late_time),
            'note': rec.note or '',
            'izinli_mi': rec.izinli_mi,
        })

    return {
        'date': day.isoformat(),
        'rows': rows,
        'counts': {
            'present': status_counts[StudentAttendanceStatus.PRESENT],
            'late': status_counts[StudentAttendanceStatus.LATE],
            'absent': status_counts[StudentAttendanceStatus.ABSENT],
            'excused': status_counts[StudentAttendanceStatus.EXCUSED],
            'total': len(rows),
        },
        'classrooms': [
            {'id': cid, 'ad': ad}
            for cid, ad in sorted(classrooms.items(), key=lambda item: item[1])
        ],
    }


def export_coach_period_day_roster(
    *,
    user,
    kurum_id: int,
    sube_id: int,
    session_date: date | None = None,
    fmt: str = 'xlsx',
    statuses: list[str] | None = None,
    classroom_ids: list[int] | None = None,
    period: str | None = None,
):
    """Kurumsal Excel/CSV — durum listesi."""
    from apps.kurum.domain.models import Kurum
    from apps.sube.domain.models import Sube
    from shared.export import CsvExportService, ExcelExportService
    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    data = build_coach_period_day_roster(
        user=user,
        kurum_id=kurum_id,
        sube_id=sube_id,
        session_date=session_date,
    )
    wanted_status = {s.upper() for s in (statuses or []) if s}
    wanted_classes = {int(i) for i in (classroom_ids or []) if i}
    wanted_period = (period or '').upper()
    rows = []
    for row in data['rows']:
        if wanted_status and row['status'] not in wanted_status:
            continue
        if wanted_classes and row['classroom_id'] not in wanted_classes:
            continue
        if wanted_period in {'MORNING', 'AFTERNOON'} and row['period'] != wanted_period:
            continue
        rows.append(row)

    day = data['date']
    status_labels = {
        StudentAttendanceStatus.PRESENT: 'Var',
        StudentAttendanceStatus.LATE: 'Geç',
        StudentAttendanceStatus.ABSENT: 'Yok',
        StudentAttendanceStatus.EXCUSED: 'İzinli',
    }
    counts = {key: 0 for key in status_labels}
    for row in rows:
        if row['status'] in counts:
            counts[row['status']] += 1

    kurum = Kurum.objects.filter(id=kurum_id).first()
    sube = Sube.objects.filter(id=sube_id).first()
    from apps.academic.services.active_academic_year import get_active_academic_year
    active_year = get_active_academic_year()
    meta = ReportMeta(
        report_title=f'SINIF YOKLAMASI — {day}',
        kurum_ad=getattr(kurum, 'ad', '') or '',
        sube_ad=getattr(sube, 'ad', '') or '',
        egitim_yili=str(active_year) if active_year else '',
        generated_by=(
            getattr(user, 'get_full_name', lambda: '')() or getattr(user, 'username', '') or ''
        ),
    )
    columns = [
        ExportColumn(key='classroom_ad', label='Sınıf', width=22),
        ExportColumn(key='period_label', label='Periyot', width=16),
        ExportColumn(key='student_name', label='Öğrenci', width=28),
        ExportColumn(key='status_display', label='Durum', width=12),
        ExportColumn(key='late_time', label='Saat', width=10),
        ExportColumn(key='note', label='Not', width=32, wrap=True),
    ]
    stats = [
        ExportStat(label='Toplam', value=len(rows), type='integer'),
        ExportStat(label='Var', value=counts[StudentAttendanceStatus.PRESENT], type='integer'),
        ExportStat(label='Geç', value=counts[StudentAttendanceStatus.LATE], type='integer'),
        ExportStat(label='Yok', value=counts[StudentAttendanceStatus.ABSENT], type='integer'),
        ExportStat(label='İzinli', value=counts[StudentAttendanceStatus.EXCUSED], type='integer'),
    ]
    filename = f'sinif_yoklama_{day.replace("-", "")}'
    if fmt == 'csv':
        return CsvExportService.export(rows, columns, meta=meta, filename=filename)
    return ExcelExportService.export(
        rows,
        columns,
        meta=meta,
        stats=stats,
        orientation='landscape',
        sheet_name='Yoklama',
        filename=filename,
    )
