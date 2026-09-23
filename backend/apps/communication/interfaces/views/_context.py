"""Kurum + şube bağlamı — iletişim API view'ları."""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.interfaces.sube_context import resolve_mandatory_communication_sube

KURUM_FORBIDDEN_MSG = 'Bu kuruma erişim yetkiniz yok.'


def assert_kurum_access(request, kurum_id: int):
    """Kurum üyeliği yoksa 403 Response, varsa None."""
    from shared.kurum_access import user_can_access_kurum

    if user_can_access_kurum(getattr(request, 'user', None), kurum_id):
        return None
    return Response({'error': KURUM_FORBIDDEN_MSG}, status=status.HTTP_403_FORBIDDEN)


def assert_scope_sube_allowed(request, kurum_id: int, sube_id):
    """İstekte kapsam olarak verilen şube kullanıcının erişebildiği şubelerden mi.

    Bildirim eşlemesi gibi "şube seç" parametreli uçlarda aktif şubeden farklı bir
    şube hedeflenebilir; hedef şube de kullanıcı erişimiyle sınırlanır.
    """
    if sube_id in (None, ''):
        return None
    from shared.sube_access import get_allowed_subeler_for_user
    from shared.sube_context import SUBE_FORBIDDEN_MSG

    user = getattr(request, 'user', None)
    if getattr(user, 'is_superuser', False):
        return None
    try:
        sube_id = int(sube_id)
    except (TypeError, ValueError):
        return Response({'error': 'Geçersiz sube_id.'}, status=status.HTTP_400_BAD_REQUEST)
    if not get_allowed_subeler_for_user(user, kurum_id=kurum_id).filter(id=sube_id).exists():
        return Response({'error': SUBE_FORBIDDEN_MSG}, status=status.HTTP_403_FORBIDDEN)
    return None


def assert_channel_config_in_kurum(kurum_id: int, channel_config_id):
    """Gövdeden gelen WhatsApp hesabı bu kuruma ait değilse 404."""
    if channel_config_id in (None, ''):
        return None
    from apps.communication.infrastructure.repository import ChannelConfigRepository

    try:
        cfg = ChannelConfigRepository.get_by_id(kurum_id, channel_config_id)
    except Exception:
        cfg = None
    if cfg is None:
        return Response({'error': 'WhatsApp hesabı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return None


def resolve_kurum_id(request) -> int | None:
    """Query/body → X-Kurum-ID header → session active_kurum_id."""
    kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
    if not kurum_id:
        kurum_id = request.headers.get('X-Kurum-ID')
    if kurum_id:
        try:
            return int(kurum_id)
        except (TypeError, ValueError):
            return None
    active = getattr(request, 'active_kurum_id', None)
    return int(active) if active else None


def resolve_kurum_and_sube(request):
    """
    Zorunlu kurum + şube bağlamını çözümler.

    Returns:
        (kurum_id, sube_id, None) başarılı
        (None, None, Response) hata
    """
    kurum_id = resolve_kurum_id(request)
    if not kurum_id:
        return None, None, Response(
            {'error': 'kurum_id zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    forbidden = assert_kurum_access(request, kurum_id)
    if forbidden:
        return kurum_id, None, forbidden

    sube_id, err = resolve_mandatory_communication_sube(request, kurum_id)
    if err:
        return kurum_id, None, err

    return kurum_id, sube_id, None
