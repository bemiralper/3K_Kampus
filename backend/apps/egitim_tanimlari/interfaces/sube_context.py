"""Zorunlu şube bağlamı — eğitim tanımları API."""
from django.http import JsonResponse

from shared.context import get_secili_kurum_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error(err):
    return JsonResponse({'error': err['error']}, status=err['status'])


def mandatory_tanim_context(request):
    """
    Liste/oluşturma için zorunlu kurum + şube.

    Returns:
        (ctx, None) veya (None, JsonResponse)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error(err)

    return {'kurum_id': kurum_id, 'sube_id': sube_id}, None


def assert_tanim_record_access(request, kurum_id, record_sube_id):
    err = _assert_record(request, kurum_id, record_sube_id)
    if err:
        return _error(err)
    return None
