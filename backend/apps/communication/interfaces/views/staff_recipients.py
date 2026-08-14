"""Olay bazlı yönetici alıcı seçimi API."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.staff_recipient_service import (
    list_staff_recipients,
    replace_staff_recipients,
)
from apps.communication.interfaces.views._context import resolve_kurum_id
from apps.communication.interfaces.views.notification_bindings import _int_or_none
from apps.communication.permissions import CommunicationConfigPermission


class NotificationStaffRecipientView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        event_key = (request.query_params.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(list_staff_recipients(
                kurum_id, event_key, sube_id=_int_or_none(request.query_params.get('sube_id')),
            ))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data or {}
        event_key = (data.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        ids = data.get('personel_ids')
        if ids is None:
            return Response({'error': 'personel_ids zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(ids, list):
            return Response({'error': 'personel_ids liste olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(replace_staff_recipients(
                kurum_id,
                event_key,
                ids,
                sube_id=_int_or_none(data.get('sube_id')),
            ))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
