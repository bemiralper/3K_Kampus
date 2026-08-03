"""
Merkezi bildirim şablon eşlemesi API'ları — katalog, upsert ve önizleme.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.notification_binding_service import (
    NotificationBindingError,
    delete_binding,
    list_event_catalog,
    preview_binding,
    upsert_binding,
)
from apps.communication.domain.enums import Channel
from apps.communication.interfaces.views._context import resolve_kurum_id
from apps.communication.permissions import (
    CommunicationConfigPermission,
    CommunicationModulePermission,
)


def _int_or_none(value):
    try:
        return int(value) if value not in (None, '', 'null') else None
    except (TypeError, ValueError):
        return None


def _uuid_or_none(value):
    value = (value or '').strip() if isinstance(value, str) else value
    return value or None


def _scope_from(source: dict) -> tuple[int | None, str | None, str]:
    return (
        _int_or_none(source.get('sube_id')),
        _uuid_or_none(source.get('channel_config_id') or source.get('account_id')),
        source.get('channel') or Channel.WHATSAPP,
    )


class NotificationEventCatalogView(APIView):
    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sube_id, channel_config_id, channel = _scope_from(request.query_params)
        return Response(list_event_catalog(
            kurum_id,
            sube_id=sube_id,
            channel_config_id=channel_config_id,
            channel=channel,
        ))


class NotificationBindingUpsertView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def put(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data or {}
        event_key = (data.get('event_key') or '').strip()
        recipient_type = (data.get('recipient_type') or '').strip().upper()
        if not event_key or not recipient_type:
            return Response(
                {'error': 'event_key ve recipient_type zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sube_id, channel_config_id, channel = _scope_from(data)
        try:
            binding = upsert_binding(
                kurum_id,
                event_key=event_key,
                recipient_type=recipient_type,
                sube_id=sube_id,
                channel_config_id=channel_config_id,
                channel=channel,
                meta_template_id=_uuid_or_none(data.get('meta_template_id')),
                message_template_id=_uuid_or_none(data.get('message_template_id')),
                send_mode=data.get('send_mode') or 'AUTO',
                is_active=data.get('is_active', True),
                user=request.user,
            )
        except NotificationBindingError as exc:
            return Response({'error': exc.message}, status=exc.status_code)

        return Response({
            'id': str(binding.id),
            'event_key': binding.event_key,
            'recipient_type': binding.recipient_type,
            'send_mode': binding.send_mode,
            'is_active': binding.is_active,
        })

    def delete(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data or {}
        event_key = (data.get('event_key') or '').strip()
        recipient_type = (data.get('recipient_type') or '').strip().upper()
        if not event_key or not recipient_type:
            return Response(
                {'error': 'event_key ve recipient_type zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sube_id, channel_config_id, channel = _scope_from(data)
        deleted = delete_binding(
            kurum_id,
            event_key=event_key,
            recipient_type=recipient_type,
            sube_id=sube_id,
            channel_config_id=channel_config_id,
            channel=channel,
        )
        return Response({'deleted': deleted})


class NotificationBindingPreviewView(APIView):
    permission_classes = [CommunicationModulePermission]

    def post(self, request):
        kurum_id = resolve_kurum_id(request)
        if not kurum_id:
            return Response(
                {'error': 'kurum_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data or {}
        event_key = (data.get('event_key') or '').strip()
        recipient_type = (data.get('recipient_type') or '').strip().upper()
        if not event_key or not recipient_type:
            return Response(
                {'error': 'event_key ve recipient_type zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sube_id, channel_config_id, _channel = _scope_from(data)
        context = data.get('context')
        try:
            payload = preview_binding(
                kurum_id,
                event_key=event_key,
                recipient_type=recipient_type,
                context=context if isinstance(context, dict) else None,
                sube_id=sube_id,
                channel_config_id=channel_config_id,
            )
        except NotificationBindingError as exc:
            return Response({'error': exc.message}, status=exc.status_code)
        return Response(payload)
