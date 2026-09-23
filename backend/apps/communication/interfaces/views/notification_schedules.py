"""Olay bazlı otomatik gönderim saati API."""
from django.db import DatabaseError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.notification_schedule_service import (
    NotificationScheduleError,
    get_schedule,
    upsert_schedule,
)
from apps.communication.interfaces.views._context import (
    assert_scope_sube_allowed,
    resolve_kurum_and_sube,
)
from shared.utils import int_or_none as _int_or_none
from apps.communication.permissions import CommunicationConfigPermission, CommunicationModulePermission


def _scope(request, source):
    """(kurum_id, scope_sube_id, error_response) — kurum + aktif şube + hedef şube kapısı."""
    kurum_id, _active, err = resolve_kurum_and_sube(request)
    if err:
        return None, None, err
    sube_id = _int_or_none(source.get('sube_id'))
    gate = assert_scope_sube_allowed(request, kurum_id, sube_id)
    if gate:
        return None, None, gate
    return kurum_id, sube_id, None


class NotificationScheduleView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [CommunicationConfigPermission()]

    def get(self, request):
        kurum_id, sube_id, err = _scope(request, request.query_params)
        if err:
            return err
        event_key = (request.query_params.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(get_schedule(kurum_id, event_key, sube_id=sube_id))
        except NotificationScheduleError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except DatabaseError:
            return Response({
                'event_key': event_key,
                'is_enabled': False,
                'send_time': '18:00',
                'report_kinds': 'ozet',
                'last_sent_on': None,
            })

    def put(self, request):
        data = request.data or {}
        kurum_id, sube_id, err = _scope(request, data)
        if err:
            return err
        event_key = (data.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(upsert_schedule(
                kurum_id,
                event_key,
                is_enabled=bool(data.get('is_enabled')),
                send_time=data.get('send_time'),
                report_kinds=data.get('report_kinds'),
                sube_id=sube_id,
                user=request.user if request.user.is_authenticated else None,
            ))
        except NotificationScheduleError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except DatabaseError:
            return Response(
                {'error': 'Otomatik saat kaydı için veritabanı güncellemesi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
