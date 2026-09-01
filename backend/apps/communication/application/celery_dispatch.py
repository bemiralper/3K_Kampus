"""
Celery / cron köprüsü — broker yoksa veya worker erişilemezse senkron işler.
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def is_celery_enabled() -> bool:
    return bool(getattr(settings, 'CELERY_BROKER_URL', ''))


def dispatch_process_outbound_queue(limit: int | None = None) -> bool:
    """
    Kuyruk işlemeyi Celery'ye devret. Broker yoksa veya task gönderilemezse senkron batch.
    """
    from apps.communication.application.outbound_processor import process_pending_batch

    if is_celery_enabled():
        try:
            from apps.communication.tasks import process_outbound_queue_task

            process_outbound_queue_task.delay(limit=limit)
            return True
        except Exception:
            logger.exception('Celery kuyruk dispatch başarısız — senkron işleniyor')

    process_pending_batch(limit=limit)
    return True


def dispatch_materialize_campaign(
    campaign_id,
    sender_user_id: int | None = None,
) -> bool:
    """
    Kampanya alıcılarını kuyruğa alma işini HTTP isteğinin dışına alır.

    Celery varsa task; yoksa arka plan thread (cron yedek: process_scheduled_campaigns).
    """
    if is_celery_enabled():
        try:
            from apps.communication.tasks import materialize_campaign_task

            materialize_campaign_task.delay(str(campaign_id), sender_user_id)
            return True
        except Exception:
            logger.exception('Celery kampanya materialize başarısız — thread kullanılacak')

    import threading

    thread = threading.Thread(
        target=_run_materialize_campaign,
        args=(str(campaign_id), sender_user_id),
        name=f'campaign-materialize-{campaign_id}',
        daemon=True,
    )
    thread.start()
    return True


def _run_materialize_campaign(campaign_id: str, sender_user_id: int | None) -> None:
    from django.db import close_old_connections

    close_old_connections()
    try:
        from apps.communication.application.campaign_service import CampaignService
        from apps.communication.domain.models import OutboundCampaign

        campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
        if not campaign:
            logger.warning('Kampanya materialize: kayıt yok id=%s', campaign_id)
            return
        CampaignService().materialize_queue(campaign, sender_user_id=sender_user_id)
    except Exception:
        logger.exception('Kampanya kuyruk üretimi başarısız campaign=%s', campaign_id)
    finally:
        close_old_connections()
