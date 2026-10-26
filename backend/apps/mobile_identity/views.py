"""Mobil kimlik uçları. Jeton uçları oturum çerezi açmaz.

Öğretmen okuması, sitede açılmış oturumu da kabul eder. Jeton yolu aynı kalır.
"""
import json

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import CsrfViewMiddleware
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .services import (
    MobileAuthError,
    change_mobile_password,
    login_with_password,
    logout_refresh,
    mobile_context,
    mobile_me,
    rotate_refresh,
    teacher_me,
    user_from_access,
)


def _error(code: str, message: str, status: int) -> JsonResponse:
    return JsonResponse(
        {'code': code, 'message': message, 'details': {}},
        status=status,
    )


def _disabled():
    if not getattr(settings, 'MOBILE_IDENTITY_ENABLED', False):
        return _error('not_found', 'Bu adres kullanılamıyor.', 404)
    return None


def _body(request) -> dict:
    try:
        data = json.loads(request.body or b'{}')
    except json.JSONDecodeError:
        raise MobileAuthError('validation_error', 'Geçersiz JSON formatı.', 400)
    if not isinstance(data, dict):
        raise MobileAuthError('validation_error', 'Geçersiz JSON formatı.', 400)
    return data


def _bearer(request) -> str:
    header = request.headers.get('Authorization') or ''
    scheme, _, token = header.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
    return token.strip()


def _bind_access(request):
    user, session = user_from_access(_bearer(request))
    request.mobile_user = user
    request.mobile_session = session


def _csrf_view(request):
    return HttpResponse()


def _reject_missing_csrf(request):
    rejected = CsrfViewMiddleware(lambda req: HttpResponse()).process_view(request, _csrf_view, (), {})
    if rejected is not None:
        raise MobileAuthError('csrf_failed', 'Oturum doğrulanamadı.', 403)


def bind_teacher_actor(request):
    """Jeton varsa mobil oturum. Yoksa sitedeki giriş. Site yazmaları CSRF ister."""
    header = request.headers.get('Authorization') or ''
    if header.strip():
        _bind_access(request)
        return
    user = getattr(request, 'user', None)
    if user is None or not getattr(user, 'is_authenticated', False):
        raise MobileAuthError('unauthenticated', 'Oturum geçersiz veya süresi doldu.', 401)
    if request.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
        _reject_missing_csrf(request)
    request.mobile_user = user
    request.mobile_session = None


@csrf_exempt
@require_POST
def token_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        data = _body(request)
        username = data.get('username') or ''
        password = (data.get('password') or '').strip()
        device_key = (data.get('device_id') or '').strip()
        if not str(username).strip() or not password or not device_key or len(device_key) > 128:
            raise MobileAuthError(
                'validation_error',
                'Kullanıcı adı, şifre ve cihaz kimliği gereklidir.',
                400,
            )
        payload = login_with_password(request, str(username), password, device_key)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse(payload)


@csrf_exempt
@require_POST
def refresh_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        data = _body(request)
        refresh = data.get('refresh') or ''
        if not isinstance(refresh, str) or not refresh.strip():
            raise MobileAuthError('validation_error', 'Yenileme jetonu gereklidir.', 400)
        payload = rotate_refresh(refresh.strip())
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse(payload)


@csrf_exempt
@require_POST
def logout_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        data = _body(request)
        refresh = data.get('refresh') or ''
        if not isinstance(refresh, str) or not refresh.strip():
            raise MobileAuthError('validation_error', 'Yenileme jetonu gereklidir.', 400)
        logout_refresh(refresh.strip())
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse({'code': 'ok', 'message': 'Çıkış yapıldı.', 'details': {}})


@csrf_exempt
@require_GET
def context_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        _bind_access(request)
        payload = mobile_context(request)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse(payload)


@csrf_exempt
@require_POST
def change_password_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        _bind_access(request)
        data = _body(request)
        change_mobile_password(
            request,
            data.get('current_password') or '',
            data.get('new_password') or '',
            data.get('new_password_confirm') or '',
        )
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse({
        'code': 'ok',
        'message': 'Şifre güncellendi. Yeniden giriş yapın.',
        'details': {},
    })


@csrf_exempt
@require_GET
def me_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        _bind_access(request)
        payload = mobile_me(request)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse(payload)


@csrf_exempt
@require_GET
def teacher_me_api(request):
    blocked = _disabled()
    if blocked is not None:
        return blocked
    try:
        bind_teacher_actor(request)
        payload = teacher_me(request)
    except MobileAuthError as exc:
        return _error(exc.code, exc.message, exc.status)
    return JsonResponse(payload)
