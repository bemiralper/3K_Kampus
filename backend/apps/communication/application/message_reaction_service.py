"""
Mesaj emoji reaksiyonları.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.communication.application.conversation_phone_sync import resolve_outbound_phone, sync_conversation_linked_phone
from apps.communication.domain.enums import Channel
from apps.communication.domain.models import Message, MessageReaction
from apps.communication.infrastructure.channels.dispatcher import ChannelDispatcher
from apps.communication.infrastructure.repository import MessageRepository


class MessageReactionService:
    def react(
        self,
        message: Message,
        *,
        emoji: str,
        user,
        kurum_id: int,
    ) -> MessageReaction | None:
        emoji = (emoji or '').strip()
        if not message.provider_message_id:
            raise ValidationError('Bu mesaja henüz reaksiyon gönderilemez (WhatsApp ID yok).')

        conversation = sync_conversation_linked_phone(message.conversation)
        phone = resolve_outbound_phone(conversation)
        client = ChannelDispatcher().get_client(Channel.WHATSAPP)
        result = client.send_reaction(
            kurum_id,
            phone,
            message_id=message.provider_message_id,
            emoji=emoji,
        )
        if not result.get('success'):
            raise ValidationError(result.get('error') or 'Reaksiyon gönderilemedi.')

        provider_id = ''
        msgs = result.get('messages') or []
        if msgs:
            provider_id = msgs[0].get('id', '') or ''

        with transaction.atomic():
            existing = MessageReaction.objects.filter(message=message, reacted_by=user).first()
            if not emoji:
                if existing:
                    existing.delete()
                return None
            if existing:
                existing.emoji = emoji
                existing.provider_message_id = provider_id
                existing.save(update_fields=['emoji', 'provider_message_id', 'updated_at'])
                return existing
            return MessageReaction.objects.create(
                message=message,
                emoji=emoji,
                reacted_by=user,
                provider_message_id=provider_id,
            )

    @staticmethod
    def apply_inbound_reaction(target_provider_id: str, emoji: str) -> None:
        target = MessageRepository.get_by_provider_id(target_provider_id)
        if not target:
            return
        MessageReaction.objects.filter(message=target, reacted_by__isnull=True).delete()
        if emoji:
            MessageReaction.objects.create(
                message=target,
                emoji=emoji,
                reacted_by=None,
            )
