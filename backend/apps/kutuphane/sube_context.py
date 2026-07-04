"""Mandatory şube bağlamı — kütüphane modülü endpoint'leri."""
from django.http import JsonResponse

from shared.context import get_secili_kurum_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def _error_response(err):
    return JsonResponse({'success': False, 'error': err['error']}, status=err['status'])


def resolve_mandatory_kutuphane_sube(request, kurum_id):
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, _error_response(err)
    return sube_id, None


def assert_kutuphane_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(
        request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube,
    )
    if err:
        return _error_response(err)
    return None


def mandatory_kutuphane_context(request):
    """
    Liste/oluşturma endpoint'leri için zorunlu kurum + şube bağlamı.

    Returns:
        (ctx_dict, None) veya (None, JsonResponse)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'success': False, 'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_kutuphane_sube(request, kurum_id)
    if err:
        return None, err

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
    }, None
