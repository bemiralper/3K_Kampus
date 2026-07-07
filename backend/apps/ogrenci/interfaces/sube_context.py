"""Mandatory şube bağlamı — öğrenci list/read endpoint'leri."""
from django.http import JsonResponse

from apps.egitim_yili.domain.models import EgitimYili
from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from shared.sube_access import get_allowed_subeler_for_user, serialize_sube
from shared.sube_context import SUBE_FORBIDDEN_MSG, SUBE_REQUIRED_MSG, assert_record_sube_access as _assert_record


def _error_response(err):
    return JsonResponse({'error': err['error']}, status=err['status'])


def resolve_mandatory_ogrenci_sube(request, kurum_id):
    """Öğrenci listesi — şube yalnızca üst bar (header/session), query param yok."""
    from shared.context import require_mandatory_sube_id

    sube_id = require_mandatory_sube_id(
        request, kurum_id=int(kurum_id), allow_query_param=False,
    )
    if not sube_id:
        return None, _error_response({'error': SUBE_REQUIRED_MSG, 'status': 400})

    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        allowed = get_allowed_subeler_for_user(user, kurum_id=int(kurum_id))
        if not allowed.filter(id=sube_id).exists():
            return None, _error_response({'error': SUBE_FORBIDDEN_MSG, 'status': 403})

    return sube_id, None


def assert_ogrenci_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(
        request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube,
    )
    if err:
        return _error_response(err)
    return None


def mandatory_ogrenci_context(request):
    """
    Liste/arama endpoint'leri için zorunlu kurum + şube bağlamı.

    Returns:
        (ctx_dict, None) veya (None, JsonResponse)
    """
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = resolve_mandatory_ogrenci_sube(request, kurum_id)
    if err:
        return None, err

    egitim_yili_id = get_secili_egitim_yili_id(request)
    egitim_yili = None
    if egitim_yili_id:
        egitim_yili = EgitimYili.objects.filter(id=egitim_yili_id).first()

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': egitim_yili_id,
        'egitim_yili': egitim_yili,
    }, None


def allowed_subeler_for_request(request, kurum_id):
    """Filtre/wizard dropdown — kullanıcının erişebildiği şubeler."""
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        qs = get_allowed_subeler_for_user(user, kurum_id=int(kurum_id))
    else:
        from apps.sube.domain.models import Sube
        qs = Sube.objects.filter(kurum_id=kurum_id, aktif_mi=True).order_by('ad')
    return [serialize_sube(s) for s in qs]
