"""Olay bazlı yönetici alıcı seçimi API."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.staff_recipient_service import (
    list_staff_recipients,
    replace_staff_recipients,
)
from apps.communication.interfaces.views._context import (
    assert_scope_sube_allowed,
    resolve_kurum_and_sube,
)
from shared.utils import int_or_none as _int_or_none
from apps.communication.permissions import CommunicationConfigPermission


def _scope(request, source):
    kurum_id, _active, err = resolve_kurum_and_sube(request)
    if err:
        return None, None, err
    sube_id = _int_or_none(source.get('sube_id'))
    gate = assert_scope_sube_allowed(request, kurum_id, sube_id)
    if gate:
        return None, None, gate
    return kurum_id, sube_id, None


class NotificationStaffRecipientView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id, sube_id, err = _scope(request, request.query_params)
        if err:
            return err
        event_key = (request.query_params.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(list_staff_recipients(kurum_id, event_key, sube_id=sube_id))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request):
        data = request.data or {}
        kurum_id, sube_id, err = _scope(request, data)
        if err:
            return err
        event_key = (data.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        ids = data.get('personel_ids')
        if ids is None:
            return Response({'error': 'personel_ids zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(ids, list):
            return Response({'error': 'personel_ids liste olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(replace_staff_recipients(kurum_id, event_key, ids, sube_id=sube_id))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
