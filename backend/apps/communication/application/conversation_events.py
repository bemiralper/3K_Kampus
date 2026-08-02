"""Sohbet audit event yardımcıları."""
from __future__ import annotations

from typing import Any

from apps.communication.domain.enums import ConversationEventType
from apps.communication.domain.models import Conversation, ConversationEvent


def log_conversation_event(
    conversation: Conversation,
    event_type: str,
    *,
    actor=None,
    meta: dict[str, Any] | None = None,
) -> ConversationEvent:
    return ConversationEvent.objects.create(
        conversation=conversation,
        event_type=event_type,
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        meta=meta or {},
    )


def log_status_change(
    conversation: Conversation,
    old_status: str,
    new_status: str,
    *,
    actor=None,
    extra: dict[str, Any] | None = None,
) -> ConversationEvent | None:
    if old_status == new_status:
        return None
    meta = {'from': old_status, 'to': new_status}
    if extra:
        meta.update(extra)
    return log_conversation_event(
        conversation,
        ConversationEventType.STATUS_CHANGED,
        actor=actor,
        meta=meta,
    )
