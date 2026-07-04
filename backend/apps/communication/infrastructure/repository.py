"""
İletişim modülü — Repository katmanı
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.communication.domain.enums import (
    Channel,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    WebhookProcessingStatus,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    CommunicationLog,
    ContactIdentity,
    Conversation,
    Message,
    MessageStatusEvent,
    OutboundCampaign,
    OutboundQueueItem,
    RawWebhookEvent,
)
from apps.communication.interfaces.sube_context import filter_conversations_by_sube


class ChannelConfigRepository:
    @staticmethod
    def get_whatsapp_config(kurum_id: int) -> CommunicationChannelConfig | None:
        return CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).first()

    @staticmethod
    def get_by_phone_number_id(phone_number_id: str) -> CommunicationChannelConfig | None:
        if not phone_number_id:
            return None
        return CommunicationChannelConfig.objects.filter(
            phone_number_id=phone_number_id,
            is_active=True,
        ).first()

    @staticmethod
    def verify_token_exists(token: str) -> bool:
        if not token:
            return False
        return CommunicationChannelConfig.objects.filter(
            webhook_verify_token=token,
            is_active=True,
        ).exists()

    @staticmethod
    def upsert_whatsapp(kurum_id: int, data: dict) -> CommunicationChannelConfig:
        config, _ = CommunicationChannelConfig.objects.update_or_create(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            defaults=data,
        )
        return config


class ContactIdentityRepository:
    @staticmethod
    def get_by_e164(kurum_id: int, e164: str) -> ContactIdentity | None:
        return ContactIdentity.objects.filter(kurum_id=kurum_id, e164=e164).first()

    @staticmethod
    def update_or_create(kurum_id: int, e164: str, defaults: dict):
        return ContactIdentity.objects.update_or_create(
            kurum_id=kurum_id,
            e164=e164,
            defaults=defaults,
        )


class ConversationRepository:
    @staticmethod
    def get_by_id(kurum_id: int, conversation_id, *, sube_id: int | None = None) -> Conversation | None:
        qs = Conversation.objects.filter(
            kurum_id=kurum_id,
            id=conversation_id,
        )
        if sube_id is not None:
            qs = filter_conversations_by_sube(qs, sube_id)
        return qs.select_related(
            'ogrenci', 'ogrenci__sube', 'veli', 'veli__ogrenci', 'veli__ogrenci__sube',
            'kurum', 'contact_identity', 'sube',
        ).first()

    @staticmethod
    def find_latest_for_ogrenci(kurum_id: int, ogrenci_id: int, *, channel: str | None = None):
        qs = Conversation.objects.filter(kurum_id=kurum_id, ogrenci_id=ogrenci_id)
        if channel:
            qs = qs.filter(channel=channel)
        return qs.select_related('ogrenci', 'veli').order_by('-last_message_at', '-updated_at').first()

    @staticmethod
    def find_latest_for_veli(kurum_id: int, veli_id: int, *, channel: str | None = None):
        qs = Conversation.objects.filter(kurum_id=kurum_id, veli_id=veli_id)
        if channel:
            qs = qs.filter(channel=channel)
        return qs.select_related('ogrenci', 'veli').order_by('-last_message_at', '-updated_at').first()

    @staticmethod
    def list_by_kurum_and_sube(kurum_id: int, sube_id: int, **filters):
        qs = filter_conversations_by_sube(
            Conversation.objects.filter(kurum_id=kurum_id),
            sube_id,
        )
        status = filters.get('status')
        if status:
            qs = qs.filter(status=status)
        elif filters.get('exclude_archived'):
            qs = qs.exclude(status=ConversationStatus.ARCHIVED)
        archived = filters.get('archived')
        if archived:
            qs = qs.filter(status=ConversationStatus.ARCHIVED)
        unread = filters.get('unread')
        if unread:
            qs = qs.filter(unread_count_coach__gt=0)
        ogrenci_id = filters.get('ogrenci_id')
        if ogrenci_id:
            qs = qs.filter(
                Q(ogrenci_id=ogrenci_id) | Q(veli__ogrenci_id=ogrenci_id)
            )
        search = filters.get('search')
        if search:
            qs = qs.filter(
                Q(contact_phone__icontains=search)
                | Q(subject__icontains=search)
                | Q(ogrenci__ad__icontains=search)
                | Q(ogrenci__soyad__icontains=search)
                | Q(veli__ad__icontains=search)
                | Q(veli__soyad__icontains=search)
            )
        return qs.select_related(
            'ogrenci', 'ogrenci__sube', 'veli', 'veli__ogrenci', 'kurum',
            'assigned_coach', 'contact_identity', 'sube',
        )

    @staticmethod
    def _resolve_sube_id(*, ogrenci_id=None, veli_id=None) -> int | None:
        if ogrenci_id:
            from apps.ogrenci.domain.models import Ogrenci
            return Ogrenci.objects.filter(id=ogrenci_id).values_list('sube_id', flat=True).first()
        if veli_id:
            from apps.ogrenci.domain.models import OgrenciVeli
            return (
                OgrenciVeli.objects.filter(id=veli_id)
                .values_list('ogrenci__sube_id', flat=True)
                .first()
            )
        return None

    @staticmethod
    def find_by_phone(kurum_id: int, channel: str, contact_phone: str):
        return Conversation.objects.filter(
            kurum_id=kurum_id,
            channel=channel,
            contact_phone=contact_phone,
        ).select_related('ogrenci', 'ogrenci__sube', 'veli', 'kurum', 'contact_identity').first()

    @staticmethod
    def _pick_existing_conversation(
        qs,
        *,
        ogrenci_id=None,
        veli_id=None,
    ):
        """Aynı telefon için birden fazla konuşma varsa en uygun olanı seç."""
        ordered = qs.order_by('-last_message_at', '-updated_at', '-created_at')
        if veli_id is not None:
            return ordered.filter(veli_id=veli_id).first()
        if ogrenci_id is not None:
            match = ordered.filter(ogrenci_id=ogrenci_id, veli_id__isnull=True).first()
            if match:
                return match
        return ordered.first()

    @staticmethod
    def get_or_create_for_contact(
        kurum_id: int,
        channel: str,
        contact_phone: str,
        *,
        contact_type: str = 'RAW_PHONE',
        contact_identity=None,
        ogrenci_id=None,
        veli_id=None,
    ) -> tuple[Conversation, bool]:
        defaults = {
            'status': ConversationStatus.OPEN,
            'contact_type': contact_type,
        }
        if contact_identity:
            defaults['contact_identity'] = contact_identity
        if ogrenci_id:
            defaults['ogrenci_id'] = ogrenci_id
        if veli_id:
            defaults['veli_id'] = veli_id
        sube_id = ConversationRepository._resolve_sube_id(ogrenci_id=ogrenci_id, veli_id=veli_id)
        if sube_id:
            defaults['sube_id'] = sube_id

        existing = None
        if veli_id is not None:
            existing = ConversationRepository.find_latest_for_veli(
                kurum_id, veli_id, channel=channel,
            )
        elif ogrenci_id is not None:
            existing = (
                Conversation.objects.filter(
                    kurum_id=kurum_id,
                    channel=channel,
                    ogrenci_id=ogrenci_id,
                    veli_id__isnull=True,
                )
                .order_by('-last_message_at', '-updated_at', '-created_at')
                .first()
            )

        if not existing:
            base_qs = Conversation.objects.filter(
                kurum_id=kurum_id,
                channel=channel,
                contact_phone=contact_phone,
            )
            existing = ConversationRepository._pick_existing_conversation(
                base_qs,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
            )

        if existing:
            conversation = existing
            created = False
        else:
            conversation = Conversation.objects.create(
                kurum_id=kurum_id,
                channel=channel,
                contact_phone=contact_phone,
                **defaults,
            )
            created = True

        if not created:
            update_fields = []
            if contact_phone and conversation.contact_phone != contact_phone:
                conversation.contact_phone = contact_phone
                update_fields.append('contact_phone')
            if contact_identity and conversation.contact_identity_id != getattr(contact_identity, 'id', None):
                conversation.contact_identity = contact_identity
                update_fields.append('contact_identity')
            if veli_id is not None and conversation.veli_id != veli_id:
                conversation.veli_id = veli_id
                update_fields.append('veli_id')
            if ogrenci_id is not None and conversation.ogrenci_id != ogrenci_id:
                conversation.ogrenci_id = ogrenci_id
                update_fields.append('ogrenci_id')
            if sube_id and conversation.sube_id != sube_id:
                conversation.sube_id = sube_id
                update_fields.append('sube_id')
            if contact_type and conversation.contact_type != contact_type:
                conversation.contact_type = contact_type
                update_fields.append('contact_type')
            if update_fields:
                update_fields.append('updated_at')
                conversation.save(update_fields=update_fields)
        return conversation, created

    @staticmethod
    def get_or_create_by_phone(kurum_id: int, channel: str, contact_phone: str) -> tuple[Conversation, bool]:
        return ConversationRepository.get_or_create_for_contact(
            kurum_id=kurum_id,
            channel=channel,
            contact_phone=contact_phone,
        )

    @staticmethod
    def update_on_message(conversation: Conversation, *, preview: str, direction: str) -> None:
        conversation.last_message_at = timezone.now()
        conversation.last_message_preview = (preview or '')[:255]
        if direction == MessageDirection.INBOUND:
            conversation.unread_count_coach = (conversation.unread_count_coach or 0) + 1
            if conversation.status == ConversationStatus.ARCHIVED:
                conversation.status = ConversationStatus.OPEN
        elif direction == MessageDirection.OUTBOUND:
            conversation.status = ConversationStatus.AWAITING_REPLY
        conversation.save(update_fields=[
            'last_message_at',
            'last_message_preview',
            'unread_count_coach',
            'status',
            'updated_at',
        ])

    @staticmethod
    def mark_read(conversation: Conversation) -> None:
        conversation.unread_count_coach = 0
        conversation.save(update_fields=['unread_count_coach', 'updated_at'])

    @staticmethod
    def archive(conversation: Conversation) -> None:
        conversation.status = ConversationStatus.ARCHIVED
        conversation.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def unarchive(conversation: Conversation) -> None:
        conversation.status = ConversationStatus.OPEN
        conversation.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def unread_count_for_queryset(qs) -> int:
        from django.db.models import Sum

        result = qs.aggregate(total=Sum('unread_count_coach'))
        return int(result['total'] or 0)


class MessageRepository:
    @staticmethod
    def create(conversation, **kwargs) -> Message:
        return Message.objects.create(conversation=conversation, **kwargs)

    @staticmethod
    def get_by_provider_id(provider_message_id: str) -> Message | None:
        if not provider_message_id:
            return None
        return Message.objects.filter(provider_message_id=provider_message_id).first()

    @staticmethod
    def list_by_conversation(conversation_id, *, limit: int = 50, before_id=None):
        qs = Message.objects.filter(conversation_id=conversation_id).order_by('-created_at')
        if before_id:
            qs = qs.filter(created_at__lt=Message.objects.filter(id=before_id).values('created_at')[:1])
        return qs.select_related('reply_to').prefetch_related(
            'attachments',
            'reactions',
            'reactions__reacted_by',
            'reply_to__attachments',
        )[:limit]

    @staticmethod
    def count_by_conversation(conversation_id) -> int:
        return Message.objects.filter(conversation_id=conversation_id).count()


class MessageStatusEventRepository:
    STATUS_MAP = {
        'sent': MessageStatus.SENT,
        'delivered': MessageStatus.DELIVERED,
        'read': MessageStatus.READ,
        'failed': MessageStatus.FAILED,
    }

    @staticmethod
    def apply_status_update(
        message: Message,
        *,
        meta_status: str,
        provider_event_id: str,
        occurred_at,
        raw_payload: dict | None = None,
    ) -> tuple[MessageStatusEvent | None, bool]:
        """Durum günceller; (event, created) döner. Duplicate ise created=False."""
        status = MessageStatusEventRepository.STATUS_MAP.get(meta_status)
        if not status:
            return None, False

        event, created = MessageStatusEvent.objects.get_or_create(
            message=message,
            status=status,
            provider_event_id=provider_event_id or '',
            defaults={
                'occurred_at': occurred_at,
                'raw_payload': raw_payload or {},
            },
        )
        if not created:
            return event, False

        message.status = status
        update_fields = ['status', 'updated_at']
        if status == MessageStatus.SENT:
            message.sent_at = occurred_at
            update_fields.append('sent_at')
        elif status == MessageStatus.DELIVERED:
            message.delivered_at = occurred_at
            update_fields.append('delivered_at')
        elif status == MessageStatus.READ:
            message.read_at = occurred_at
            update_fields.append('read_at')
        elif status == MessageStatus.FAILED:
            errors = (raw_payload or {}).get('errors', [])
            if errors:
                message.failed_reason = errors[0].get('title', '') or str(errors[0])
                update_fields.append('failed_reason')
        message.save(update_fields=update_fields)
        return event, True


class OutboundQueueRepository:
    @staticmethod
    def enqueue(
        kurum_id: int,
        message: Message,
        next_attempt_at=None,
        campaign: OutboundCampaign | None = None,
        priority: int = 100,
    ) -> OutboundQueueItem:
        return OutboundQueueItem.objects.create(
            kurum_id=kurum_id,
            message=message,
            campaign=campaign,
            priority=priority,
            next_attempt_at=next_attempt_at or timezone.now(),
        )

    @staticmethod
    @transaction.atomic
    def get_pending_batch(limit: int = 20):
        """FOR UPDATE SKIP LOCKED ile kilitlenebilir batch."""
        now = timezone.now()
        ids = list(
            OutboundQueueItem.objects.filter(
                next_attempt_at__lte=now,
                locked_at__isnull=True,
                message__status__in=[MessageStatus.PENDING, MessageStatus.FAILED],
            )
            .select_for_update(skip_locked=True)
            .order_by('priority', 'next_attempt_at')
            .values_list('id', flat=True)[:limit]
        )
        if not ids:
            return []
        return list(
            OutboundQueueItem.objects.filter(id__in=ids).select_related(
                'message', 'message__conversation', 'campaign',
            )
        )

    @staticmethod
    def count_pending() -> int:
        now = timezone.now()
        return OutboundQueueItem.objects.filter(
            next_attempt_at__lte=now,
            locked_at__isnull=True,
            message__status__in=[MessageStatus.PENDING, MessageStatus.FAILED],
        ).count()

    @staticmethod
    @transaction.atomic
    def lock_item(item: OutboundQueueItem) -> OutboundQueueItem:
        item.locked_at = timezone.now()
        item.save(update_fields=['locked_at', 'updated_at'])
        return item

    @staticmethod
    def mark_sent(item: OutboundQueueItem, provider_message_id: str = '') -> None:
        msg = item.message
        msg.status = MessageStatus.SENT
        msg.sent_at = timezone.now()
        if provider_message_id:
            msg.provider_message_id = provider_message_id
        msg.save(update_fields=['status', 'sent_at', 'provider_message_id', 'updated_at'])
        item.delete()

    @staticmethod
    def mark_failed(item: OutboundQueueItem, error: str) -> None:
        item.attempt_count += 1
        item.last_error = error
        item.locked_at = None
        backoff_minutes = [1, 5, 15, 60, 60]
        idx = min(item.attempt_count - 1, len(backoff_minutes) - 1)
        item.next_attempt_at = timezone.now() + timedelta(minutes=backoff_minutes[idx])
        item.save(update_fields=[
            'attempt_count', 'last_error', 'locked_at', 'next_attempt_at', 'updated_at',
        ])
        msg = item.message
        if item.attempt_count >= item.max_attempts:
            msg.status = MessageStatus.FAILED
            msg.failed_reason = error
        else:
            msg.status = MessageStatus.PENDING
            msg.failed_reason = error
        msg.save(update_fields=['status', 'failed_reason', 'updated_at'])


class CommunicationLogRepository:
    @staticmethod
    def create_inbound(kurum_id, endpoint, http_status, request_body='', response_body='', error=''):
        CommunicationLog.objects.create(
            kurum_id=kurum_id if isinstance(kurum_id, int) else None,
            direction='INBOUND',
            endpoint=endpoint,
            http_status=http_status,
            request_body=request_body,
            response_body=response_body,
            error=error,
        )


class RawWebhookEventRepository:
    @staticmethod
    def create(**kwargs) -> RawWebhookEvent:
        provider_message_id = ''
        messages = kwargs.get('payload', {}).get('messages', [])
        if messages:
            provider_message_id = messages[0].get('id', '')
        statuses = kwargs.get('payload', {}).get('statuses', [])
        if statuses and not provider_message_id:
            provider_message_id = statuses[0].get('id', '')
        return RawWebhookEvent.objects.create(
            provider_message_id=provider_message_id,
            **kwargs,
        )

    @staticmethod
    def mark_processed(event: RawWebhookEvent, status: str, error: str = '') -> None:
        event.processing_status = status
        event.processing_error = error
        event.processed_at = timezone.now()
        event.save(update_fields=['processing_status', 'processing_error', 'processed_at'])


class OutboundCampaignRepository:
    @staticmethod
    def create_draft(kurum_id: int, created_by_id: int | None, data: dict) -> OutboundCampaign:
        return OutboundCampaign.objects.create(
            kurum_id=kurum_id,
            created_by_id=created_by_id,
            **data,
        )

    @staticmethod
    def get_by_id(kurum_id: int, campaign_id, *, sube_id: int | None = None) -> OutboundCampaign | None:
        qs = OutboundCampaign.objects.filter(
            kurum_id=kurum_id,
            id=campaign_id,
        )
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('created_by', 'sube').first()

    @staticmethod
    def list_by_kurum_and_sube(kurum_id: int, sube_id: int):
        return OutboundCampaign.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
        ).select_related('created_by', 'sube')


class OutboundQueueRepositoryExtensions:
    """OutboundQueueRepository kampanya yardımcıları."""

    @staticmethod
    @transaction.atomic
    def cancel_pending_for_campaign(campaign: OutboundCampaign) -> int:
        pending_items = OutboundQueueItem.objects.filter(
            campaign=campaign,
            message__status__in=[MessageStatus.PENDING, MessageStatus.SENDING],
        ).select_related('message')
        count = 0
        for item in pending_items:
            msg = item.message
            msg.status = MessageStatus.CANCELLED
            msg.save(update_fields=['status', 'updated_at'])
            item.delete()
            count += 1
        return count

    @staticmethod
    @transaction.atomic
    def retry_failed_for_campaign(campaign: OutboundCampaign) -> int:
        failed_messages = Message.objects.filter(
            campaign=campaign,
            direction=MessageDirection.OUTBOUND,
            status=MessageStatus.FAILED,
        )
        count = 0
        for msg in failed_messages:
            if hasattr(msg, 'queue_item'):
                continue
            msg.status = MessageStatus.PENDING
            msg.failed_reason = ''
            msg.save(update_fields=['status', 'failed_reason', 'updated_at'])
            OutboundQueueRepository.enqueue(
                kurum_id=campaign.kurum_id,
                message=msg,
                campaign=campaign,
                next_attempt_at=timezone.now(),
            )
            count += 1
        return count


# Bind extensions onto repository class
OutboundQueueRepository.cancel_pending_for_campaign = (
    OutboundQueueRepositoryExtensions.cancel_pending_for_campaign
)
OutboundQueueRepository.retry_failed_for_campaign = (
    OutboundQueueRepositoryExtensions.retry_failed_for_campaign
)
