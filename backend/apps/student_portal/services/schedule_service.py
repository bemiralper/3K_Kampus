"""
Öğrenci Portalı — Birleşik Takvim, Dersler, İşlenen Konular, Drive Ders Notları,
Kaynak Kitaplar, Kampüs Masa/Dolap ve Devamsızlık Servisi.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.class_period_attendance import ClassPeriodAttendanceRecord
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant
from apps.egitim_tanimlari.display import resolve_ders_display_name
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    AttendanceRecord,
    AttendanceStatus,
    LockerAssignment,
    SeatAssignment,
)
from apps.mobile_identity.drive import DriveError, fetch_file
from apps.mobile_identity.models import DersNotu, IslenenKonu
from apps.mobile_identity.teacher_notes import MAX_PREVIEW_PAGES, render_pages
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    OturumDurumu,
    ProgramDurumu,
)
from apps.student_resources.models import StudentResourceAssignment
from apps.takvim.domain.enums import EventCategory, EventStatus
from apps.takvim.domain.models import Event

from ..auth import ISTANBUL, StudentPortalError

_SUBJECT_PALETTE = (
    ('mat', '#2563eb', 'Matematik'),
    ('geo', '#3b82f6', 'Geometri'),
    ('turk', '#7c3aed', 'Türkçe'),
    ('edeb', '#8b5cf6', 'Edebiyat'),
    ('fiz', '#059669', 'Fizik'),
    ('kim', '#0d9488', 'Kimya'),
    ('biyo', '#16a34a', 'Biyoloji'),
    ('fen', '#10b981', 'Fen'),
    ('tar', '#d97706', 'Tarih'),
    ('cog', '#ea580c', 'Coğrafya'),
    ('fel', '#ca8a04', 'Felsefe'),
    ('sos', '#f59e0b', 'Sosyal'),
    ('ing', '#e11d48', 'İngilizce'),
    ('din', '#0284c7', 'DKAB'),
)

_NOTE_PREVIEW_CACHE: dict[str, tuple[float, list[dict]]] = {}


def subject_color(name: str | None) -> str:
    lower = (name or '').strip().lower()
    lower = (
        lower.replace('ı', 'i')
        .replace('ğ', 'g')
        .replace('ü', 'u')
        .replace('ş', 's')
        .replace('ö', 'o')
        .replace('ç', 'c')
    )
    for token, hex_code, _label in _SUBJECT_PALETTE:
        if token in lower:
            return hex_code
    return '#0262a7'


def resolve_student_classroom(scope: dict):
    """Öğrencinin aktif dönem sınıf yerleşimini döndürür (yoksa yıllık kayıttaki sınıf)."""
    term = scope['term']
    kayit = scope['kayit']
    ogrenci = scope['ogrenci']

    if term is not None:
        placement = (
            StudentClassPlacement.objects.select_related('classroom', 'group')
            .filter(
                academic_year_id=kayit.egitim_yili_id,
                term_id=term.id,
                student_id=ogrenci.id,
                is_active=True,
            )
            .first()
        )
        if placement is not None and placement.classroom_id:
            return placement.classroom, placement.group

    return kayit.sinif, None


def _active_class_plans_qs(scope: dict):
    classroom, _group = resolve_student_classroom(scope)
    if classroom is None:
        return ClassLessonPlan.objects.none()
    qs = ClassLessonPlan.objects.select_related('ders', 'sinif', 'ogretmen', 'term').filter(
        is_active=True,
        egitim_yili_id=scope['egitim_yili_id'],
        sinif_id=classroom.id,
        term__kurum_id=scope['kurum_id'],
        term__sube_id=scope['sube_id'],
    )
    if scope['term'] is not None:
        qs = qs.filter(term_id=scope['term'].id)
    return qs


def _format_time(t: time | None) -> str:
    if t is None:
        return ''
    return t.strftime('%H:%M')


def _live_state(day: date, start_str: str, end_str: str, now_dt: datetime) -> str:
    today = now_dt.date()
    if day < today:
        return 'past'
    if day > today:
        return 'upcoming'
    now_hm = now_dt.strftime('%H:%M')
    if end_str and end_str <= now_hm:
        return 'past'
    if start_str and start_str <= now_hm and (not end_str or now_hm < end_str):
        return 'live'
    return 'upcoming'


def build_unified_schedule(scope: dict, start_date: date, end_date: date) -> dict:
    """
    Grup dersleri, özel dersler, sınav oturumları ve resmi tatilleri/etkinlikleri
    tek bir gün bazlı kronolojik zaman çizelgesinde birleştirir.
    """
    if end_date < start_date:
        raise StudentPortalError('validation_error', 'Bitiş tarihi başlangıçtan önce olamaz.', 400)
    if (end_date - start_date).days > 45:
        raise StudentPortalError('validation_error', 'Takvim aralığı en fazla 45 gün olabilir.', 400)

    now_dt = timezone.localtime(timezone.now(), ISTANBUL)
    ogrenci = scope['ogrenci']
    classroom, group = resolve_student_classroom(scope)

    days_map: dict[date, list[dict]] = {}
    cursor = start_date
    while cursor <= end_date:
        days_map[cursor] = []
        cursor += timedelta(days=1)

    # 1. İşlenen konu kayıtlarını (plan_id, session_date) bazında önden çek
    topics_by_plan_date: dict[tuple[int, date], list[str]] = {}
    if classroom is not None:
        topic_rows = (
            IslenenKonu.objects.select_related('topic')
            .filter(
                kurum_id=scope['kurum_id'],
                sube_id=scope['sube_id'],
                egitim_yili_id=scope['egitim_yili_id'],
                class_lesson_plan__sinif_id=classroom.id,
                session_date__gte=start_date,
                session_date__lte=end_date,
            )
            .order_by('id')
        )
        for tr in topic_rows:
            label = (tr.topic.name if tr.topic else '') or (tr.note or '').strip()
            if label:
                topics_by_plan_date.setdefault((tr.class_lesson_plan_id, tr.session_date), []).append(label)

    # 2. Grup Dersleri (ProgramGridCell — aktif ScheduleVersion)
    grid_by_weekday: dict[int, list[ProgramGridCell]] = {}
    if classroom is not None and scope['term'] is not None:
        active_ver = (
            ScheduleVersion.objects.filter(
                egitim_yili_id=scope['egitim_yili_id'],
                term_id=scope['term'].id,
                is_active=True,
            )
            .order_by('-id')
            .first()
        )
        cells_qs = ProgramGridCell.objects.select_related(
            'weekly_day', 'timeslot', 'ders', 'ogretmen', 'class_lesson_plan', 'sinif',
        ).filter(
            sinif_id=classroom.id,
            is_active=True,
            status__in=[CellStatus.FILLED, CellStatus.EXAM],
        )
        if active_ver is not None:
            cells_qs = cells_qs.filter(schedule_version_id=active_ver.id)
        else:
            cells_qs = cells_qs.filter(class_lesson_plan__term_id=scope['term'].id)

        for cell in cells_qs.order_by('weekly_day__day_of_week', 'timeslot__order'):
            wd = cell.weekly_day.day_of_week
            grid_by_weekday.setdefault(wd, []).append(cell)

    # 3. Resmi Tatiller ve Etkinlikler (Takvim Event)
    dt_start = datetime.combine(start_date, time.min, tzinfo=ISTANBUL)
    dt_end = datetime.combine(end_date, time.max, tzinfo=ISTANBUL)
    events_qs = (
        Event.objects.select_related('event_type')
        .filter(
            kurum_id=scope['kurum_id'],
            is_deleted=False,
            baslangic__lte=dt_end,
            bitis__gte=dt_start,
        )
        .exclude(durum=EventStatus.CANCELLED)
        .filter(Q(sube_id__isnull=True) | Q(sube_id=scope['sube_id']))
    )
    holiday_dates: set[date] = set()
    for ev in events_qs:
        cat = ev.event_type.kategori if ev.event_type else ''
        is_holiday = cat == EventCategory.TATIL
        is_for_student = (
            is_holiday
            or not (ev.sinif_ids or ev.ogrenci_ids)
            or (classroom and classroom.id in (ev.sinif_ids or []))
            or (ogrenci.id in (ev.ogrenci_ids or []))
        )
        if not is_for_student:
            continue
        ev_start_local = timezone.localtime(ev.baslangic, ISTANBUL)
        ev_end_local = timezone.localtime(ev.bitis, ISTANBUL)
        d_cur = max(start_date, ev_start_local.date())
        d_lim = min(end_date, ev_end_local.date())
        while d_cur <= d_lim:
            if is_holiday:
                holiday_dates.add(d_cur)
            days_map[d_cur].append({
                'id': f'event:{ev.id}:{d_cur.isoformat()}',
                'kind': 'holiday' if is_holiday else 'event',
                'kind_label': 'Resmi Tatil' if is_holiday else (ev.event_type.ad if ev.event_type else 'Etkinlik'),
                'title': ev.baslik,
                'subtitle': ev.aciklama[:140] if ev.aciklama else '',
                'start_time': '' if ev.tum_gun else ev_start_local.strftime('%H:%M'),
                'end_time': '' if ev.tum_gun else ev_end_local.strftime('%H:%M'),
                'all_day': bool(ev.tum_gun or is_holiday),
                'teacher_name': '',
                'location': ev.salon_adi or ev.konum or '',
                'color': '#ef4444' if is_holiday else (ev.renk or (ev.event_type.renk if ev.event_type else '#6366f1')),
                'state': _live_state(d_cur, '' if ev.tum_gun else ev_start_local.strftime('%H:%M'), '' if ev.tum_gun else ev_end_local.strftime('%H:%M'), now_dt),
                'plan_id': None,
                'topics': [],
            })
            d_cur += timedelta(days=1)

    # Grup derslerini tatil olmayan günlere yerleştir
    for day_key in list(days_map.keys()):
        if day_key in holiday_dates:
            continue
        cells = grid_by_weekday.get(day_key.weekday(), [])
        for cell in cells:
            ders_name = (
                resolve_ders_display_name(ders=cell.ders, plan=cell.class_lesson_plan)
                if cell.ders
                else 'Ders'
            )
            start_s = _format_time(cell.timeslot.start_time)
            end_s = _format_time(cell.timeslot.end_time)
            teacher_name = f'{cell.ogretmen.ad} {cell.ogretmen.soyad}'.strip() if cell.ogretmen else ''
            plan_topics = (
                topics_by_plan_date.get((cell.class_lesson_plan_id, day_key), [])
                if cell.class_lesson_plan_id
                else []
            )
            days_map[day_key].append({
                'id': f'grid:{cell.id}:{day_key.isoformat()}',
                'kind': 'group_lesson',
                'kind_label': 'Sınıf Dersi',
                'title': ders_name,
                'subtitle': cell.timeslot.name or '',
                'start_time': start_s,
                'end_time': end_s,
                'all_day': False,
                'teacher_name': teacher_name,
                'location': classroom.ad if classroom else '',
                'color': subject_color(ders_name),
                'state': _live_state(day_key, start_s, end_s, now_dt),
                'plan_id': cell.class_lesson_plan_id,
                'topics': plan_topics,
            })

    # 4. Özel Ders Oturumları + Haftalık Birebir Slotlar
    oturum_qs = (
        BirebirDersOturumu.objects.select_related('ders', 'ogretmen', 'oda')
        .filter(
            ogrenci_id=ogrenci.id,
            kurum_id=scope['kurum_id'],
            sube_id=scope['sube_id'],
            egitim_yili_id=scope['egitim_yili_id'],
            is_active=True,
            session_date__gte=start_date,
            session_date__lte=end_date,
        )
        .exclude(durum=OturumDurumu.IPTAL)
    )
    concrete_slot_dates: set[tuple[int | None, date]] = set()
    for ot in oturum_qs:
        concrete_slot_dates.add((ot.source_slot_id, ot.session_date))
        ders_name = resolve_ders_display_name(ders=ot.ders) if ot.ders else 'Özel Ders'
        start_s = _format_time(ot.start_time)
        end_s = _format_time(ot.end_time)
        days_map[ot.session_date].append({
            'id': f'private:{ot.id}',
            'kind': 'private_lesson',
            'kind_label': ot.get_oturum_turu_display(),
            'title': ders_name,
            'subtitle': ot.get_durum_display(),
            'start_time': start_s,
            'end_time': end_s,
            'all_day': False,
            'teacher_name': f'{ot.ogretmen.ad} {ot.ogretmen.soyad}'.strip() if ot.ogretmen else '',
            'location': ot.oda.ad if ot.oda else 'Birebir Etüt',
            'color': '#0d9488',
            'state': _live_state(ot.session_date, start_s, end_s, now_dt),
            'plan_id': None,
            'topics': [ot.notes.strip()] if ot.notes and ot.notes.strip() else [],
        })

    birebir_slots = (
        BirebirHaftalikSlot.objects.select_related('program', 'ders', 'ogretmen', 'oda')
        .filter(
            aktif=True,
            program__ogrenci_id=ogrenci.id,
            program__durum=ProgramDurumu.AKTIF,
            program__kurum_id=scope['kurum_id'],
            program__sube_id=scope['sube_id'],
            program__egitim_yili_id=scope['egitim_yili_id'],
        )
    )
    for slot in birebir_slots:
        eff_start = slot.baslangic_tarihi or slot.program.baslangic_tarihi
        eff_end = slot.bitis_tarihi or slot.program.bitis_tarihi
        for day_key in list(days_map.keys()):
            if day_key in holiday_dates:
                continue
            if day_key.isoweekday() != slot.gun:
                continue
            if eff_start and day_key < eff_start:
                continue
            if eff_end and day_key > eff_end:
                continue
            if (slot.id, day_key) in concrete_slot_dates:
                continue
            ders_name = resolve_ders_display_name(ders=slot.ders) if slot.ders else 'Özel Ders'
            start_s = _format_time(slot.baslangic)
            end_s = _format_time(slot.bitis)
            days_map[day_key].append({
                'id': f'pslot:{slot.id}:{day_key.isoformat()}',
                'kind': 'private_lesson',
                'kind_label': 'Özel Ders',
                'title': ders_name,
                'subtitle': 'Birebir Ders',
                'start_time': start_s,
                'end_time': end_s,
                'all_day': False,
                'teacher_name': f'{slot.ogretmen.ad} {slot.ogretmen.soyad}'.strip() if slot.ogretmen else '',
                'location': slot.oda.ad if slot.oda else 'Birebir Etüt',
                'color': '#0d9488',
                'state': _live_state(day_key, start_s, end_s, now_dt),
                'plan_id': None,
                'topics': [],
            })

    # 5. Deneme Sınavları (ExamParticipant veya sınıfa tanımlı Exam)
    participations = {
        p.exam_id: p
        for p in ExamParticipant.objects.select_related('exam', 'room', 'exam_session').filter(
            student_id=ogrenci.id,
            exam__kurum_id=scope['kurum_id'],
            exam__is_active=True,
            exam__exam_date__gte=start_date,
            exam__exam_date__lte=end_date,
        )
    }
    exams_qs = Exam.objects.filter(
        kurum_id=scope['kurum_id'],
        is_active=True,
        exam_date__gte=start_date,
        exam_date__lte=end_date,
    ).filter(Q(sube_id__isnull=True) | Q(sube_id=scope['sube_id']))
    if classroom is not None:
        exams_qs = exams_qs.filter(Q(id__in=participations.keys()) | Q(siniflar=classroom)).distinct()
    else:
        exams_qs = exams_qs.filter(id__in=participations.keys()).distinct()

    for ex in exams_qs:
        if not ex.exam_date or ex.exam_date not in days_map:
            continue
        part = participations.get(ex.id)
        sess = part.exam_session if part else None
        start_s = _format_time(getattr(sess, 'start_time', None)) or '09:30'
        end_s = ''
        if ex.duration_minutes and start_s:
            try:
                hh, mm = [int(x) for x in start_s.split(':')]
                end_dt = datetime.combine(ex.exam_date, time(hh, mm)) + timedelta(minutes=ex.duration_minutes)
                end_s = end_dt.strftime('%H:%M')
            except Exception:
                end_s = ''
        loc_parts = []
        if part and part.room:
            loc_parts.append(part.room.name)
        if part and part.seat_no:
            loc_parts.append(f'Sıra {part.seat_no}')
        days_map[ex.exam_date].append({
            'id': f'exam:{ex.id}',
            'kind': 'exam',
            'kind_label': 'Deneme Sınavı',
            'title': ex.name,
            'subtitle': ex.get_exam_type_display(),
            'start_time': start_s,
            'end_time': end_s,
            'all_day': False,
            'teacher_name': '',
            'location': ' · '.join(loc_parts) if loc_parts else 'Sınav Salonu',
            'color': '#f97316',
            'state': _live_state(ex.exam_date, start_s, end_s, now_dt),
            'plan_id': None,
            'exam_id': ex.id,
            'seat_no': part.seat_no if part else None,
            'room_name': part.room.name if (part and part.room) else None,
            'topics': [],
        })

    # 6. Koç Ödev Kontrol Günleri (ManualAssignment.due_date)
    from apps.coaching.assignment_manual.models import ManualAssignment
    from apps.coaching.assignment_manual.title_utils import strip_completion_title_suffix

    hw_rows = (
        ManualAssignment.objects.select_related('coach')
        .filter(
            student_id=ogrenci.id,
            is_active=True,
            due_date__isnull=False,
            due_date__date__gte=start_date,
            due_date__date__lte=end_date,
        )
        .exclude(status__in=[ManualAssignment.Status.DRAFT, ManualAssignment.Status.CANCELLED])
    )
    for hw in hw_rows:
        due_local = timezone.localtime(hw.due_date, ISTANBUL) if timezone.is_aware(hw.due_date) else hw.due_date
        due_d = due_local.date()
        if due_d not in days_map:
            continue
        coach_full = (hw.coach.get_full_name() or hw.coach.username) if hw.coach else ''
        clean_hw_title = strip_completion_title_suffix(hw.title) or hw.title
        is_hw_done = hw.status == ManualAssignment.Status.COMPLETED
        days_map[due_d].append({
            'id': f'homework:{hw.id}',
            'kind': 'homework',
            'kind_label': 'Ödev Kontrolü',
            'title': clean_hw_title,
            'subtitle': 'Kontrol tamamlandı' if is_hw_done else 'Koç ödev kontrol günü',
            'start_time': '',
            'end_time': '',
            'all_day': True,
            'teacher_name': coach_full,
            'location': 'Koç Kontrolü',
            'color': '#10b981' if is_hw_done else '#7c3aed',
            'state': 'past' if (is_hw_done or due_d < now_dt.date()) else 'upcoming',
            'plan_id': None,
            'assignment_id': hw.id,
            'topics': [],
        })

    WEEKDAY_NAMES_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

    # Gün içi kronolojik sıralama
    ordered_days = []
    for day_key in sorted(days_map.keys()):
        raw_items = sorted(
            days_map[day_key],
            key=lambda it: ('00:00' if it['all_day'] else (it['start_time'] or '23:59'), it['title']),
        )
        items = [
            {
                **it,
                'room_name': it.get('room_name') or it.get('location') or '',
                'period_no': it.get('period_no'),
                'covered_topic': ', '.join(it.get('topics') or []),
            }
            for it in raw_items
        ]
        ordered_days.append({
            'date': day_key.isoformat(),
            'weekday': day_key.weekday(),
            'day_label': WEEKDAY_NAMES_TR[day_key.weekday()],
            'is_today': day_key == now_dt.date(),
            'is_holiday': day_key in holiday_dates,
            'item_count': len(items),
            'items': items,
        })

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'classroom': {
            'id': classroom.id,
            'name': classroom.ad,
            'grade_level': classroom.sinif_seviyesi.ad if getattr(classroom, 'sinif_seviyesi_id', None) and classroom.sinif_seviyesi else '',
        } if classroom else None,
        'schedule_version_number': None,
        'group': {'id': group.id, 'name': group.name} if group else None,
        'days': ordered_days,
    }


def build_courses_and_notes(scope: dict) -> dict:
    """
    Öğrencinin sınıf derslerini, derste işlenen konu ve kazanımları,
    öğretmenlerin yüklediği Google Drive ders notlarını ve atanan kitapları döndürür.
    """
    classroom, _ = resolve_student_classroom(scope)
    plans = list(_active_class_plans_qs(scope))
    plan_ids = [p.id for p in plans]
    plan_map = {p.id: p for p in plans}

    notes_by_plan: dict[int, list[dict]] = {}
    all_notes: list[dict] = []
    if plan_ids:
        note_rows = (
            DersNotu.objects.select_related('ogretmen', 'class_lesson_plan__ders')
            .filter(
                kurum_id=scope['kurum_id'],
                sube_id=scope['sube_id'],
                egitim_yili_id=scope['egitim_yili_id'],
                class_lesson_plan_id__in=plan_ids,
            )
            .order_by('-session_date', '-id')[:200]
        )
        for n in note_rows:
            ders_name = resolve_ders_display_name(
                ders=n.class_lesson_plan.ders,
                plan=n.class_lesson_plan,
            )
            mime = n.mime_type or ''
            item = {
                'id': n.id,
                'plan_id': n.class_lesson_plan_id,
                'course_id': n.class_lesson_plan_id,
                'course_name': ders_name,
                'classroom_name': classroom.ad if classroom else '',
                'color': subject_color(ders_name),
                'session_date': n.session_date.isoformat(),
                'title': n.file_name,
                'description': '',
                'file_name': n.file_name,
                'mime_type': mime,
                'size': n.size,
                'file_size': n.size,
                'is_pdf': mime == 'application/pdf',
                'is_image': mime.startswith('image/'),
                'teacher_name': f'{n.ogretmen.ad} {n.ogretmen.soyad}'.strip() if n.ogretmen else '',
                'created_at': n.created_at.isoformat(),
            }
            notes_by_plan.setdefault(n.class_lesson_plan_id, []).append(item)
            all_notes.append(item)

    topics_by_plan: dict[int, list[dict]] = {}
    all_topics: list[dict] = []
    if plan_ids:
        topic_rows = (
            IslenenKonu.objects.select_related('topic', 'ogretmen')
            .prefetch_related('kazanimlar__outcome')
            .filter(
                kurum_id=scope['kurum_id'],
                sube_id=scope['sube_id'],
                egitim_yili_id=scope['egitim_yili_id'],
                class_lesson_plan_id__in=plan_ids,
            )
            .order_by('-session_date', '-id')[:250]
        )
        for tr in topic_rows:
            plan_obj = plan_map.get(tr.class_lesson_plan_id)
            ders_name = (
                resolve_ders_display_name(ders=plan_obj.ders, plan=plan_obj)
                if plan_obj
                else 'Ders'
            )
            outcomes = [
                {'id': k.outcome_id, 'code': k.outcome.code or '', 'description': k.outcome.description}
                for k in tr.kazanimlar.all()
                if k.outcome_id
            ]
            t_item = {
                'id': tr.id,
                'date': tr.session_date.isoformat(),
                'session_date': tr.session_date.isoformat(),
                'period_no': None,
                'course_id': tr.class_lesson_plan_id,
                'course_name': ders_name,
                'color': subject_color(ders_name),
                'unit': '',
                'topic': (tr.topic.name if tr.topic else '') or (tr.note or 'İşlenen Konu'),
                'topic_name': tr.topic.name if tr.topic else '',
                'note': tr.note or '',
                'teacher_name': f'{tr.ogretmen.ad} {tr.ogretmen.soyad}'.strip() if tr.ogretmen else '',
                'outcomes': outcomes,
            }
            topics_by_plan.setdefault(tr.class_lesson_plan_id, []).append(t_item)
            all_topics.append(t_item)

    courses = []
    for p in plans:
        ders_name = resolve_ders_display_name(ders=p.ders, plan=p)
        p_notes = notes_by_plan.get(p.id, [])
        p_topics = topics_by_plan.get(p.id, [])
        courses.append({
            'id': p.id,
            'plan_id': p.id,
            'lesson_id': p.ders_id,
            'name': ders_name,
            'code': p.ders.kod if p.ders else '',
            'color': subject_color(ders_name),
            'weekly_hours': p.weekly_hours,
            'teacher_name': f'{p.ogretmen.ad} {p.ogretmen.soyad}'.strip() if p.ogretmen else 'Atanmadı',
            'note_count': len(p_notes),
            'topic_count': len(p_topics),
            'notes_count': len(p_notes),
            'topics_count': len(p_topics),
            'notes': p_notes,
            'topics': p_topics[:30],
        })

    # Atanan kaynak kitaplar
    resources_qs = (
        StudentResourceAssignment.objects.select_related(
            'lesson', 'resource_book', 'resource_book__publisher', 'resource_book__book_type',
        )
        .filter(student_id=scope['ogrenci'].id, is_active=True)
        .exclude(status=StudentResourceAssignment.Status.CANCELLED)
        .order_by('-assigned_at', '-id')
    )
    resources = []
    for ra in resources_qs:
        book = ra.resource_book
        lesson_name = ra.lesson.ad if ra.lesson else (book.ders.ad if book and book.ders_id else '')
        cover_url = None
        if book and book.kapak:
            try:
                cover_url = book.kapak.url
            except Exception:
                cover_url = None
        elif book and book.kapak_url:
            cover_url = book.kapak_url

        book_title = book.ad if book else 'Kaynak Kitap'
        resources.append({
            'id': ra.id,
            'book_id': ra.resource_book_id,
            'name': book_title,
            'title': book_title,
            'publisher': book.publisher.ad if (book and book.publisher) else '',
            'book_type': book.book_type.ad if (book and book.book_type) else '',
            'subject': lesson_name,
            'lesson_name': lesson_name,
            'grade_level': '',
            'assigned_at': ra.assigned_at.isoformat() if getattr(ra, 'assigned_at', None) else '',
            'color': subject_color(lesson_name),
            'status': ra.status,
            'status_label': ra.get_status_display(),
            'ownership_label': ra.get_ownership_type_display(),
            'progress_percent': ra.progress_percent,
            'cover_url': cover_url,
            'due_date': ra.due_date.isoformat() if ra.due_date else None,
        })

    return {
        'classroom': {'id': classroom.id, 'name': classroom.ad} if classroom else None,
        'courses': courses,
        'notes': all_notes,
        'topics': all_topics,
        'recent_notes': all_notes[:25],
        'resources': resources,
    }


def _visible_student_note(scope: dict, note_id: int) -> DersNotu:
    plan_ids = list(_active_class_plans_qs(scope).values_list('id', flat=True))
    if not plan_ids:
        raise StudentPortalError('not_found', 'Ders notu bulunamadı.', 404)
    note = (
        DersNotu.objects.filter(
            id=note_id,
            kurum_id=scope['kurum_id'],
            sube_id=scope['sube_id'],
            egitim_yili_id=scope['egitim_yili_id'],
            class_lesson_plan_id__in=plan_ids,
        )
        .first()
    )
    if note is None:
        raise StudentPortalError('not_found', 'Ders notu bulunamadı veya erişim izniniz yok.', 404)
    return note


def _cached_student_note_pages(scope: dict, note_id: int) -> list[dict]:
    import time as time_mod

    note = _visible_student_note(scope, note_id)
    cached = _NOTE_PREVIEW_CACHE.get(note.drive_file_id)
    now_ts = time_mod.time()
    if cached is not None and cached[0] > now_ts:
        return cached[1]

    try:
        raw = fetch_file(note.drive_file_id)
        pages = render_pages(raw, note.mime_type)
    except Exception:
        raise StudentPortalError('unavailable', 'Ders notu önizlemesi şu anda hazırlanamadı.', 502)

    if len(pages) > MAX_PREVIEW_PAGES:
        pages = pages[:MAX_PREVIEW_PAGES]
    _NOTE_PREVIEW_CACHE[note.drive_file_id] = (now_ts + 600, pages)
    if len(_NOTE_PREVIEW_CACHE) > 8:
        oldest_key = min(_NOTE_PREVIEW_CACHE, key=lambda k: _NOTE_PREVIEW_CACHE[k][0])
        _NOTE_PREVIEW_CACHE.pop(oldest_key, None)
    return pages


def get_student_note_preview_catalog(scope: dict, note_id: int) -> dict:
    note = _visible_student_note(scope, note_id)
    pages = _cached_student_note_pages(scope, note_id)
    return {
        'id': note.id,
        'note_id': note.id,
        'title': note.file_name,
        'file_name': note.file_name,
        'mime_type': note.mime_type,
        'page_count': len(pages),
        'pages': [
            {'number': p['number'], 'width': p['width'], 'height': p['height']}
            for p in pages
        ],
    }


def get_student_note_preview_page(scope: dict, note_id: int, page_number: int) -> dict:
    pages = _cached_student_note_pages(scope, note_id)
    found = next((p for p in pages if p['number'] == page_number), None)
    if found is None:
        raise StudentPortalError('not_found', 'Sayfa bulunamadı.', 404)
    return {'content': found['content'], 'mime': found['mime']}


def open_student_note_file(scope: dict, note_id: int) -> dict:
    note = _visible_student_note(scope, note_id)
    try:
        content = fetch_file(note.drive_file_id)
    except DriveError:
        raise StudentPortalError('unavailable', 'Dosya indirilemedi.', 502)
    encoded_name = quote(note.file_name)
    ascii_name = (
        note.file_name.encode('ascii', 'ignore').decode('ascii').replace('"', '')
        or 'ders-notu'
    )
    return {
        'content': content,
        'mime': note.mime_type,
        'disposition': f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}",
    }


def build_campus_life_and_attendance(scope: dict) -> dict:
    """
    Kütüphane masa ve dolap atamalarını, ayrıca sınıf + özel ders + etüt
    birleşik devam istatistiğini ve devamsızlık geçmişini hesaplar.
    """
    ogrenci = scope['ogrenci']
    today = timezone.localtime(timezone.now(), ISTANBUL).date()

    # 1. Kütüphane Masa & Dolap
    seat_row = (
        SeatAssignment.objects.select_related('library', 'seat')
        .filter(
            ogrenci_id=ogrenci.id,
            durum=AssignmentStatus.ACTIVE,
            library__kurum_id=scope['kurum_id'],
        )
        .filter(Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=today))
        .order_by('-baslangic_tarihi', '-created_at')
        .first()
    )
    locker_row = (
        LockerAssignment.objects.select_related('locker')
        .filter(
            ogrenci_id=ogrenci.id,
            kurum_id=scope['kurum_id'],
            durum=AssignmentStatus.ACTIVE,
        )
        .filter(Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=today))
        .order_by('-baslangic_tarihi', '-created_at')
        .first()
    )

    seat_info = None
    if seat_row and seat_row.seat and seat_row.library:
        seat_info = {
            'hall_name': seat_row.library.ad,
            'library_name': seat_row.library.ad,
            'floor': '',
            'seat_number': seat_row.seat.masa_no,
            'seat_no': seat_row.seat.masa_no,
            'label': f'{seat_row.library.ad} · Masa #{seat_row.seat.masa_no}',
            'assignment_type': seat_row.get_atama_tipi_display(),
            'start_date': seat_row.baslangic_tarihi.isoformat() if seat_row.baslangic_tarihi else '',
            'end_date': seat_row.bitis_tarihi.isoformat() if seat_row.bitis_tarihi else None,
        }

    locker_info = None
    if locker_row and locker_row.locker:
        locker_info = {
            'unit_name': 'Öğrenci Dolabı',
            'locker_number': locker_row.locker.dolap_no,
            'locker_no': locker_row.locker.dolap_no,
            'label': f'Dolap #{locker_row.locker.dolap_no}',
            'size_label': locker_row.locker.get_boyut_display(),
            'lock_type_label': locker_row.locker.get_kilit_tipi_display(),
            'key_delivered': locker_row.anahtar_verildi,
            'start_date': locker_row.baslangic_tarihi.isoformat() if getattr(locker_row, 'baslangic_tarihi', None) else '',
            'end_date': locker_row.bitis_tarihi.isoformat() if getattr(locker_row, 'bitis_tarihi', None) else None,
        }

    # 2. Yoklama kayıtları (Sınıf Periyot + Kütüphane Etüt + Özel Ders)
    present_count = 0
    absent_count = 0
    late_count = 0
    excused_count = 0
    history: list[dict] = []

    class_records = (
        ClassPeriodAttendanceRecord.objects.select_related('session', 'session__sinif')
        .filter(
            student_id=ogrenci.id,
            session__egitim_yili_id=scope['egitim_yili_id'],
            session__is_active=True,
        )
        .order_by('-session__session_date', '-id')[:180]
    )
    for rec in class_records:
        st = rec.status
        if st == StudentAttendanceStatus.PRESENT:
            present_count += 1
        elif st == StudentAttendanceStatus.EXCUSED or rec.izinli_mi:
            excused_count += 1
            history.append({
                'id': f'class:{rec.id}',
                'date': rec.session.session_date.isoformat(),
                'category': 'Sınıf Yoklaması',
                'title': f'{rec.session.sinif.ad} · {rec.session.period_label}',
                'status': 'excused',
                'status_label': 'İzinli / Raporlu',
                'note': rec.note or '',
            })
        elif st == StudentAttendanceStatus.LATE:
            late_count += 1
            present_count += 1
            history.append({
                'id': f'class:{rec.id}',
                'date': rec.session.session_date.isoformat(),
                'category': 'Sınıf Yoklaması',
                'title': f'{rec.session.sinif.ad} · {rec.session.period_label}',
                'status': 'late',
                'status_label': 'Geç Kaldı',
                'note': rec.note or '',
            })
        elif st == StudentAttendanceStatus.ABSENT:
            absent_count += 1
            history.append({
                'id': f'class:{rec.id}',
                'date': rec.session.session_date.isoformat(),
                'category': 'Sınıf Yoklaması',
                'title': f'{rec.session.sinif.ad} · {rec.session.period_label}',
                'status': 'absent',
                'status_label': 'Özürsüz Gelmedi',
                'note': rec.note or '',
            })

    lib_records = (
        AttendanceRecord.objects.select_related('attendance_session', 'attendance_session__library')
        .filter(
            ogrenci_id=ogrenci.id,
            attendance_session__library__kurum_id=scope['kurum_id'],
        )
        .order_by('-attendance_session__tarih', '-kayit_zamani')[:180]
    )
    for lrec in lib_records:
        sess = lrec.attendance_session
        st = lrec.durum
        if st == AttendanceStatus.PRESENT:
            present_count += 1
        elif st == AttendanceStatus.EXCUSED or lrec.izinli_mi:
            excused_count += 1
            history.append({
                'id': f'lib:{lrec.id}',
                'date': sess.tarih.isoformat(),
                'category': 'Kütüphane / Etüt',
                'title': f'{sess.library.ad} · {sess.get_periyot_kodu_display()}',
                'status': 'excused',
                'status_label': 'İzinli',
                'note': lrec.notlar or '',
            })
        elif st == AttendanceStatus.LATE:
            late_count += 1
            present_count += 1
            history.append({
                'id': f'lib:{lrec.id}',
                'date': sess.tarih.isoformat(),
                'category': 'Kütüphane / Etüt',
                'title': f'{sess.library.ad} · {sess.get_periyot_kodu_display()}',
                'status': 'late',
                'status_label': 'Geç Geldi',
                'note': lrec.notlar or '',
            })
        elif st in (AttendanceStatus.ABSENT, AttendanceStatus.NOT_AT_DESK):
            absent_count += 1
            history.append({
                'id': f'lib:{lrec.id}',
                'date': sess.tarih.isoformat(),
                'category': 'Kütüphane / Etüt',
                'title': f'{sess.library.ad} · {sess.get_periyot_kodu_display()}',
                'status': 'absent',
                'status_label': 'Masada Yok / Gelmedi',
                'note': lrec.notlar or '',
            })

    priv_records = (
        BirebirDersOturumu.objects.select_related('ders', 'ogretmen')
        .filter(
            ogrenci_id=ogrenci.id,
            kurum_id=scope['kurum_id'],
            egitim_yili_id=scope['egitim_yili_id'],
            is_active=True,
            durum__in=[OturumDurumu.ISLENDI, OturumDurumu.ONLINE, OturumDurumu.OGRENCI_GELMEDI],
        )
        .order_by('-session_date', '-id')[:120]
    )
    for prec in priv_records:
        if prec.durum in (OturumDurumu.ISLENDI, OturumDurumu.ONLINE):
            present_count += 1
        elif prec.durum == OturumDurumu.OGRENCI_GELMEDI:
            absent_count += 1
            history.append({
                'id': f'priv:{prec.id}',
                'date': prec.session_date.isoformat(),
                'category': 'Özel Ders',
                'title': resolve_ders_display_name(ders=prec.ders) if prec.ders else 'Özel Ders',
                'status': 'absent',
                'status_label': 'Katılmadı',
                'note': prec.sebep_aciklama or '',
            })

    total_tracked = present_count + absent_count + excused_count
    attendance_rate = round((present_count + excused_count) / total_tracked * 100, 1) if total_tracked > 0 else 100.0
    history.sort(key=lambda item: item['date'], reverse=True)
    enriched_history = [
        {
            **h,
            'kind': h.get('category', ''),
            'kind_label': h.get('category', ''),
            'period_label': h.get('note', ''),
            'tone': (
                'danger' if h['status'] == 'absent'
                else 'warn' if h['status'] == 'late'
                else 'muted'
            ),
        }
        for h in history[:50]
    ]

    return {
        'seat': seat_info,
        'locker': locker_info,
        'attendance': {
            'rate_percent': attendance_rate,
            'total_records': total_tracked,
            'total_sessions': total_tracked,
            'present_count': present_count,
            'absent_count': absent_count,
            'late_count': late_count,
            'excused_count': excused_count,
            'history': enriched_history,
        },
    }
