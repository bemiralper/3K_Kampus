"""Salt okunur öğretmen cephesi. Web program uçlarını çağırmaz."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Q

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.class_lesson_teacher_assignment import ClassLessonTeacherAssignment
from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.interfaces.views.schedule_view import (
    _annotate_teacher_cells,
    _canonical_days,
    _merged_lesson_slots,
    _private_lesson_overlay,
    _teacher_cells_qs,
    _term_versions_for_teacher,
    serialize_grid_response,
)
from apps.academic.domain.lesson_session import LessonSession, SessionKind, SessionStatus
from apps.egitim_tanimlari.display import resolve_ders_display_name
from apps.egitim_yili.domain.models import EgitimYili
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.ozel_ders.domain.models import BirebirHaftalikSlot, ProgramDurumu
from apps.term.domain.models import Term

from .models import IslenenKonu
from .services import MobileAuthError

ISTANBUL = ZoneInfo('Europe/Istanbul')
PAGE_DEFAULT = 50
PAGE_MAX = 100


def _now() -> datetime:
    return datetime.now(ISTANBUL)


def _wall(value: str | None) -> str | None:
    """Duvar saatini UTC'ye kaydırmadan +03:00 ile yazar."""
    if not value:
        return None
    clock = value.strip()
    if len(clock) == 5:
        clock = f'{clock}:00'
    if '+' in clock or clock.endswith('Z'):
        return clock
    return f'{clock}+03:00'


def _page(request) -> tuple[int, int]:
    raw_page = request.GET.get('page') or '1'
    raw_size = request.GET.get('page_size') or str(PAGE_DEFAULT)
    try:
        page = int(raw_page)
        size = int(raw_size)
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Sayfa bilgisi geçersiz.', 400)
    if page < 1 or size < 1 or size > PAGE_MAX:
        raise MobileAuthError('validation_error', 'Sayfa bilgisi geçersiz.', 400)
    return page, size


def _term_id(request) -> int:
    raw = request.GET.get('term_id')
    try:
        term_id = int(raw)
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Dönem seçilmelidir.', 400)
    if term_id < 1:
        raise MobileAuthError('validation_error', 'Dönem seçilmelidir.', 400)
    return term_id


def _load_term(scope, term_id: int) -> Term:
    context = scope['context']
    term = Term.objects.filter(
        id=term_id,
        kurum_id=context['kurum_id'],
        sube_id=context['sube_id'],
        egitim_yili_id=context['egitim_yili_id'],
        is_active=True,
    ).first()
    if term is None:
        raise MobileAuthError('not_found', 'Dönem bulunamadı.', 404)
    return term


def _plans(scope, term_id: int):
    personel = scope['personel']
    context = scope['context']
    base = ClassLessonPlan.objects.filter(
        is_active=True,
        egitim_yili_id=context['egitim_yili_id'],
        term_id=term_id,
        term__kurum_id=context['kurum_id'],
        term__sube_id=context['sube_id'],
    )
    assigned = ClassLessonTeacherAssignment.objects.filter(
        ogretmen_id=personel.id,
        is_active=True,
        class_lesson_plan__in=base,
    ).values('class_lesson_plan_id')
    return base.filter(Q(ogretmen_id=personel.id) | Q(id__in=assigned))


def _plan_or_404(scope, term_id: int, plan_id: int) -> ClassLessonPlan:
    plan = (
        _plans(scope, term_id)
        .select_related('ders', 'sinif', 'term')
        .filter(id=plan_id)
        .first()
    )
    if plan is None:
        raise MobileAuthError('not_found', 'Ders bulunamadı.', 404)
    return plan


def _role_for(plan: ClassLessonPlan, personel_id: int) -> str:
    row = (
        ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan_id=plan.id,
            ogretmen_id=personel_id,
            is_active=True,
        )
        .order_by('priority', 'id')
        .first()
    )
    if row is not None:
        return row.role
    if plan.ogretmen_id == personel_id:
        return 'PRIMARY'
    return ''


def _okul_numbers(student_ids, context) -> dict:
    found = {}
    rows = OgrenciKayit.objects.filter(
        ogrenci_id__in=list(student_ids),
        kurum_id=context['kurum_id'],
        sube_id=context['sube_id'],
        egitim_yili_id=context['egitim_yili_id'],
        aktif_mi=True,
    ).order_by('id')
    for row in rows:
        found.setdefault(row.ogrenci_id, row.okul_no or '')
    return found


def _file_url(field, request) -> str | None:
    if not field:
        return None
    try:
        return request.build_absolute_uri(field.url)
    except Exception:
        return None


def _photo(student: Ogrenci, request) -> str | None:
    return _file_url(student.profil_foto, request)


def _personel_photo(personel, request) -> str | None:
    return _file_url(personel.fotograf, request)


def teacher_profile(request, scope) -> dict:
    personel = scope['personel']
    assignment = scope['assignment']
    gender = {'E': 'Erkek', 'K': 'Kadın'}.get(personel.cinsiyet or '', '')
    return {
        'ad': personel.ad,
        'soyad': personel.soyad,
        'fotograf': _personel_photo(personel, request),
        'tc_kimlik_no': personel.tc_kimlik_no or '',
        'dogum_tarihi': personel.dogum_tarihi.isoformat() if personel.dogum_tarihi else '',
        'cinsiyet': gender,
        'telefon': personel.telefon or '',
        'cep_telefon': personel.cep_telefon or '',
        'email': personel.email or '',
        'adres': personel.adres or '',
        'il': personel.il or '',
        'ilce': personel.ilce or '',
        'acil_durum_kisi': personel.acil_durum_kisi or '',
        'acil_durum_telefon': personel.acil_durum_telefon or '',
        'brans': assignment.brans.ad if assignment.brans_id else '',
        'rol': assignment.rol.name if assignment.rol_id else '',
        'gorev_baslangic': assignment.gorev_baslangic.isoformat() if assignment.gorev_baslangic else '',
    }


def _slice(rows: list, page: int, size: int) -> dict:
    start = (page - 1) * size
    return {
        'page': page,
        'page_size': size,
        'count': len(rows),
        'results': rows[start:start + size],
    }


def list_terms(scope) -> dict:
    context = scope['context']
    today = _now().date()
    terms = list(
        Term.objects.filter(
            kurum_id=context['kurum_id'],
            sube_id=context['sube_id'],
            egitim_yili_id=context['egitim_yili_id'],
            is_active=True,
        ).order_by('order_no', 'start_date', 'id')
    )
    current_id = None
    for term in terms:
        if term.start_date <= today <= term.end_date:
            current_id = term.id
            break
    return {
        'timezone': 'Europe/Istanbul',
        'results': [
            {
                'id': term.id,
                'name': term.name,
                'is_current': term.id == current_id,
            }
            for term in terms
        ],
    }


def _schedule_document(scope, term: Term) -> dict:
    versions = _term_versions_for_teacher(term.id, None)
    if not versions:
        return {'days': [], 'slots': [], 'cells': []}
    days = _canonical_days(versions)
    slots = _merged_lesson_slots(versions)
    cells = _teacher_cells_qs(scope['personel'].id, versions)
    data = serialize_grid_response(cells, days, slots)
    _annotate_teacher_cells(data, cells, merge_days=True)
    year = EgitimYili.objects.get(pk=scope['context']['egitim_yili_id'])
    extra_slots, extra_cells = _private_lesson_overlay(
        scope['personel'].id,
        scope['context'],
        year,
        days,
        slots,
    )
    existing = {slot['id'] for slot in data['slots']}
    for extra in extra_slots:
        if extra['id'] not in existing:
            data['slots'].append(extra)
            existing.add(extra['id'])
    data['cells'].extend(extra_cells)
    used = {cell.get('timeslot_id') for cell in data['cells']}
    data['slots'] = [slot for slot in data['slots'] if slot['id'] in used]
    data['slots'].sort(key=lambda slot: (slot.get('start') or '99:99', slot.get('order') or 0))
    return data


def _public_cell(cell: dict) -> dict:
    lesson = cell.get('lesson') or None
    if isinstance(lesson, dict):
        lesson = {'id': lesson.get('id'), 'name': lesson.get('name')}
    classroom = cell.get('classroom') if cell.get('kind') != 'private' else None
    if isinstance(classroom, dict):
        classroom = {'id': classroom.get('id'), 'name': classroom.get('name')}
    room = cell.get('room')
    if isinstance(room, dict):
        room = {'id': room.get('id'), 'name': room.get('name')}
    student = cell.get('student') if cell.get('kind') == 'private' else None
    if isinstance(student, dict):
        student = {'id': student.get('id'), 'name': student.get('name')}
    return {
        'id': cell.get('id'),
        'day_id': cell.get('day_id'),
        'kind': cell.get('kind') or 'class',
        'class_lesson_plan_id': cell.get('class_lesson_plan_id'),
        'lesson': lesson,
        'classroom': classroom,
        'room': room,
        'student': student,
        'start': _wall(cell.get('start')),
        'end': _wall(cell.get('end')),
    }


_STATUS_LABEL = {
    SessionStatus.SCHEDULED: 'Planlandı',
    SessionStatus.IN_PROGRESS: 'Devam ediyor',
    SessionStatus.COMPLETED: 'Tamamlandı',
    SessionStatus.CANCELLED: 'İptal',
    SessionStatus.POSTPONED: 'Ertelendi',
    SessionStatus.NO_SHOW: 'Yapılmadı',
}
_KIND_LABEL = {
    SessionKind.REGULAR: 'Ders',
    SessionKind.PRIVATE: 'Özel ders',
    SessionKind.MAKEUP: 'Telafi',
    SessionKind.EXTRA: 'Ek ders',
}
_DAY_META = (
    (0, 'Pazartesi', 'Pzt'),
    (1, 'Salı', 'Sal'),
    (2, 'Çarşamba', 'Çar'),
    (3, 'Perşembe', 'Per'),
    (4, 'Cuma', 'Cum'),
    (5, 'Cumartesi', 'Cts'),
    (6, 'Pazar', 'Paz'),
)
_STATUS_RANK = {
    SessionStatus.SCHEDULED: 1,
    SessionStatus.COMPLETED: 2,
    SessionStatus.IN_PROGRESS: 3,
    SessionStatus.POSTPONED: 4,
    SessionStatus.NO_SHOW: 4,
    SessionStatus.CANCELLED: 5,
}


def _hhmm(value) -> str:
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    wall = _wall(value) or ''
    return wall[:5]


def _public_session(session: LessonSession) -> dict:
    return {
        'id': session.id,
        'date': session.session_date.isoformat(),
        'status': session.status,
        'status_label': _STATUS_LABEL.get(session.status, session.status),
        'kind': session.session_kind,
        'kind_label': _KIND_LABEL.get(session.session_kind, session.session_kind),
    }


def _session_matches(cell: dict, session: LessonSession) -> bool:
    if cell.get('day_id') != session.session_date.weekday():
        return False
    if _hhmm(cell.get('start')) != _hhmm(session.start_time):
        return False
    private = session.session_kind == SessionKind.PRIVATE or cell.get('kind') == 'private'
    if private:
        student = cell.get('student') or {}
        return bool(session.private_student_id) and student.get('id') == session.private_student_id
    if session.source_grid_cell_id and cell.get('id') == session.source_grid_cell_id:
        return True
    return bool(session.class_lesson_plan_id) and cell.get('class_lesson_plan_id') == session.class_lesson_plan_id


def _prefer_session(session: LessonSession, current: dict) -> bool:
    return _STATUS_RANK.get(session.status, 0) > _STATUS_RANK.get(current.get('status'), 0)


def _append_session_cell(schedule: dict, session: LessonSession) -> None:
    dow = session.session_date.weekday()
    if not any(day.get('id') == dow for day in schedule['days']):
        _id, name, short = _DAY_META[dow]
        schedule['days'].append({'id': dow, 'name': name, 'short_name': short, 'order': dow + 1})
        schedule['days'].sort(key=lambda day: day.get('order') or 0)
    start = _hhmm(session.start_time)
    end = _hhmm(session.end_time)
    if not any(_hhmm(slot.get('start')) == start for slot in schedule['slots']):
        schedule['slots'].append({
            'id': f'session-{session.id}',
            'name': _KIND_LABEL.get(session.session_kind, 'Ders'),
            'start': _wall(start),
            'end': _wall(end),
            'order': 20000 + session.start_time.hour * 60 + session.start_time.minute,
        })
        schedule['slots'].sort(key=lambda slot: (_hhmm(slot.get('start')), slot.get('order') or 0))
    private = session.session_kind == SessionKind.PRIVATE
    student = None
    if session.private_student_id:
        student = {
            'id': session.private_student_id,
            'name': f'{session.private_student.ad} {session.private_student.soyad}'.strip(),
        }
    classroom = None
    room = None
    if session.sinif_id and not private:
        classroom = {'id': session.sinif_id, 'name': session.sinif.ad}
        oda = getattr(session.sinif, 'oda', None)
        if oda:
            room = {'id': oda.id, 'name': oda.ad}
    schedule['cells'].append({
        'id': -1000000 - session.id,
        'day_id': dow,
        'kind': 'private' if private else 'class',
        'class_lesson_plan_id': None if private else session.class_lesson_plan_id,
        'lesson': {'id': session.ders_id, 'name': resolve_ders_display_name(ders=session.ders, plan=session.class_lesson_plan)},
        'classroom': classroom,
        'room': room,
        'student': student if private else None,
        'start': _wall(start),
        'end': _wall(end),
        'session': _public_session(session),
    })


def _attach_week_sessions(scope, term: Term, schedule: dict) -> None:
    start, end = _week_bounds(_now())
    schedule['week'] = {'start': start.isoformat(), 'end': end.isoformat()}
    for cell in schedule['cells']:
        cell['session'] = None
    teacher_id = scope['personel'].id
    sessions = LessonSession.objects.filter(
        is_active=True,
        term_id=term.id,
        egitim_yili_id=scope['context']['egitim_yili_id'],
        session_date__gte=start,
        session_date__lte=end,
    ).filter(
        Q(ogretmen_id=teacher_id) | Q(substitute_ogretmen_id=teacher_id)
    ).select_related('ders', 'sinif', 'sinif__oda', 'private_student', 'class_lesson_plan')
    for session in sessions:
        match = next((cell for cell in schedule['cells'] if _session_matches(cell, session)), None)
        if match is None:
            _append_session_cell(schedule, session)
            continue
        current = match.get('session')
        if current is None or _prefer_session(session, current):
            match['session'] = _public_session(session)
    _attach_week_topics(scope, term, schedule, start)


def _topic_label(row: IslenenKonu) -> str:
    if row.topic_id:
        name = (row.topic.name or '').strip()
        if name:
            return name[:80]
    note = (row.note or '').strip()
    return note[:80] or 'Not'


def _attach_week_topics(scope, term: Term, schedule: dict, start) -> None:
    for cell in schedule['cells']:
        cell['topic'] = None
    rows = (
        IslenenKonu.objects.filter(
            ogretmen_id=scope['personel'].id,
            term_id=term.id,
            egitim_yili_id=scope['context']['egitim_yili_id'],
            session_date__gte=start,
            session_date__lte=start + timedelta(days=6),
        )
        .select_related('topic')
        .order_by('id')
    )
    by_session = {}
    by_cell = {}
    for row in rows:
        label = {'name': _topic_label(row)}
        if row.lesson_session_id:
            by_session[row.lesson_session_id] = label
        if row.program_grid_cell_id:
            by_cell[(row.program_grid_cell_id, row.session_date.isoformat())] = label
    for cell in schedule['cells']:
        session = cell.get('session') or {}
        if session.get('id') in by_session:
            cell['topic'] = by_session[session['id']]
            continue
        cell_id = cell.get('id')
        day_id = cell.get('day_id')
        if isinstance(cell_id, int) and cell_id > 0 and isinstance(day_id, int):
            cell['topic'] = by_cell.get((cell_id, (start + timedelta(days=day_id)).isoformat()))


def _week_bounds(now: datetime):
    monday = now.date() - timedelta(days=now.weekday())
    return monday, monday + timedelta(days=6)


def _public_schedule(scope, term: Term) -> dict:
    raw = _schedule_document(scope, term)
    schedule = {
        'timezone': 'Europe/Istanbul',
        'term_id': term.id,
        'days': [
            {
                'id': day.get('id'),
                'name': day.get('name'),
                'short_name': day.get('short_name'),
                'order': day.get('order'),
            }
            for day in raw.get('days') or []
        ],
        'slots': [
            {
                'id': slot.get('id'),
                'name': slot.get('name'),
                'start': _wall(slot.get('start')),
                'end': _wall(slot.get('end')),
                'order': slot.get('order'),
            }
            for slot in raw.get('slots') or []
        ],
        'cells': [_public_cell(cell) for cell in raw.get('cells') or []],
    }
    _attach_week_sessions(scope, term, schedule)
    return schedule


def teacher_schedule(request, scope) -> dict:
    term = _load_term(scope, _term_id(request))
    return _public_schedule(scope, term)


def _clock_key(value: str | None) -> str:
    return value or '99:99:99+03:00'


def teacher_home(request, scope) -> dict:
    term = _load_term(scope, _term_id(request))
    schedule = _public_schedule(scope, term)
    now = _now()
    today_cells = [cell for cell in schedule['cells'] if cell.get('day_id') == now.weekday()]
    today_cells.sort(key=lambda cell: _clock_key(cell.get('start')))
    now_key = now.strftime('%H:%M:%S+03:00')
    upcoming = [cell for cell in today_cells if _clock_key(cell.get('end')) > now_key]
    classes = {
        cell['classroom']['id']
        for cell in today_cells
        if cell.get('kind') == 'class' and cell.get('classroom')
    }
    lessons = {
        cell['lesson']['id']
        for cell in today_cells
        if cell.get('lesson') and cell['lesson'].get('id') is not None
    }
    private = sum(1 for cell in today_cells if cell.get('kind') == 'private')
    return {
        'timezone': 'Europe/Istanbul',
        'date': now.date().isoformat(),
        'weekday': now.weekday(),
        'term_id': term.id,
        'next': upcoming[0] if upcoming else None,
        'today': today_cells,
        'counts': {
            'classes': len(classes),
            'lessons': len(lessons),
            'private': private,
        },
    }


def list_classes(request, scope) -> dict:
    term = _load_term(scope, _term_id(request))
    page, size = _page(request)
    personel_id = scope['personel'].id
    plans = list(
        _plans(scope, term.id)
        .select_related('ders', 'sinif', 'term')
        .order_by('sinif__ad', 'ders__ad', 'id')
    )
    classroom_ids = [plan.sinif_id for plan in plans]
    groups_by_class = {}
    for group in ClassroomGroup.objects.filter(
        classroom_id__in=classroom_ids,
        is_active=True,
    ).order_by('name', 'id'):
        groups_by_class.setdefault(group.classroom_id, []).append({
            'id': group.id,
            'name': group.name,
        })
    rows = []
    for plan in plans:
        rows.append({
            'id': plan.id,
            'sinif': {'id': plan.sinif_id, 'ad': plan.sinif.ad},
            'ders': {
                'id': plan.ders_id,
                'ad': resolve_ders_display_name(ders=plan.ders, plan=plan),
            },
            'weekly_hours': plan.weekly_hours,
            'rol': _role_for(plan, personel_id),
            'term_id': plan.term_id,
            'groups': groups_by_class.get(plan.sinif_id, []),
        })
    payload = _slice(rows, page, size)
    payload['timezone'] = 'Europe/Istanbul'
    return payload


def _placement_rows(scope, term_id: int, plan_id: int | None, group_id: int | None, query: str):
    plans = _plans(scope, term_id).select_related('sinif', 'ders')
    if plan_id is not None:
        plans = plans.filter(id=plan_id)
        if not plans.exists():
            raise MobileAuthError('not_found', 'Ders bulunamadı.', 404)
    plan_list = list(plans)
    class_to_plans = {}
    for plan in plan_list:
        class_to_plans.setdefault(plan.sinif_id, []).append(plan)
    if group_id is not None:
        group = ClassroomGroup.objects.filter(
            id=group_id,
            is_active=True,
            classroom_id__in=class_to_plans.keys(),
        ).first()
        if group is None:
            raise MobileAuthError('not_found', 'Grup bulunamadı.', 404)
    context = scope['context']
    placements = StudentClassPlacement.objects.filter(
        is_active=True,
        academic_year_id=context['egitim_yili_id'],
        term_id=term_id,
        classroom_id__in=class_to_plans.keys(),
    ).select_related('student', 'classroom', 'group')
    if group_id is not None:
        placements = placements.filter(group_id=group_id)
    if query:
        placements = placements.filter(
            Q(student__ad__icontains=query)
            | Q(student__soyad__icontains=query)
            | Q(
                student__kayitlar__okul_no__icontains=query,
                student__kayitlar__aktif_mi=True,
                student__kayitlar__kurum_id=context['kurum_id'],
                student__kayitlar__sube_id=context['sube_id'],
                student__kayitlar__egitim_yili_id=context['egitim_yili_id'],
            )
        ).distinct()
    rows = []
    seen = set()
    for placement in placements.order_by('classroom__ad', 'student__ad', 'student__soyad', 'id'):
        for plan in class_to_plans.get(placement.classroom_id, []):
            key = (placement.student_id, plan.id)
            if key in seen:
                continue
            seen.add(key)
            rows.append((placement, plan))
    return rows


def list_students(request, scope) -> dict:
    term = _load_term(scope, _term_id(request))
    page, size = _page(request)
    raw_plan = request.GET.get('plan_id')
    raw_group = request.GET.get('group_id')
    try:
        plan_id = int(raw_plan) if raw_plan else None
        group_id = int(raw_group) if raw_group else None
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Filtre geçersiz.', 400)
    query = (request.GET.get('q') or '').strip()
    pairs = _placement_rows(scope, term.id, plan_id, group_id, query)
    numbers = _okul_numbers([pair[0].student_id for pair in pairs], scope['context'])
    rows = []
    for placement, plan in pairs:
        rows.append({
            'student_id': placement.student_id,
            'ad': placement.student.ad,
            'soyad': placement.student.soyad,
            'okul_no': numbers.get(placement.student_id, ''),
            'profil_foto': _photo(placement.student, request),
            'plan_id': plan.id,
            'sinif_ad': placement.classroom.ad,
            'group_ad': placement.group.name if placement.group_id else '',
            'placement_type': placement.placement_type,
        })
    payload = _slice(rows, page, size)
    payload['timezone'] = 'Europe/Istanbul'
    return payload


def _student_lessons(scope, term_id: int, student_id: int) -> list[dict]:
    pairs = _placement_rows(scope, term_id, None, None, '')
    lessons = []
    seen = set()
    for placement, plan in pairs:
        if placement.student_id != student_id or plan.id in seen:
            continue
        seen.add(plan.id)
        lessons.append({
            'plan_id': plan.id,
            'ders': resolve_ders_display_name(ders=plan.ders, plan=plan),
            'sinif': placement.classroom.ad,
            'grup': placement.group.name if placement.group_id else '',
        })
    return lessons


def student_card(request, scope, student_id: int) -> dict:
    term = _load_term(scope, _term_id(request))
    raw_plan = request.GET.get('plan_id')
    try:
        plan_id = int(raw_plan)
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Ders seçilmelidir.', 400)
    pairs = _placement_rows(scope, term.id, plan_id, None, '')
    match = next((pair for pair in pairs if pair[0].student_id == student_id), None)
    if match is None:
        raise MobileAuthError('not_found', 'Öğrenci bulunamadı.', 404)
    placement, plan = match
    student = placement.student
    numbers = _okul_numbers([student.id], scope['context'])
    return {
        'timezone': 'Europe/Istanbul',
        'student_id': student.id,
        'ad': student.ad,
        'soyad': student.soyad,
        'okul_no': numbers.get(student.id, ''),
        'sinif': placement.classroom.ad,
        'grup': placement.group.name if placement.group_id else '',
        'profil_foto': _photo(student, request),
        'dersler': _student_lessons(scope, term.id, student.id),
        'plan_id': plan.id,
    }


def list_private_students(request, scope) -> dict:
    term = _load_term(scope, _term_id(request))
    page, size = _page(request)
    context = scope['context']
    slots = (
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            ogretmen_id=scope['personel'].id,
            program__durum=ProgramDurumu.AKTIF,
            program__kurum_id=context['kurum_id'],
            program__sube_id=context['sube_id'],
            program__egitim_yili_id=context['egitim_yili_id'],
        )
        .filter(Q(program__term_id=term.id) | Q(program__term_id__isnull=True))
        .select_related('program__ogrenci', 'ders')
        .order_by('program__ogrenci__ad', 'program__ogrenci__soyad', 'id')
    )
    by_student = {}
    for slot in slots:
        student = slot.program.ogrenci
        row = by_student.get(student.id)
        lesson = resolve_ders_display_name(ders=slot.ders)
        if row is None:
            by_student[student.id] = {
                'student_id': student.id,
                'ad': student.ad,
                'soyad': student.soyad,
                'okul_no': '',
                'sinif': '',
                'grup': '',
                'profil_foto': _photo(student, request),
                'dersler': [lesson] if lesson else [],
            }
        elif lesson and lesson not in row['dersler']:
            row['dersler'].append(lesson)
    rows = list(by_student.values())
    numbers = _okul_numbers([row['student_id'] for row in rows], context)
    for row in rows:
        row['okul_no'] = numbers.get(row['student_id'], '')
    payload = _slice(rows, page, size)
    payload['timezone'] = 'Europe/Istanbul'
    return payload
