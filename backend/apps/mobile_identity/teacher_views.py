"""Öğretmen salt okuma uçları."""
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .services import PORTAL_TEACHER, MobileAuthError, mobile_context, open_teacher_scope
from .teacher_exams import student_exams
from .teacher_read import (
    list_classes,
    list_private_students,
    list_students,
    list_terms,
    student_card,
    teacher_profile,
    teacher_home,
    teacher_schedule,
)
from .teacher_boards import end_board, list_boards, pair_board, show_lesson
from .teacher_notifications import list_notifications
from .teacher_notes import (
    create_lesson_note,
    delete_lesson_note,
    lesson_note_link,
    list_lesson_notes,
    open_lesson_note,
    open_lesson_note_from_view,
    preview_catalog,
    preview_page,
)
from .teacher_topics import (
    create_topic,
    delete_topic,
    list_topic_catalog,
    list_topics,
    update_topic,
)
from .views import _disabled, _error, bind_teacher_actor


def _read(request, handler, *args):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        bind_teacher_actor(request)
        scope = open_teacher_scope(request)
        return JsonResponse(handler(request, scope, *args))
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_GET
def profile_api(request):
    return _read(request, teacher_profile)


@csrf_exempt
@require_GET
def terms_api(request):
    return _read(request, lambda request, scope: list_terms(scope))


@csrf_exempt
@require_GET
def home_api(request):
    return _read(request, teacher_home)


@csrf_exempt
@require_GET
def schedule_api(request):
    return _read(request, teacher_schedule)


@csrf_exempt
@require_GET
def classes_api(request):
    return _read(request, list_classes)


@csrf_exempt
@require_GET
def students_api(request):
    return _read(request, list_students)


@csrf_exempt
@require_GET
def student_api(request, student_id):
    return _read(request, student_card, student_id)


@csrf_exempt
@require_GET
def student_exams_api(request, student_id):
    return _read(request, student_exams, student_id)


@csrf_exempt
@require_GET
def private_students_api(request):
    return _read(request, list_private_students)


def _mutate(request, handler, *args):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        bind_teacher_actor(request)
        scope = open_teacher_scope(request)
        result = handler(request, scope, *args)
        if isinstance(result, tuple):
            payload, status = result
            return JsonResponse(payload, status=status)
        return JsonResponse(result)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_GET
def topic_catalog_api(request, plan_id):
    return _read(request, list_topic_catalog, plan_id)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def class_topics_api(request, plan_id):
    if request.method == 'GET':
        return _read(request, list_topics, plan_id)
    return _mutate(request, create_topic, plan_id)


@csrf_exempt
@require_GET
def notifications_api(request):
    return _read(request, list_notifications)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def boards_api(request):
    if request.method == 'GET':
        return _read(request, list_boards)
    return _mutate(request, pair_board)


@csrf_exempt
@require_POST
def board_show_api(request, board_id):
    return _mutate(request, show_lesson, board_id)


@csrf_exempt
@require_POST
def board_end_api(request, board_id):
    return _mutate(request, end_board, board_id)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def class_notes_api(request, plan_id):
    if request.method == 'GET':
        return _read(request, list_lesson_notes, plan_id)
    return _mutate(request, create_lesson_note, plan_id)


def _file_response(payload):
    response = HttpResponse(payload['content'], content_type=payload['mime'])
    if payload.get('disposition'):
        response['Content-Disposition'] = payload['disposition']
    response['Accept-Ranges'] = 'bytes'
    return response


@csrf_exempt
@require_http_methods(['DELETE'])
def lesson_note_api(request, note_id):
    return _mutate(request, delete_lesson_note, note_id)


@csrf_exempt
@require_POST
def lesson_note_link_api(request, note_id):
    return _mutate(request, lesson_note_link, note_id)


@csrf_exempt
@require_GET
def lesson_note_preview_api(request, note_id):
    return _read(request, preview_catalog, note_id)


@csrf_exempt
@require_GET
def lesson_note_preview_page_api(request, note_id, page):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        bind_teacher_actor(request)
        scope = open_teacher_scope(request)
        payload = preview_page(request, scope, note_id, page)
        return _file_response(payload)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_GET
def lesson_note_file_api(request, note_id):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        if request.GET.get('view') and not request.headers.get('Authorization'):
            payload = open_lesson_note_from_view(request, note_id)
        else:
            bind_teacher_actor(request)
            scope = open_teacher_scope(request)
            payload = open_lesson_note(request, scope, note_id)
        if request.GET.get('download') == '1' and str(payload.get('disposition', '')).startswith('inline;'):
            payload['disposition'] = 'attachment' + payload['disposition'][6:]
        return _file_response(payload)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_GET
def teacher_context_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        bind_teacher_actor(request)
        if (request.headers.get('X-Portal') or '').strip() != PORTAL_TEACHER:
            raise MobileAuthError('portal_unavailable', 'Bu portal şu anda açılamaz.', 403)
        return JsonResponse(mobile_context(request))
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def topic_api(request, record_id):
    if request.method == 'PATCH':
        return _mutate(request, update_topic, record_id)
    return _mutate(request, delete_topic, record_id)
