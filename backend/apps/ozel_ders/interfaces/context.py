"""Şube/kurum bağlamı — academic pattern ile uyumlu."""
import json
from datetime import date, datetime

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from shared.permissions import require_module_permission
from shared.sube_context import resolve_mandatory_sube


def mandatory_ozel_ders_context(request):
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse(
            {'success': False, 'error': 'Kurum bağlamı zorunludur.'},
            status=400,
        )
    sube_id, err = resolve_mandatory_sube(request, kurum_id)
    if err:
        return None, JsonResponse(
            {'success': False, 'error': err['error']},
            status=err['status'],
        )
    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': get_secili_egitim_yili_id(request),
    }, None


def json_body(request) -> dict:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def parse_date_field(value):
    if value in (None, ''):
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value)[:10])


def error_response(exc):
    from apps.ozel_ders.services.errors import OzelDersError
    if isinstance(exc, OzelDersError):
        return JsonResponse(
            {'success': False, 'error': exc.message, 'code': exc.code},
            status=exc.status,
        )
    raise exc


def ozel_ders_api(methods=('GET',)):
    """Login + ozel_ders module permission + HTTP methods."""

    def decorator(view_func):
        wrapped = require_module_permission('ozel_ders')(view_func)
        return require_http_methods(list(methods))(wrapped)

    return decorator
