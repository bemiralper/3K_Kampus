"""
Celery görevleri — broker yoksa bu modül import edilir ama task'lar çalışmaz.
"""
from __future__ import annotations

from celery import shared_task


@shared_task(name='communication.process_outbound_queue', ignore_result=True)
def process_outbound_queue_task(limit: int | None = None) -> dict:
    """Giden iletişim kuyruğunu işle."""
    from apps.communication.application.outbound_processor import process_pending_batch

    return process_pending_batch(limit=limit)


@shared_task(name='communication.materialize_campaign', ignore_result=True)
def materialize_campaign_task(campaign_id: str, sender_user_id: int | None = None) -> dict:
    """Onaylanmış kampanyanın alıcılarını kuyruk kayıtlarına çevir."""
    from apps.communication.application.campaign_service import CampaignService
    from apps.communication.domain.models import OutboundCampaign

    campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        return {'ok': False, 'error': 'not_found'}
    campaign = CampaignService().materialize_queue(campaign, sender_user_id=sender_user_id)
    return {'ok': True, 'status': campaign.status, 'id': str(campaign.id)}


@shared_task(name='communication.process_inbound_webhook', ignore_result=True)
def process_inbound_webhook_task(
    payload: dict,
    *,
    signature_valid: bool = True,
    raw_body: str = '',
) -> dict:
    """Webhook payload'ını asenkron işle (opsiyonel)."""
    from apps.communication.application.inbound_processor import InboundProcessor

    return InboundProcessor().process_webhook(
        payload,
        signature_valid=signature_valid,
        raw_body=raw_body,
    )
