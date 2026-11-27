"""
Öğrenci Portalı — Koç Ödevleri & Zengin İçerik Ağacı Servisi (`homework_service.py`).

Sıfır şema değişikliği ve %100 Kontrol Kilidi (`lock_utils.py`) koruması:
- Öğrencinin kendi ön-hazırlık işaretlemeleri ("Çözdüm / Hazırım") koçun resmi
  `AssignmentTask.completion_status` veya `AssignmentTask.status` alanlarına KESİNLİKLE dokunmaz;
  `StudentPortalAccount.preferences['prepared_task_ids']` içinde izole tutulur.
- Koçun özel notu (`ManualAssignment.coach_notes`) öğrenci yanıtlarında asla yer almaz.
- Odak sayacı süresi `AssignmentTask.actual_duration_minutes`, öğrenci test notu
  `AssignmentTask.student_feedback` ve genel ödev notu `ManualAssignment.student_notes`
  alanlarına güvenli `update_fields` ile kaydedilir.
"""
from __future__ import annotations

from datetime import date

from django.db import transaction
from django.utils import timezone

from apps.coaching.assignment_manual.assignment_notify_utils import build_assignment_pdf_filename
from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.assignment_manual.title_utils import strip_completion_title_suffix

from ..auth import ISTANBUL, StudentPortalError
from ..models import StudentPortalAccount
from .schedule_service import subject_color

NON_SUBMISSION_LABELS = {
    'CONTROL_NOT_POSSIBLE': 'Ödev kontrolü yapılamadı',
    'NOT_BROUGHT': 'Ödev getirilmedi',
    'NOT_DONE': 'Ödev yapılmadı',
    'OTHER': 'Diğer',
}


def get_student_prepared_task_ids(account: StudentPortalAccount | None) -> set[int]:
    if account is None or not isinstance(account.preferences, dict):
        return set()
    raw = account.preferences.get('prepared_task_ids')
    if not isinstance(raw, list):
        return set()
    result: set[int] = set()
    for val in raw:
        try:
            iv = int(val)
            if iv > 0:
                result.add(iv)
        except (TypeError, ValueError):
            continue
    return result


def get_prepared_task_ids_for_student_id(student_id: int) -> set[int]:
    """Koç Ödev Kontrol ekranı (detail serializer) için tek sorguda hazırlık kümesi."""
    account = (
        StudentPortalAccount.objects.filter(ogrenci_id=student_id)
        .only('preferences')
        .first()
    )
    return get_student_prepared_task_ids(account)


def _local_due_date(dt_val) -> date | None:
    if not dt_val:
        return None
    if hasattr(dt_val, 'date'):
        if timezone.is_aware(dt_val):
            return timezone.localtime(dt_val, ISTANBUL).date()
        return dt_val.date()
    return dt_val


def _local_iso(dt_val) -> str | None:
    if not dt_val:
        return None
    if hasattr(dt_val, 'date'):
        if timezone.is_aware(dt_val):
            return timezone.localtime(dt_val, ISTANBUL).isoformat(timespec='minutes')
        return dt_val.isoformat()
    return dt_val.isoformat()


def _book_cover_url(book) -> str | None:
    if book is None:
        return None
    if getattr(book, 'kapak', None):
        try:
            return book.kapak.url
        except Exception:
            pass
    if getattr(book, 'kapak_url', ''):
        return book.kapak_url
    return None


def _effective_lesson_name(lesson_block: AssignmentLesson) -> str:
    book = getattr(lesson_block, 'resource_book', None)
    if book is not None and getattr(book, 'ders_id', None) and getattr(book, 'ders', None):
        return book.ders.ad or ''
    if lesson_block.lesson_id and lesson_block.lesson:
        return lesson_block.lesson.ad or ''
    return lesson_block.topic_name or 'Genel'


def _serialize_task(
    task: AssignmentTask,
    lesson_block: AssignmentLesson,
    *,
    subject_name: str,
    book_name: str,
    prepared_ids: set[int],
) -> dict:
    content = getattr(task, 'content', None)
    topic_obj = getattr(content, 'topic', None) if content is not None else None
    unit_obj = getattr(topic_obj, 'unit', None) if topic_obj is not None else None

    live_title = getattr(content, 'ad', None) if content is not None else None
    raw_title = live_title or task.title or task.get_task_type_display()
    clean_title = strip_completion_title_suffix(raw_title) or raw_title

    page_start = (
        getattr(content, 'page_start', None)
        if content is not None and getattr(content, 'page_start', None)
        else lesson_block.page_start
    )
    page_end = (
        getattr(content, 'page_end', None)
        if content is not None and getattr(content, 'page_end', None)
        else lesson_block.page_end
    )
    content_est = getattr(content, 'estimated_minutes', None) if content is not None else None
    target_minutes = (
        task.estimated_duration_minutes
        or lesson_block.k3_target_minutes
        or content_est
        or None
    )

    if task.question_count is None:
        remaining_q = None
    elif task.completion_status == AssignmentTask.CompletionStatus.PENDING:
        remaining_q = task.question_count
    else:
        remaining_q = max(0, task.question_count - int(task.completed_question_count or 0))

    is_prepared = task.id in prepared_ids
    is_coach_evaluated = task.completion_status != AssignmentTask.CompletionStatus.PENDING

    return {
        'id': task.id,
        'lesson_block_id': lesson_block.id,
        'assignment_id': lesson_block.assignment_id,
        'order': task.order,
        'title': clean_title,
        'description': task.description or '',
        'subject': subject_name,
        'book_name': book_name,
        'color': subject_color(subject_name),
        'unit_name': unit_obj.ad if unit_obj else '',
        'topic_name': (topic_obj.ad if topic_obj else '') or lesson_block.topic_name or '',
        'task_type': task.task_type,
        'task_type_label': task.get_task_type_display(),
        'quota_kind': task.quota_kind or '',
        'quota_kind_label': task.get_quota_kind_display() if task.quota_kind else '',
        'is_required': task.is_required,
        'question_count': task.question_count,
        'completed_question_count': task.completed_question_count,
        'remaining_question_count': remaining_q,
        'page_count': task.page_count,
        'page_start': page_start,
        'page_end': page_end,
        'video_url': (getattr(content, 'video_url', '') or '') if content is not None else '',
        'target_minutes': int(target_minutes) if target_minutes else None,
        'estimated_duration_minutes': task.estimated_duration_minutes,
        'k3_mode': lesson_block.k3_mode or '',
        'k3_mode_label': lesson_block.get_k3_mode_display() or '',
        'actual_duration_minutes': int(task.actual_duration_minutes or 0),
        'student_prepared': is_prepared,
        'effective_ready': is_prepared or task.completion_status == AssignmentTask.CompletionStatus.DONE,
        'student_feedback': task.student_feedback or '',
        'is_coach_evaluated': is_coach_evaluated,
        'completion_status': task.completion_status,
        'completion_status_label': task.get_completion_status_display(),
        'task_completion_percent': task.task_completion_percent,
        'coach_evaluation_note': task.coach_evaluation_note or '',
        'evaluated_at': _local_iso(task.evaluated_at),
        'is_completion_task': task.is_completion_task,
        'previous_assignment_title': task.previous_assignment_title or '',
        'previous_task_completion_percent': task.previous_task_completion_percent,
    }


def _serialize_lesson_block(lesson_block: AssignmentLesson, prepared_ids: set[int]) -> dict:
    subject_name = _effective_lesson_name(lesson_block)
    book = getattr(lesson_block, 'resource_book', None)
    book_name = book.ad if book else ''
    publisher_name = (
        book.publisher.ad
        if (book and getattr(book, 'publisher_id', None) and book.publisher)
        else ''
    )

    tasks_payload = [
        _serialize_task(
            t,
            lesson_block,
            subject_name=subject_name,
            book_name=book_name,
            prepared_ids=prepared_ids,
        )
        for t in lesson_block.tasks.all()
    ]
    total_q = sum(int(t['question_count'] or 0) for t in tasks_payload)
    ready_cnt = sum(1 for t in tasks_payload if t['effective_ready'])
    done_cnt = sum(1 for t in tasks_payload if t['completion_status'] == 'DONE')
    focused_mins = sum(int(t['actual_duration_minutes'] or 0) for t in tasks_payload)

    return {
        'id': lesson_block.id,
        'order': lesson_block.order,
        'lesson_name': subject_name,
        'color': subject_color(subject_name),
        'book': {
            'id': book.id,
            'name': book_name,
            'publisher': publisher_name,
            'cover_url': _book_cover_url(book),
        } if book else None,
        'content_mode': lesson_block.content_mode,
        'content_mode_label': lesson_block.get_content_mode_display(),
        'topic_name': lesson_block.topic_name or '',
        'page_start': lesson_block.page_start,
        'page_end': lesson_block.page_end,
        'test_number': lesson_block.test_number or '',
        'k3_mode': lesson_block.k3_mode or '',
        'k3_mode_label': lesson_block.get_k3_mode_display() or '',
        'k3_target_minutes': lesson_block.k3_target_minutes,
        'notes': lesson_block.notes or '',
        'task_count': len(tasks_payload),
        'ready_task_count': ready_cnt,
        'coach_done_count': done_cnt,
        'question_count': total_q,
        'focused_minutes': focused_mins,
        'tasks': tasks_payload,
    }


def _base_student_assignments_qs(student_id: int):
    return (
        ManualAssignment.objects.select_related('coach')
        .prefetch_related(
            'lessons__lesson',
            'lessons__resource_book__ders',
            'lessons__resource_book__publisher',
            'lessons__tasks__content__topic__unit',
        )
        .filter(student_id=student_id, is_active=True)
        .exclude(status__in=[ManualAssignment.Status.DRAFT, ManualAssignment.Status.CANCELLED])
    )


def _serialize_assignment_card(
    ma: ManualAssignment,
    *,
    today: date,
    prepared_ids: set[int],
    include_tree: bool = False,
) -> dict:
    lessons_payload = [_serialize_lesson_block(lb, prepared_ids) for lb in ma.lessons.all()]

    subjects_seen: list[dict] = []
    seen_names: set[str] = set()
    books_seen: list[str] = []
    for lp in lessons_payload:
        sname = lp['lesson_name'] or 'Genel'
        if sname not in seen_names:
            seen_names.add(sname)
            subjects_seen.append({'name': sname, 'color': lp['color']})
        if lp['book'] and lp['book']['name'] and lp['book']['name'] not in books_seen:
            books_seen.append(lp['book']['name'])

    all_tasks = [t for lp in lessons_payload for t in lp['tasks']]
    task_count = len(all_tasks)
    ready_count = sum(1 for t in all_tasks if t['effective_ready'])
    student_prepared_only = sum(1 for t in all_tasks if t['student_prepared'])
    evaluated_count = sum(1 for t in all_tasks if t['is_coach_evaluated'])
    done_count = sum(1 for t in all_tasks if t['completion_status'] == 'DONE')
    partial_count = sum(1 for t in all_tasks if t['completion_status'] == 'PARTIAL')
    not_done_count = sum(1 for t in all_tasks if t['completion_status'] == 'NOT_DONE')
    question_count = sum(int(t['question_count'] or 0) for t in all_tasks)
    focused_minutes = sum(int(t['actual_duration_minutes'] or 0) for t in all_tasks)

    due_day = _local_due_date(ma.due_date)
    days_left = (due_day - today).days if due_day else None
    is_completed = ma.status == ManualAssignment.Status.COMPLETED
    is_overdue = bool(not is_completed and due_day and due_day < today)
    is_due_today = bool(not is_completed and due_day and due_day == today)

    effective_status = 'OVERDUE' if is_overdue else ma.status
    status_label = 'Kontrol Tarihi Geçti' if is_overdue else ma.get_status_display()
    student_ready_pct = round((ready_count / task_count) * 100) if task_count > 0 else 0

    coach_name = ''
    if ma.coach:
        coach_name = ma.coach.get_full_name() or ma.coach.username

    clean_title = strip_completion_title_suffix(ma.title) or ma.title
    first_subject = subjects_seen[0]['name'] if subjects_seen else 'Genel'
    first_color = subjects_seen[0]['color'] if subjects_seen else '#0262a7'
    first_topic = lessons_payload[0]['topic_name'] if lessons_payload else ''

    card = {
        'id': ma.id,
        'title': clean_title,
        'description': ma.description or '',
        'coach_name': coach_name,
        'subject': first_subject,
        'color': first_color,
        'topic': first_topic,
        'subjects': subjects_seen,
        'books': books_seen,
        'status': effective_status,
        'raw_status': ma.status,
        'status_label': status_label,
        'priority': ma.priority,
        'priority_label': ma.get_priority_display(),
        'assigned_date': _local_iso(ma.assigned_date) or _local_iso(ma.created_at),
        'due_date': due_day.isoformat() if due_day else None,
        'due_datetime': _local_iso(ma.due_date),
        'completed_date': _local_iso(ma.completed_date),
        'days_left': days_left,
        'is_overdue': is_overdue,
        'is_due_today': is_due_today,
        'is_completed': is_completed,
        'lesson_count': len(lessons_payload),
        'task_count': task_count,
        'ready_task_count': ready_count,
        'student_prepared_count': student_prepared_only,
        'student_ready_percent': student_ready_pct,
        'evaluated_task_count': evaluated_count,
        'done_task_count': done_count,
        'partial_task_count': partial_count,
        'not_done_task_count': not_done_count,
        'completion_percent': ma.completion_percent,
        'question_count': question_count,
        'focused_minutes': focused_minutes,
        'estimated_minutes': ma.estimated_duration_minutes,
        'difficulty_level': ma.difficulty_level,
        'postpone_count': ma.postpone_count,
        'postpone_reason': ma.postpone_reason or '',
        'non_submission_reason': ma.non_submission_reason or '',
        'non_submission_label': NON_SUBMISSION_LABELS.get(ma.non_submission_reason or '', ''),
        'non_submission_note': ma.non_submission_note or '',
        'late_submission_note': ma.late_submission_note or '',
        'student_notes': ma.student_notes or '',
        'can_download_plan_pdf': True,
        'can_download_report_pdf': bool(is_completed or evaluated_count > 0 or ma.non_submission_reason),
    }
    if include_tree:
        card['lessons'] = lessons_payload
    else:
        card['lessons'] = [
            {
                'id': lp['id'],
                'lesson_name': lp['lesson_name'],
                'topic_name': lp['topic_name'],
                'book_name': lp['book']['name'] if lp['book'] else '',
                'color': lp['color'],
                'k3_mode': lp['k3_mode'],
                'k3_mode_label': lp['k3_mode_label'],
                'task_count': lp['task_count'],
                'ready_task_count': lp['ready_task_count'],
            }
            for lp in lessons_payload
        ]
    return card


def list_student_assignments(scope: dict) -> dict:
    """Öğrencinin tüm aktif ve geçmiş koç ödevlerini KPI özetiyle döndürür."""
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    prepared_ids = get_student_prepared_task_ids(scope.get('account'))
    rows = list(_base_student_assignments_qs(scope['ogrenci'].id).order_by('-due_date', '-id')[:50])

    cards = [
        _serialize_assignment_card(ma, today=today, prepared_ids=prepared_ids, include_tree=False)
        for ma in rows
    ]

    # Sıralama: Önce aktif/bugün/gecikmiş ödevler (en yakın teslim tarihine göre), sonra tamamlananlar
    cards.sort(
        key=lambda c: (
            1 if c['is_completed'] else 0,
            c['due_date'] or '9999-12-31',
            -c['id'],
        )
    )

    active_cards = [c for c in cards if not c['is_completed']]
    completed_cards = [c for c in cards if c['is_completed']]
    overdue_cards = [c for c in active_cards if c['is_overdue']]

    total_active_tasks = sum(c['task_count'] for c in active_cards)
    ready_active_tasks = sum(c['ready_task_count'] for c in active_cards)
    total_focused_minutes = sum(c['focused_minutes'] for c in cards)
    next_due = active_cards[0] if active_cards else None

    return {
        'today': today.isoformat(),
        'summary': {
            'total_count': len(cards),
            'active_count': len(active_cards),
            'completed_count': len(completed_cards),
            'overdue_count': len(overdue_cards),
            'active_task_count': total_active_tasks,
            'ready_active_task_count': ready_active_tasks,
            'active_ready_percent': (
                round((ready_active_tasks / total_active_tasks) * 100)
                if total_active_tasks > 0
                else 0
            ),
            'total_focused_minutes': total_focused_minutes,
            'next_due': {
                'id': next_due['id'],
                'title': next_due['title'],
                'due_date': next_due['due_date'],
                'days_left': next_due['days_left'],
                'is_overdue': next_due['is_overdue'],
                'is_due_today': next_due['is_due_today'],
                'ready_task_count': next_due['ready_task_count'],
                'task_count': next_due['task_count'],
            } if next_due else None,
        },
        'items': cards,
    }


def get_student_assignment_detail(scope: dict, assignment_id: int) -> dict:
    """Seçili ödevin Kitap -> Ünite/Konu -> Test ağacını döndürür."""
    today = timezone.localtime(timezone.now(), ISTANBUL).date()
    ma = _base_student_assignments_qs(scope['ogrenci'].id).filter(id=assignment_id).first()
    if ma is None:
        raise StudentPortalError('not_found', 'Ödev bulunamadı.', 404)

    prepared_ids = get_student_prepared_task_ids(scope.get('account'))
    return _serialize_assignment_card(ma, today=today, prepared_ids=prepared_ids, include_tree=True)


@transaction.atomic
def update_student_assignment_task(
    scope: dict,
    task_id: int,
    *,
    prepared: bool | None = None,
    add_duration_minutes: int | None = None,
    actual_duration_minutes: int | None = None,
    student_feedback: str | None = None,
) -> dict:
    """
    Öğrencinin test bazlı ön-hazırlık tik'ini (`prepared`), odak süresini
    (`actual_duration_minutes`) ve test notunu (`student_feedback`) günceller.
    Koçun `completion_status`, `status` ve kontrol kilidi alanlarına KESİNLİKLE dokunmaz.
    """
    task = (
        AssignmentTask.objects.select_related(
            'lesson_block',
            'lesson_block__assignment',
            'lesson_block__lesson',
            'lesson_block__resource_book__ders',
            'lesson_block__resource_book__publisher',
            'content__topic__unit',
        )
        .filter(
            id=task_id,
            lesson_block__assignment__student_id=scope['ogrenci'].id,
            lesson_block__assignment__is_active=True,
        )
        .exclude(
            lesson_block__assignment__status__in=[
                ManualAssignment.Status.DRAFT,
                ManualAssignment.Status.CANCELLED,
            ]
        )
        .first()
    )
    if task is None:
        raise StudentPortalError('not_found', 'Ödev görevi bulunamadı.', 404)

    account: StudentPortalAccount = scope['account']
    prefs = dict(account.preferences) if isinstance(account.preferences, dict) else {}
    prepared_ids = get_student_prepared_task_ids(account)

    if prepared is not None:
        if prepared:
            prepared_ids.add(task.id)
        else:
            prepared_ids.discard(task.id)
        # Son 2000 görev kimliğini sıralı sakla
        prefs['prepared_task_ids'] = sorted(prepared_ids)[-2000:]
        account.preferences = prefs
        account.save(update_fields=['preferences', 'updated_at'])

    task_update_fields: list[str] = []
    if add_duration_minutes is not None:
        if add_duration_minutes < 0 or add_duration_minutes > 600:
            raise StudentPortalError('validation_error', 'Odak süresi geçersiz.', 400)
        task.actual_duration_minutes = int(task.actual_duration_minutes or 0) + int(add_duration_minutes)
        task_update_fields.append('actual_duration_minutes')
    elif actual_duration_minutes is not None:
        if actual_duration_minutes < 0 or actual_duration_minutes > 600:
            raise StudentPortalError('validation_error', 'Odak süresi geçersiz.', 400)
        task.actual_duration_minutes = int(actual_duration_minutes)
        task_update_fields.append('actual_duration_minutes')

    if student_feedback is not None:
        task.student_feedback = str(student_feedback).strip()[:1000]
        task_update_fields.append('student_feedback')

    if task_update_fields:
        task_update_fields.append('updated_at')
        task.save(update_fields=task_update_fields)

    lb = task.lesson_block
    subject_name = _effective_lesson_name(lb)
    book_name = lb.resource_book.ad if lb.resource_book else ''
    return {
        'task': _serialize_task(
            task,
            lb,
            subject_name=subject_name,
            book_name=book_name,
            prepared_ids=prepared_ids,
        ),
        'assignment_id': lb.assignment_id,
    }


@transaction.atomic
def update_student_assignment_note(
    scope: dict,
    assignment_id: int,
    *,
    student_notes: str,
) -> dict:
    """Öğrencinin genel ödev notunu (`ManualAssignment.student_notes`) kaydeder."""
    ma = (
        ManualAssignment.objects.filter(
            id=assignment_id,
            student_id=scope['ogrenci'].id,
            is_active=True,
        )
        .exclude(status__in=[ManualAssignment.Status.DRAFT, ManualAssignment.Status.CANCELLED])
        .first()
    )
    if ma is None:
        raise StudentPortalError('not_found', 'Ödev bulunamadı.', 404)

    ma.student_notes = (student_notes or '').strip()[:1500]
    ma.save(update_fields=['student_notes', 'updated_at'])
    return {
        'assignment_id': ma.id,
        'student_notes': ma.student_notes,
    }


def render_student_assignment_pdf(
    scope: dict,
    assignment_id: int,
    *,
    kind: str = 'plan',
    orientation: str = 'portrait',
) -> tuple[bytes, str]:
    """
    Öğrencinin kendi ödev planı (`kind="plan"`) veya kontrol raporu (`kind="report"`)
    PDF'ini mevcut `report_pdf_service` üzerinden üretir.
    """
    ma = (
        _base_student_assignments_qs(scope['ogrenci'].id)
        .select_related('student')
        .filter(id=assignment_id)
        .first()
    )
    if ma is None:
        raise StudentPortalError('not_found', 'Ödev bulunamadı.', 404)

    pdf_kind = 'report' if str(kind).lower() == 'report' else 'plan'
    orient = 'landscape' if str(orientation).lower() == 'landscape' else 'portrait'

    if pdf_kind == 'report':
        evaluated_any = any(
            t.completion_status != AssignmentTask.CompletionStatus.PENDING
            for lb in ma.lessons.all()
            for t in lb.tasks.all()
        )
        if (
            ma.status != ManualAssignment.Status.COMPLETED
            and not evaluated_any
            and not ma.non_submission_reason
        ):
            raise StudentPortalError(
                'report_not_ready',
                'Koç kontrolü henüz yapılmadığı için kontrol raporu oluşmadı. Ödev Planı PDF’ini indirebilirsiniz.',
                400,
            )

    from apps.coaching.assignment_manual.report_pdf_service import (
        render_assignment_plan_pdf,
        render_assignment_report_pdf,
    )

    try:
        if pdf_kind == 'report':
            pdf_bytes = render_assignment_report_pdf(ma.id, scope['kurum_id'], orientation=orient)
        else:
            pdf_bytes = render_assignment_plan_pdf(ma.id, scope['kurum_id'], orientation=orient)
    except Exception as exc:
        raise StudentPortalError(
            'pdf_render_failed',
            f'Ödev PDF belgesi şu anda oluşturulamadı: {exc}',
            500,
        )

    filename = build_assignment_pdf_filename(ma, pdf_kind)
    return pdf_bytes, filename
