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
