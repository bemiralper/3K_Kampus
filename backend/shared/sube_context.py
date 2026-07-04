"""Zorunlu şube bağlamı — modül-agnostik erişim doğrulama."""
from shared.context import require_mandatory_sube_id
from shared.sube_access import get_allowed_subeler_for_user

SUBE_REQUIRED_MSG = (
    'sube_id parametresi veya aktif şube bağlamı (header/session) zorunludur.'
)
SUBE_FORBIDDEN_MSG = 'Bu şubeye erişim yetkiniz yok.'


def resolve_mandatory_sube(request, kurum_id):
    """
    Zorunlu şube bağlamını çözümler ve kullanıcı erişimini doğrular.

    Returns:
        (sube_id, None) başarılı
        (None, {'error': str, 'status': int}) hata
    """
    sube_id = require_mandatory_sube_id(request, kurum_id=int(kurum_id))
    if not sube_id:
        return None, {'error': SUBE_REQUIRED_MSG, 'status': 400}

    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        allowed = get_allowed_subeler_for_user(user, kurum_id=int(kurum_id))
        if not allowed.filter(id=sube_id).exists():
            return None, {'error': SUBE_FORBIDDEN_MSG, 'status': 403}

    return sube_id, None


def assert_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    """
    Tekil kayıt erişiminde aktif şube bağlamını doğrular.

    Returns:
        None başarılı
        {'error': str, 'status': int} hata
    """
    sube_id, err = resolve_mandatory_sube(request, kurum_id)
    if err:
        return err

    if record_sube_id is None:
        if allow_null_sube:
            return None
        return {'error': 'Kayıt bu şubeye ait değil.', 'status': 403}

    if int(record_sube_id) != int(sube_id):
        return {'error': 'Kayıt bu şubeye ait değil.', 'status': 403}

    return None
