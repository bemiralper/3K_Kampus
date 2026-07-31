"""Mesaj kuyruğu izleme API."""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.domain.enums import MessageStatus
from apps.communication.domain.models import OutboundQueueItem
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationBulkPermission


class OutboundQueueListView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        from django.db.models import Q

        qs = OutboundQueueItem.objects.filter(kurum_id=kurum_id).select_related(
            'message', 'message__conversation', 'campaign', 'campaign__channel_config',
        ).order_by('-created_at')

        if sube_id:
            qs = qs.filter(
                Q(message__conversation__sube_id=sube_id) | Q(campaign__sube_id=sube_id)
            )

        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(message__status=status_param)

        campaign_id = request.query_params.get('campaign_id')
        if campaign_id:
            qs = qs.filter(campaign_id=campaign_id)

        account_id = request.query_params.get('channel_config_id') or request.query_params.get('account_id')
        if account_id:
            qs = qs.filter(campaign__channel_config_id=account_id)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(100, max(1, int(request.query_params.get('page_size', 50))))
        except (TypeError, ValueError):
            page, page_size = 1, 50

        total = qs.count()
        start = (page - 1) * page_size
        items = []
        for item in qs[start:start + page_size]:
            msg = item.message
            conv = getattr(msg, 'conversation', None)
            campaign = item.campaign
            cfg = getattr(campaign, 'channel_config', None) if campaign else None
            items.append({
                'id': str(item.id),
                'message_id': str(msg.id) if msg else None,
                'status': msg.status if msg else None,
                'attempt_count': item.attempt_count,
                'next_attempt_at': item.next_attempt_at.isoformat() if item.next_attempt_at else None,
                'last_error': item.last_error or (msg.failed_reason if msg else ''),
                'campaign_id': str(campaign.id) if campaign else None,
                'campaign_title': campaign.title if campaign else '',
                'channel_config_id': str(cfg.id) if cfg else None,
                'channel_config_name': (cfg.name or cfg.display_phone) if cfg else '',
                'contact_phone': conv.contact_phone if conv else '',
                'body_preview': (msg.body or '')[:120] if msg else '',
                'created_at': item.created_at.isoformat() if item.created_at else None,
                'updated_at': item.updated_at.isoformat() if item.updated_at else None,
            })

        status_counts = {
            'pending': OutboundQueueItem.objects.filter(
                kurum_id=kurum_id, message__status=MessageStatus.PENDING,
            ).count(),
            'sending': OutboundQueueItem.objects.filter(
                kurum_id=kurum_id, message__status=MessageStatus.SENDING,
            ).count(),
            'failed': OutboundQueueItem.objects.filter(
                kurum_id=kurum_id, message__status=MessageStatus.FAILED,
            ).count(),
        }

        return Response({
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'status_counts': status_counts,
        })
