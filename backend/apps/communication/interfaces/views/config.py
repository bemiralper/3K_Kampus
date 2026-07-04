"""
WhatsApp yapılandırma API.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Max

from apps.communication.application.communication_service import CommunicationService
from apps.communication.domain.enums import Channel, WebhookProcessingStatus
from apps.communication.domain.models import RawWebhookEvent
from apps.communication.infrastructure.repository import ChannelConfigRepository
from apps.communication.interfaces.serializers import (
    WhatsAppConfigSerializer,
    WhatsAppConfigWriteSerializer,
)
from apps.communication.permissions import CommunicationConfigPermission


def _resolve_kurum_id(request) -> int | None:
    kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
    if kurum_id:
        try:
            return int(kurum_id)
        except (TypeError, ValueError):
            return None
    active = getattr(request, 'active_kurum_id', None)
    return int(active) if active else None


def _webhook_diagnostics(kurum_id: int, phone_number_id: str = '') -> dict:
    qs = RawWebhookEvent.objects.filter(kurum_id=kurum_id)
    agg = qs.aggregate(last_at=Max('created_at'))
    last_at = agg['last_at']
    failed_recent = qs.filter(processing_status=WebhookProcessingStatus.FAILED).order_by('-created_at').first()
    return {
        'webhook_event_count': qs.count(),
        'webhook_last_received_at': last_at.isoformat() if last_at else None,
        'webhook_last_error': (failed_recent.processing_error or '')[:200] if failed_recent else '',
        'webhook_callback_path': '/api/communication/webhook/',
        'webhook_phone_number_id': phone_number_id or None,
    }


def _serialize_whatsapp_config(config, *, kurum_id: int | None = None) -> dict:
    data = WhatsAppConfigSerializer(config).data
    data['configured'] = True
    data['has_token'] = bool(config.access_token_encrypted)
    if kurum_id is not None:
        data['kurum_id'] = kurum_id
        data.update(_webhook_diagnostics(kurum_id, config.phone_number_id or ''))
    return data


class WhatsAppConfigView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        config = ChannelConfigRepository.get_whatsapp_config(kurum_id)
        if not config:
            return Response({
                'configured': False,
                'channel': Channel.WHATSAPP,
                'kurum_id': kurum_id,
            })

        return Response(_serialize_whatsapp_config(config, kurum_id=kurum_id))

    def put(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        existing = ChannelConfigRepository.get_whatsapp_config(kurum_id)
        serializer = WhatsAppConfigWriteSerializer(
            existing,
            data=request.data,
            partial=True,
        )
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if existing:
            config = serializer.save()
        else:
            data = dict(serializer.validated_data)
            token = data.pop('access_token', None)
            if token:
                from apps.communication.application.token_crypto import encrypt_access_token
                data['access_token_encrypted'] = encrypt_access_token(token)
            config = ChannelConfigRepository.upsert_whatsapp(
                kurum_id,
                {**data, 'channel': Channel.WHATSAPP},
            )

        return Response(_serialize_whatsapp_config(config, kurum_id=kurum_id))


class WhatsAppConfigTestView(APIView):
    permission_classes = [CommunicationConfigPermission]

    def post(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        result = CommunicationService().test_whatsapp_connection(kurum_id)
        return Response(result)
