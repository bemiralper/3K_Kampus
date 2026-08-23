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
from apps.communication.interfaces.views._context import resolve_kurum_id
from apps.communication.interfaces.views.notification_bindings import _int_or_none
from apps.communication.permissions import CommunicationConfigPermission, CommunicationModulePermission


class NotificationScheduleView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [CommunicationModulePermission()]
        return [CommunicationConfigPermission()]

    def get(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        event_key = (request.query_params.get('event_key') or '').strip()
        if not event_key:
            return Response({'error': 'event_key zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            return Response(get_schedule(
                kurum_id, event_key, sube_id=_int_or_none(request.query_params.get('sube_id')),
            ))
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
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        data = request.data or {}
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
                sube_id=_int_or_none(data.get('sube_id')),
                user=request.user if request.user.is_authenticated else None,
            ))
        except NotificationScheduleError as exc:
            return Response({'error': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        except DatabaseError:
            return Response(
                {'error': 'Otomatik saat kaydı için veritabanı güncellemesi gerekli.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
