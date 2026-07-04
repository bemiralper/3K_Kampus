"""
Giden kuyruk öğesi işleme.
"""
from __future__ import annotations

import logging
import time

from django.conf import settings

from apps.communication.application.campaign_service import CampaignStatsService
from apps.communication.application.template_component_builder import build_template_components
from apps.communication.application.variable_resolver import build_recipient_context_from_conversation
from apps.communication.domain.enums import CampaignStatus, MessageStatus, MessageType
from apps.communication.infrastructure.channels.base import BaseChannelClient
from apps.communication.infrastructure.channels.dispatcher import ChannelDispatcher
from apps.communication.infrastructure.media_storage import (
    ensure_public_upload,
    get_public_media_url,
    local_file_path,
)
from apps.communication.infrastructure.repository import OutboundQueueRepository

logger = logging.getLogger(__name__)


def _safe_refresh_campaign_stats(campaign_id) -> None:
    """İstatistik güncellemesi gönderimi bozmamalı."""
    if not campaign_id:
        return
    try:
        CampaignStatsService.refresh_campaign_stats(campaign_id)
    except Exception:
        logger.exception('Campaign stats refresh failed campaign=%s', campaign_id)


def _throttle_ms() -> int:
    return int(getattr(settings, 'COMMUNICATION_QUEUE_THROTTLE_MS', 0) or 0)


def _build_recipient_context_from_message(message) -> dict:
    return build_recipient_context_from_conversation(message.conversation)


def _resolve_media_id(client, kurum_id: int, attachment) -> tuple[str | None, str | None]:
    """
    Meta media_id veya public link döndür.
    provider_media_id varsa kullan; yoksa upload dene, sonra public URL fallback.
    """
    if attachment.provider_media_id:
        return attachment.provider_media_id, None

    path = local_file_path(attachment.file)
    mime = attachment.mime_type or 'application/octet-stream'
    if path:
        media_id = client.upload_media(kurum_id, path, mime)
        if media_id:
            attachment.provider_media_id = media_id
            attachment.save(update_fields=['provider_media_id'])
            return media_id, None

    ensure_public_upload(attachment.file, mime_type=mime)
    link = get_public_media_url(attachment.file)
    return None, link


def _reply_context_id(message) -> str | None:
    if not message.reply_to_id:
        return None
    reply = getattr(message, 'reply_to', None)
    if reply is None and message.reply_to_id:
        from apps.communication.domain.models import Message

        reply = Message.objects.filter(id=message.reply_to_id).first()
    if reply and reply.provider_message_id:
        return reply.provider_message_id
    return None


def _send_attachment_message(client, kurum_id, phone, message, attachment) -> dict:
    context_id = _reply_context_id(message)
    media_id, link = _resolve_media_id(client, kurum_id, attachment)
    if not media_id and not link:
        return {
            'success': False,
            'error': 'Medya yüklenemedi ve public URL oluşturulamadı.',
        }

    is_image = (attachment.mime_type or '').startswith('image/')
    if is_image:
        return client.send_image(
            kurum_id,
            phone,
            media_id=media_id,
            link=link,
            caption=message.body,
            context_message_id=context_id,
        )
    return client.send_document(
        kurum_id,
        phone,
        media_id=media_id,
        link=link,
        filename=attachment.original_name or '',
        caption=message.body,
        context_message_id=context_id,
    )


def process_queue_item(item, client: BaseChannelClient | None = None) -> bool:
    """
    Tek kuyruk kaydını işler. Başarılıysa True döner.
    """
    if client is None:
        channel = getattr(item.message.conversation, 'channel', None)
        client = ChannelDispatcher().get_client(channel)
    OutboundQueueRepository.lock_item(item)

    if item.campaign_id and item.campaign:
        campaign = item.campaign
        if campaign.status in (CampaignStatus.QUEUED, CampaignStatus.CONFIRMED):
            campaign.status = CampaignStatus.PROCESSING
            campaign.save(update_fields=['status', 'updated_at'])

    message = item.message
    message.status = MessageStatus.SENDING
    message.save(update_fields=['status', 'updated_at'])

    from apps.communication.application.conversation_phone_sync import (
        resolve_outbound_phone,
        sync_conversation_linked_phone,
    )
    from apps.communication.application.debug_trace import debug_trace, mask_phone

    conversation = sync_conversation_linked_phone(message.conversation)
    phone = resolve_outbound_phone(conversation)
    debug_trace(
        'C',
        'outbound_processor.py:process_queue_item',
        'queue_item_sending',
        {
            'queue_item_id': str(item.id),
            'message_id': str(message.id),
            'conversation_id': str(conversation.id),
            'phone': mask_phone(phone),
            'veli_id': conversation.veli_id,
            'ogrenci_id': conversation.ogrenci_id,
        },
    )
    try:
        filter_json = (item.campaign.recipient_filter_json or {}) if item.campaign_id else {}
        template_name = filter_json.get('template_name', '')
        template_language = filter_json.get('template_language', 'tr')
        extra_components = filter_json.get('template_components_json') or []

        if message.message_type == MessageType.IMAGE:
            attachment = message.attachments.first()
            if attachment and attachment.file:
                result = _send_attachment_message(client, item.kurum_id, phone, message, attachment)
            else:
                result = {'success': False, 'error': 'Görsel eki bulunamadı.'}
        elif message.message_type == MessageType.DOCUMENT:
            attachment = message.attachments.first()
            if attachment and attachment.file:
                result = _send_attachment_message(client, item.kurum_id, phone, message, attachment)
            else:
                result = {'success': False, 'error': 'Belge eki bulunamadı.'}
        elif message.message_type == MessageType.TEMPLATE and template_name:
            body_template = ''
            if item.campaign_id and item.campaign:
                body_template = item.campaign.body_template or ''
            context = _build_recipient_context_from_message(message)
            components = build_template_components(
                body_template,
                context,
                extra_components=extra_components,
            )
            result = client.send_template(
                item.kurum_id,
                phone,
                template_name=template_name,
                language_code=template_language,
                components=components or None,
            )
        else:
            result = client.send_text(
                item.kurum_id,
                phone,
                message.body,
                context_message_id=_reply_context_id(message),
            )

        if result.get('success'):
            provider_id = ''
            msgs = result.get('messages', [])
            if msgs:
                provider_id = msgs[0].get('id', '')
            OutboundQueueRepository.mark_sent(item, provider_id)
            if item.campaign_id:
                _safe_refresh_campaign_stats(item.campaign_id)
            return True

        OutboundQueueRepository.mark_failed(item, str(result.get('error', 'Unknown')))
        if item.campaign_id:
            _safe_refresh_campaign_stats(item.campaign_id)
        return False
    except Exception as exc:
        logger.exception('Queue item processing failed message=%s', message.id)
        OutboundQueueRepository.mark_failed(item, str(exc))
        if item.campaign_id:
            _safe_refresh_campaign_stats(item.campaign_id)
        return False


def process_pending_batch(limit: int | None = None) -> dict[str, int]:
    """Bekleyen kuyruk kayıtlarını işler."""
    batch_size = limit or int(getattr(settings, 'COMMUNICATION_QUEUE_BATCH_SIZE', 20))
    throttle = _throttle_ms()
    dispatcher = ChannelDispatcher()
    pending = list(OutboundQueueRepository.get_pending_batch(limit=batch_size))
    sent = 0
    failed = 0
    for idx, item in enumerate(pending):
        if idx > 0 and throttle > 0:
            time.sleep(throttle / 1000.0)
        channel = getattr(item.message.conversation, 'channel', None)
        client = dispatcher.get_client(channel)
        if process_queue_item(item, client):
            sent += 1
        else:
            failed += 1
    return {'processed': len(pending), 'sent': sent, 'failed': failed}
