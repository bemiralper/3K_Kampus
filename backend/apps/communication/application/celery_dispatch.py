"""
Celery / cron köprüsü — broker yoksa veya worker erişilemezse senkron işler.
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def is_celery_enabled() -> bool:
    return bool(getattr(settings, 'CELERY_BROKER_URL', ''))


def dispatch_process_outbound_queue(
    limit: int | None = None,
    *,
    drain: bool = False,
    background: bool = False,
    max_seconds: float | None = None,
) -> bool:
    """
    Kuyruk işlemeyi Celery'ye devret. Broker yoksa veya task gönderilemezse yerelde işlenir.

    `drain=True`: tek batch yerine süre bütçesi dolana kadar kuyruğu boşaltır
    (toplu gönderim sonrası kalan yüzlerce mesaj cron'u beklemesin diye).
    `background=True`: Celery yoksa işlemi HTTP isteğinin dışına, arka plan
    thread'ine alır.
    """
    from apps.communication.application.outbound_processor import (
        drain_pending_queue,
        process_pending_batch,
    )

    if is_celery_enabled():
        try:
            from apps.communication.tasks import process_outbound_queue_task

            # drain bilgisi task'a taşınır; aksi halde kampanya kalanı cron'a kalırdı (B-05)
            process_outbound_queue_task.delay(limit=limit, drain=drain, max_seconds=max_seconds)
            return True
        except Exception:
            logger.exception('Celery kuyruk dispatch başarısız — yerel işleniyor')

    def run() -> None:
        if drain:
            budget = max_seconds
            if budget is None and background:
                # Arka planda cron ile çakışma riski yok; kampanya bitene kadar sürsün.
                budget = getattr(settings, 'COMMUNICATION_QUEUE_BACKGROUND_DRAIN_SECONDS', 900)
            drain_pending_queue(max_seconds=budget, batch_size=limit)
        else:
            process_pending_batch(limit=limit)

    if background:
        _run_in_thread(run, name='comm-queue-drain')
    else:
        run()
    return True


def dispatch_outbound_queue_after_commit() -> None:
    """İşlem commit olduktan sonra kuyruğu boşalt.

    Cevap anahtarı / karne gönderimi atomik işlem içinde mesaj açar. Celery
    veya başka süreç commit'ten önce kuyruğu boş görür; mesajlar
    "Gönderiliyor"da kalır. Commit sonrası arka planda boşaltılır.
    """
    from django.db import transaction

    def _run() -> None:
        dispatch_process_outbound_queue(drain=True, background=True)

    if transaction.get_connection().in_atomic_block:
        transaction.on_commit(_run)
    else:
        _run()


def _run_in_thread(func, *, name: str) -> None:
    import threading

    from django.db import close_old_connections

    def wrapper() -> None:
        close_old_connections()
        try:
            func()
        except Exception:
            logger.exception('Arka plan iş başarısız: %s', name)
        finally:
            close_old_connections()

    threading.Thread(target=wrapper, name=name, daemon=True).start()


def dispatch_process_webhook(payload: dict, raw_body: str) -> bool:
    """Doğrulanmış webhook payload'ını Celery'ye devret; broker yoksa False (senkron işlenir).

    Meta 200 yanıtını hızlı bekler; medya indirme gibi uzun işler istek dışına çıkar (B-03).
    Thread kullanılmaz: gunicorn worker yaşam döngüsünde yarım kalabilir.
    """
    if not is_celery_enabled():
        return False
    try:
        from apps.communication.tasks import process_inbound_webhook_task

        process_inbound_webhook_task.delay(payload, signature_valid=True, raw_body=raw_body)
        return True
    except Exception:
        logger.exception('Celery webhook dispatch başarısız — senkron işleniyor')
        return False


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

    _run_in_thread(
        lambda: _run_materialize_campaign(str(campaign_id), sender_user_id),
        name=f'campaign-materialize-{campaign_id}',
    )
    return True


def _run_materialize_campaign(campaign_id: str, sender_user_id: int | None) -> None:
    from apps.communication.application.campaign_service import CampaignService
    from apps.communication.domain.models import OutboundCampaign

    campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
    if not campaign:
        logger.warning('Kampanya materialize: kayıt yok id=%s', campaign_id)
        return
    CampaignService().materialize_queue(campaign, sender_user_id=sender_user_id)
