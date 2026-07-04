"""Kurum + şube bağlamı — iletişim API view'ları."""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.interfaces.sube_context import resolve_mandatory_communication_sube


def resolve_kurum_id(request) -> int | None:
    kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
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

    sube_id, err = resolve_mandatory_communication_sube(request, kurum_id)
    if err:
        return kurum_id, None, err

    return kurum_id, sube_id, None
