"""İşlenen konu. Web müfredat yazmasına ve oturum üretmeye dokunmaz."""
from __future__ import annotations

import re
from datetime import date

from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q

from apps.academic.domain.lesson_session import LessonSession
from apps.academic.domain.program_grid_cell import ProgramGridCell
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Topic

from .models import DersSubjectLink, IslenenKazanim, IslenenKonu
from .services import MobileAuthError
from .teacher_read import ISTANBUL, _load_term, _page, _plan_or_404, _role_for, _slice, _term_id

NOTE_MAX = 2000


def _stamp(value) -> str:
    return value.astimezone(ISTANBUL).isoformat(timespec='seconds')


def _optional_int(value, label: str):
    if value in (None, ''):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', f'{label} geçersiz.', 400)
    if number < 1:
        raise MobileAuthError('validation_error', f'{label} geçersiz.', 400)
    return number


def _note(value) -> str:
    text = '' if value is None else str(value).strip()
    if len(text) > NOTE_MAX:
        raise MobileAuthError('validation_error', 'Not çok uzun.', 400)
    return text


def _require_primary(plan, personel_id: int) -> None:
    if _role_for(plan, personel_id) != 'PRIMARY':
        raise MobileAuthError('forbidden', 'Konu kaydı asıl öğretmene açıktır.', 403)


def _public(row: IslenenKonu) -> dict:
    topic = None
    if row.topic_id:
        topic = {
            'id': row.topic_id,
            'name': row.topic.name,
            'code': row.topic.code,
        }
    marks = sorted(row.kazanimlar.all(), key=lambda item: (item.outcome.order, item.outcome_id))
    return {
        'id': row.id,
        'plan_id': row.class_lesson_plan_id,
        'session_date': row.session_date.isoformat(),
        'lesson_session_id': row.lesson_session_id,
        'program_grid_cell_id': row.program_grid_cell_id,
        'topic': topic,
        'outcomes': [
            {'id': item.outcome_id, 'code': item.outcome.code, 'text': item.outcome.text}
            for item in marks
        ],
        'note': row.note,
        'updated_at': _stamp(row.updated_at),
        'created_at': _stamp(row.created_at),
    }


def _occurrence(plan, term, data):
    raw_date = data.get('session_date')
    try:
        session_date = date.fromisoformat(str(raw_date))
    except (TypeError, ValueError):
        raise MobileAuthError('validation_error', 'Ders tarihi seçilmelidir.', 400)
    if session_date < term.start_date or session_date > term.end_date:
        raise MobileAuthError('validation_error', 'Tarih bu dönemin dışında.', 400)
    session_id = _optional_int(data.get('lesson_session_id'), 'Ders oturumu')
    cell_id = _optional_int(data.get('program_grid_cell_id'), 'Ders saati')
    session = None
    cell = None
    if session_id is not None:
        session = (
            LessonSession.objects.filter(
                id=session_id,
                is_active=True,
                class_lesson_plan_id=plan.id,
                term_id=term.id,
                session_date=session_date,
            )
            .select_related('source_grid_cell')
            .first()
        )
        if session is None:
            raise MobileAuthError('not_found', 'Ders oturumu bulunamadı.', 404)
        cell = session.source_grid_cell
        if cell_id is not None and (cell is None or cell.id != cell_id):
            raise MobileAuthError('validation_error', 'Oturum bu ders saatiyle eşleşmiyor.', 400)
    elif cell_id is not None:
        cell = (
            ProgramGridCell.objects.filter(
                id=cell_id,
                is_active=True,
                class_lesson_plan_id=plan.id,
            )
            .select_related('weekly_day')
            .first()
        )
        if cell is None:
            raise MobileAuthError('not_found', 'Ders saati bulunamadı.', 404)
        if cell.weekly_day.day_of_week != session_date.weekday():
            raise MobileAuthError('validation_error', 'Bu tarih bu ders saatine denk gelmiyor.', 400)
        session = LessonSession.objects.filter(
            source_grid_cell=cell,
            session_date=session_date,
            is_active=True,
            class_lesson_plan_id=plan.id,
        ).first()
    else:
        raise MobileAuthError('validation_error', 'Ders saati seçilmelidir.', 400)
    return session, cell, session_date


def _grade_number(plan) -> int | None:
    seviye = getattr(plan.sinif, 'sinif_seviyesi', None)
    text = (getattr(seviye, 'ad', '') or '').casefold()
    if 'mezun' in text:
        return 12
    match = re.search(r'\d+', text)
    return int(match.group()) if match else None


def _subject_names(ders_ad: str) -> list[str]:
    base = re.sub(r'-\d+$', '', (ders_ad or '').strip())
    names = [base] if base else []
    if base.casefold().startswith('matematik') and 'Geometri' not in names:
        names.append('Geometri')
    return names


def _topics_for_plan(plan):
    linked = DersSubjectLink.objects.filter(ders_id=plan.ders_id)
    if linked.exists():
        return Topic.objects.filter(id__in=linked.values('topic_id'))
    names = _subject_names(plan.ders.ad)
    topics = Topic.objects.filter(subject__name__in=names)
    grade = _grade_number(plan)
    if grade is not None:
        topics = topics.filter(code__startswith=f'{grade}.')
    return topics


def _topic_for_plan(plan, topic_id):
    if topic_id is None:
        return None
    topic = _topics_for_plan(plan).filter(id=topic_id).first()
    if topic is None:
        raise MobileAuthError('validation_error', 'Bu konu bu derse bağlı değil.', 400)
    return topic


def _duplicate(topic: Topic | None, session, cell, session_date) -> None:
    if topic is None:
        return
    query = Q()
    if session is not None:
        query |= Q(lesson_session=session)
    if cell is not None:
        query |= Q(program_grid_cell=cell, session_date=session_date)
    if not query:
        return
    if IslenenKonu.objects.filter(topic=topic).filter(query).exists():
        raise MobileAuthError('validation_error', 'Bu konu bu derste zaten işlendi.', 400)


def _outcome_ids(value) -> list[int]:
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise MobileAuthError('validation_error', 'Kazanım seçimi geçersiz.', 400)
    found = []
    for item in value:
        number = _optional_int(item, 'Kazanım')
        if number is not None and number not in found:
            found.append(number)
    return found


def _bind_outcomes(row: IslenenKonu, topic: Topic | None, ids: list[int]) -> None:
    if ids and topic is None:
        raise MobileAuthError('validation_error', 'Kazanım için konu seçilmelidir.', 400)
    if topic is None:
        row.kazanimlar.all().delete()
        return
    found = list(Outcome.objects.filter(id__in=ids, topic=topic, is_active=True))
    if len(found) != len(ids):
        raise MobileAuthError('validation_error', 'Bu kazanım bu konuya bağlı değil.', 400)
    row.kazanimlar.all().delete()
    IslenenKazanim.objects.bulk_create([
        IslenenKazanim(islenen_konu=row, outcome=item) for item in found
    ])


def list_topic_catalog(request, scope, plan_id: int) -> dict:
    term = _load_term(scope, _term_id(request))
    plan = _plan_or_404(scope, term.id, plan_id)
    rows = (
        _topics_for_plan(plan)
        .select_related('subject')
        .prefetch_related(
            Prefetch(
                'outcomes',
                queryset=Outcome.objects.filter(is_active=True).order_by('order', 'id'),
            )
        )
        .order_by('order', 'name', 'id')
    )
    return {
        'plan_id': plan.id,
        'results': [
            {
                'id': row.id,
                'name': row.name,
                'code': row.code,
                'subject': row.subject.name,
                'outcomes': [
                    {'id': item.id, 'code': item.code, 'text': item.text}
                    for item in row.outcomes.all()
                ],
            }
            for row in rows
        ],
    }


def list_topics(request, scope, plan_id: int) -> dict:
    term = _load_term(scope, _term_id(request))
    plan = _plan_or_404(scope, term.id, plan_id)
    page, size = _page(request)
    rows = (
        IslenenKonu.objects.filter(class_lesson_plan=plan)
        .select_related('topic')
        .prefetch_related('kazanimlar__outcome')
    )
    cell_id = _optional_int(request.GET.get('program_grid_cell_id'), 'Ders saati')
    session_id = _optional_int(request.GET.get('lesson_session_id'), 'Ders oturumu')
    raw_date = request.GET.get('session_date')
    if cell_id is not None:
        rows = rows.filter(program_grid_cell_id=cell_id)
    if session_id is not None:
        rows = rows.filter(lesson_session_id=session_id)
    if raw_date:
        try:
            rows = rows.filter(session_date=date.fromisoformat(raw_date))
        except ValueError:
            raise MobileAuthError('validation_error', 'Ders tarihi seçilmelidir.', 400)
    payload = _slice(
        [_public(row) for row in rows.order_by('session_date', 'id')],
        page,
        size,
    )
    payload['timezone'] = 'Europe/Istanbul'
    payload['plan_id'] = plan.id
    return payload


def _idempotency_key(request) -> str:
    key = (request.headers.get('Idempotency-Key') or '').strip()
    if not key or len(key) > 80:
        raise MobileAuthError('validation_error', 'İstek anahtarı gereklidir.', 400)
    return key


def _visible_replay(scope, row: IslenenKonu) -> dict:
    _plan_or_404(scope, row.term_id, row.class_lesson_plan_id)
    return _public(row)


def create_topic(request, scope, plan_id: int) -> tuple[dict, int]:
    from .views import _body

    data = _body(request)
    key = _idempotency_key(request)
    prior = (
        IslenenKonu.objects.filter(created_by=request.mobile_user, idempotency_key=key)
        .select_related('topic')
        .prefetch_related('kazanimlar__outcome')
        .first()
    )
    if prior is not None:
        return _visible_replay(scope, prior), 200
    term_id = _optional_int(data.get('term_id'), 'Dönem')
    if term_id is None:
        raise MobileAuthError('validation_error', 'Dönem seçilmelidir.', 400)
    term = _load_term(scope, term_id)
    plan = _plan_or_404(scope, term.id, plan_id)
    _require_primary(plan, scope['personel'].id)
    session, cell, session_date = _occurrence(plan, term, data)
    topic = _topic_for_plan(plan, _optional_int(data.get('topic_id'), 'Konu'))
    note = _note(data.get('note'))
    outcome_ids = _outcome_ids(data.get('outcome_ids'))
    if topic is None and not note:
        raise MobileAuthError('validation_error', 'Konu veya not yazılmalıdır.', 400)
    _duplicate(topic, session, cell, session_date)
    context = scope['context']
    try:
        with transaction.atomic():
            row = IslenenKonu.objects.create(
                kurum_id=context['kurum_id'],
                sube_id=context['sube_id'],
                egitim_yili_id=context['egitim_yili_id'],
                term=term,
                class_lesson_plan=plan,
                ogretmen=scope['personel'],
                session_date=session_date,
                lesson_session=session,
                program_grid_cell=cell,
                topic=topic,
                note=note,
                idempotency_key=key,
                created_by=request.mobile_user,
            )
            _bind_outcomes(row, topic, outcome_ids)
    except IntegrityError:
        replay = IslenenKonu.objects.filter(
            created_by=request.mobile_user,
            idempotency_key=key,
        ).select_related('topic').prefetch_related('kazanimlar__outcome').first()
        if replay is not None:
            return _visible_replay(scope, replay), 200
        raise MobileAuthError('validation_error', 'Bu konu bu derste zaten işlendi.', 400)
    row = (
        IslenenKonu.objects.select_related('topic')
        .prefetch_related('kazanimlar__outcome')
        .get(pk=row.pk)
    )
    return _public(row), 201


def _load_owned(request, scope, record_id: int) -> IslenenKonu:
    row = (
        IslenenKonu.objects.filter(id=record_id)
        .select_related('topic', 'class_lesson_plan')
        .prefetch_related('kazanimlar__outcome')
        .first()
    )
    if row is None:
        raise MobileAuthError('not_found', 'Kayıt bulunamadı.', 404)
    plan = _plan_or_404(scope, row.term_id, row.class_lesson_plan_id)
    _require_primary(plan, scope['personel'].id)
    if row.created_by_id != request.mobile_user.id:
        raise MobileAuthError('forbidden', 'Bu kaydı yalnız yazan öğretmen değiştirebilir.', 403)
    stamp = (request.headers.get('If-Match') or '').strip()
    if stamp != _stamp(row.updated_at):
        raise MobileAuthError('conflict', 'Kayıt başka bir yerde güncellendi.', 409)
    return row


def update_topic(request, scope, record_id: int) -> dict:
    from .views import _body

    row = _load_owned(request, scope, record_id)
    data = _body(request)
    previous_topic_id = row.topic_id
    topic = row.topic
    if 'topic_id' in data:
        topic = _topic_for_plan(row.class_lesson_plan, _optional_int(data.get('topic_id'), 'Konu'))
    note = row.note if 'note' not in data else _note(data.get('note'))
    if topic is None and not note:
        raise MobileAuthError('validation_error', 'Konu veya not yazılmalıdır.', 400)
    if topic is not None and topic.id != row.topic_id:
        _duplicate(topic, row.lesson_session, row.program_grid_cell, row.session_date)
    outcome_ids = _outcome_ids(data.get('outcome_ids')) if 'outcome_ids' in data else None
    row.topic = topic
    row.note = note
    try:
        with transaction.atomic():
            row.save(update_fields=['topic', 'note', 'updated_at'])
            if outcome_ids is not None:
                _bind_outcomes(row, topic, outcome_ids)
            elif topic is None or topic.id != previous_topic_id:
                _bind_outcomes(row, topic, [])
    except IntegrityError:
        raise MobileAuthError('validation_error', 'Bu konu bu derste zaten işlendi.', 400)
    row = (
        IslenenKonu.objects.select_related('topic')
        .prefetch_related('kazanimlar__outcome')
        .get(pk=row.pk)
    )
    return _public(row)


def delete_topic(request, scope, record_id: int) -> dict:
    row = _load_owned(request, scope, record_id)
    row.delete()
    return {'code': 'ok', 'message': 'Kayıt silindi.'}
