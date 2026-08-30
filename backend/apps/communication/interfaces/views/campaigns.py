"""
Kampanya API — preview, create, confirm, list, detail, retry, cancel.
"""
from django.core.exceptions import PermissionDenied, ValidationError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.campaign_service import CampaignService
from apps.communication.application.communication_service import CommunicationService
from apps.communication.interfaces.serializers.campaign import (
    CampaignCreateSerializer,
    CampaignDetailSerializer,
    CampaignListSerializer,
)
from apps.communication.interfaces.serializers.config import CampaignPreviewRequestSerializer
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube, resolve_kurum_id as _resolve_kurum_id
from apps.communication.infrastructure.repository import OutboundCampaignRepository
from apps.communication.permissions import CommunicationBulkPermission
from apps.communication.domain.models import Message


def _campaign_deliveries(campaign, *, limit=500):
    rows = []
    qs = (
        Message.objects.filter(campaign=campaign)
        .select_related('conversation')
        .order_by('created_at')[:limit]
    )
    for msg in qs:
        conv = msg.conversation
        rows.append({
            'id': str(msg.id),
            'contact_name': (conv.contact_name or '').strip() or conv.contact_phone,
            'phone': conv.contact_phone or '',
            'contact_type': conv.contact_type or '',
            'status': msg.status,
            'failed_reason': msg.failed_reason or '',
            'sent_at': msg.sent_at.isoformat() if msg.sent_at else None,
        })
    return rows


class CampaignBulkView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]


class CampaignPreviewView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient_filter = serializer.validated_data.get('recipient_filter') or {}
        if sube_id and not recipient_filter.get('sube_id'):
            recipient_filter = {**recipient_filter, 'sube_id': sube_id}

        preview = CommunicationService().preview_campaign(
            kurum_id,
            recipient_filter,
            user=request.user,
            attachment_count=serializer.validated_data.get('attachment_count', 0),
            ai_used=serializer.validated_data.get('ai_used', False),
        )
        include_recipients = request.query_params.get('include_recipients') in ('1', 'true', 'yes')
        if include_recipients or request.data.get('include_recipients'):
            resolved = CampaignService().resolve_recipients(
                kurum_id, recipient_filter, user=request.user,
            )
            preview = {**preview, **resolved}
            # sayfalama
            page = int(request.data.get('page') or request.query_params.get('page') or 1)
            page_size = min(100, max(1, int(request.data.get('page_size') or 25)))
            recipients = preview.get('recipients') or []
            start = (page - 1) * page_size
            preview['recipients'] = recipients[start:start + page_size]
            preview['page'] = page
            preview['page_size'] = page_size
            preview['recipients_total'] = len(recipients)
        return Response(preview)


class CampaignListCreateView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaigns = OutboundCampaignRepository.list_by_kurum_and_sube(kurum_id, sube_id)
        return Response({
            'campaigns': CampaignListSerializer(campaigns, many=True).data,
            'total': campaigns.count(),
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = CampaignService()
        try:
            campaign = service.create_draft(
                kurum_id,
                sube_id=sube_id,
                created_by_id=request.user.id if request.user.is_authenticated else None,
                title=serializer.validated_data.get('title', ''),
                body=serializer.validated_data.get('body', ''),
                template_name=serializer.validated_data.get('template_name', ''),
                template_language=serializer.validated_data.get('template_language', 'tr'),
                audience_filter=serializer.validated_data.get('audience_filter'),
                user=request.user,
                attachment_ids=serializer.validated_data.get('attachment_ids'),
                template_id=serializer.validated_data.get('template_id'),
                scheduled_at=serializer.validated_data.get('scheduled_at'),
                send_options=serializer.validated_data.get('send_options'),
                save_as_template=serializer.validated_data.get('save_as_template', False),
                template_category=serializer.validated_data.get('template_category', ''),
                channel_config_id=serializer.validated_data.get('channel_config_id'),
            )
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        if serializer.validated_data.get('draft_only'):
            return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)

        if serializer.validated_data.get('scheduled_at'):
            return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)

        try:
            campaign = service.confirm(
                campaign,
                sender_user_id=request.user.id if request.user.is_authenticated else None,
            )
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data, status=status.HTTP_201_CREATED)


class CampaignDetailView(CampaignBulkView):
    def get(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        data = CampaignDetailSerializer(campaign).data
        data['deliveries'] = _campaign_deliveries(campaign)
        return Response(data)


class CampaignConfirmView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        service = CampaignService()
        try:
            campaign = service.confirm(
                campaign,
                sender_user_id=request.user.id if request.user.is_authenticated else None,
            )
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data)


class CampaignRetryFailedView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        service = CampaignService()
        try:
            result = service.retry_failed(campaign)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        data = CampaignDetailSerializer(campaign).data
        data['retried_count'] = result['retried_count']
        return Response(data)


class CampaignCancelView(CampaignBulkView):
    def post(self, request, campaign_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        campaign = OutboundCampaignRepository.get_by_id(kurum_id, campaign_id, sube_id=sube_id)
        if not campaign:
            return Response({'error': 'Kampanya bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, campaign.sube_id)
        if gate:
            return gate

        service = CampaignService()
        try:
            campaign = service.cancel(campaign)
        except ValidationError as exc:
            return Response({'error': str(exc.message if hasattr(exc, 'message') else exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(CampaignDetailSerializer(campaign).data)
