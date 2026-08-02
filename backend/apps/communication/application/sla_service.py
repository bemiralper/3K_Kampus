"""30 dakika SLA — Destek Gerekiyor geçişi."""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.communication.application.conversation_events import (
    log_conversation_event,
    log_status_change,
)
from apps.communication.domain.enums import ConversationEventType, ConversationStatus
from apps.communication.domain.models import Conversation


def sla_minutes() -> int:
    return int(getattr(settings, 'COMMUNICATION_SLA_MINUTES', 30) or 30)


def check_and_mark_needs_support(*, limit: int = 200) -> int:
    """
    assigned_coach dolu, cevaplanmamış (first_unanswered_at),
    henüz NEEDS_SUPPORT olmayan sohbetleri işaretle.
    """
    if not getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True):
        return 0

    cutoff = timezone.now() - timedelta(minutes=sla_minutes())
    qs = (
        Conversation.objects.filter(
            assigned_coach__isnull=False,
            first_unanswered_at__isnull=False,
            first_unanswered_at__lte=cutoff,
        )
        .exclude(
            status__in=(
                ConversationStatus.NEEDS_SUPPORT,
                ConversationStatus.ARCHIVED,
                ConversationStatus.CLOSED,
                ConversationStatus.REPLIED,
            )
        )
        .order_by('first_unanswered_at')[:limit]
    )

    updated = 0
    for conv in qs:
        old = conv.status
        # Kendi koçu cevaplamadıysa (claimed başka biri olsa bile SLA ihlali)
        # Plan: 30 dk cevap yok → Destek Gerekiyor; kendi koçta da kalır
        conv.status = ConversationStatus.NEEDS_SUPPORT
        conv.needs_support_at = timezone.now()
        conv.save(update_fields=['status', 'needs_support_at', 'updated_at'])
        log_status_change(conv, old, conv.status, extra={'sla_minutes': sla_minutes()})
        log_conversation_event(
            conv,
            ConversationEventType.SLA_BREACH,
            meta={
                'first_unanswered_at': conv.first_unanswered_at.isoformat() if conv.first_unanswered_at else None,
                'sla_minutes': sla_minutes(),
            },
        )
        updated += 1
    return updated
