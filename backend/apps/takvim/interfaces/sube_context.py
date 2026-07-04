"""Mandatory şube bağlamı — takvim list/read endpoint'leri."""
from django.http import JsonResponse

from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def resolve_mandatory_takvim_sube(request, kurum_id):
    """
    Zorunlu şube bağlamını çözümler.

    Returns:
        (sube_id, None) başarılı
        (None, JsonResponse) hata
    """
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, JsonResponse({'success': False, 'error': err['error']}, status=err['status'])
    return sube_id, None


def assert_takvim_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(
        request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube,
    )
    if err:
        return JsonResponse({'success': False, 'error': err['error']}, status=err['status'])
    return None
