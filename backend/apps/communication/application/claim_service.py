"""Sohbet üstlenme / devretme — race-safe."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.communication.application.conversation_events import (
    log_conversation_event,
    log_status_change,
)
from apps.communication.domain.enums import ConversationEventType, ConversationStatus
from apps.communication.domain.models import Conversation, ConversationTransferLog


class ClaimConflictError(Exception):
    def __init__(self, message: str = 'Bu sohbet başka bir kullanıcı tarafından üstlenilmiş.'):
        self.message = message
        super().__init__(message)


class ClaimService:
    @staticmethod
    @transaction.atomic
    def claim(conversation_id, user, *, expected_version: int | None = None) -> Conversation:
        # select_related + FOR UPDATE nullable FK Postgres'te hata verir
        conv = Conversation.objects.select_for_update().get(pk=conversation_id)
        if conv.claimed_by_user_id and conv.claimed_by_user_id != user.id:
            raise ClaimConflictError()
        if expected_version is not None and conv.claim_version != expected_version:
            raise ClaimConflictError('Sohbet güncellendi, lütfen yenileyin.')

        old_status = conv.status
        conv.claimed_by_user = user
        conv.claim_version = (conv.claim_version or 0) + 1
        if conv.status in (
            ConversationStatus.NEW,
            ConversationStatus.NEEDS_SUPPORT,
            ConversationStatus.OPEN,
            ConversationStatus.WAITING,
        ):
            conv.status = ConversationStatus.WAITING
        conv.save(update_fields=['claimed_by_user', 'claim_version', 'status', 'updated_at'])
        log_conversation_event(
            conv,
            ConversationEventType.CLAIMED,
            actor=user,
            meta={'claim_version': conv.claim_version},
        )
        if old_status != conv.status:
            log_status_change(conv, old_status, conv.status, actor=user)
        return conv

    @staticmethod
    @transaction.atomic
    def release(conversation_id, user) -> Conversation:
        conv = Conversation.objects.select_for_update().get(pk=conversation_id)
        if conv.claimed_by_user_id and conv.claimed_by_user_id != user.id:
            raise ClaimConflictError('Yalnızca üstlenen kişi bırakabilir.')
        conv.claimed_by_user = None
        conv.claim_version = (conv.claim_version or 0) + 1
        conv.save(update_fields=['claimed_by_user', 'claim_version', 'updated_at'])
        log_conversation_event(conv, ConversationEventType.RELEASED, actor=user)
        return conv

    @staticmethod
    @transaction.atomic
    def transfer(conversation_id, from_user, to_user, *, reason: str = '') -> Conversation:
        conv = Conversation.objects.select_for_update().get(pk=conversation_id)
        if conv.claimed_by_user_id and conv.claimed_by_user_id != from_user.id:
            # Admin/manage can override — caller checks permission
            if not getattr(from_user, '_force_transfer', False):
                raise ClaimConflictError('Bu sohbeti yalnızca üstlenen kişi devredebilir.')

        ConversationTransferLog.objects.create(
            conversation=conv,
            from_user=from_user,
            to_user=to_user,
            reason=(reason or '')[:2000],
        )
        conv.claimed_by_user = to_user
        conv.claim_version = (conv.claim_version or 0) + 1
        if conv.status == ConversationStatus.NEEDS_SUPPORT:
            conv.status = ConversationStatus.WAITING
            conv.needs_support_at = None
        conv.save(update_fields=[
            'claimed_by_user', 'claim_version', 'status', 'needs_support_at', 'updated_at',
        ])
        log_conversation_event(
            conv,
            ConversationEventType.TRANSFERRED,
            actor=from_user,
            meta={
                'from_user_id': from_user.id,
                'to_user_id': to_user.id,
                'reason': reason[:500] if reason else '',
            },
        )
        return conv
