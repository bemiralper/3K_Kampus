"""Zorunlu şube — eğitim paketleri API."""
from django.http import JsonResponse

from shared.context import get_secili_egitim_yili_id, get_secili_kurum_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def mandatory_paket_context(request):
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'success': False, 'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, JsonResponse({'success': False, 'error': err['error']}, status=err['status'])

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': get_secili_egitim_yili_id(request),
    }, None


def assert_paket_record_access(request, kurum_id, record):
    if record is None:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    err = _assert_record(request, kurum_id, record.sube_id)
    if err:
        return JsonResponse({'success': False, 'error': err['error']}, status=err['status'])
    return None
