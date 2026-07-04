"""
Gelen webhook mesajlarını işleme.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.utils import timezone

from apps.communication.application.coach_scope import assign_coach_to_conversation
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import (
    Channel,
    MessageDirection,
    MessageStatus,
    MessageType,
    WebhookProcessingStatus,
)
from apps.communication.infrastructure.repository import (
    ChannelConfigRepository,
    CommunicationLogRepository,
    ConversationRepository,
    MessageRepository,
    MessageStatusEventRepository,
    RawWebhookEventRepository,
)


class InboundProcessor:
    """Meta webhook payload parse ve idempotent işleme."""

    def verify_challenge(self, mode: str, token: str, challenge: str, expected_token: str) -> str | None:
        if mode == 'subscribe' and token == expected_token:
            return challenge
        return None

    def verify_signature(self, payload: bytes, signature_header: str, app_secret: str) -> bool:
        if not app_secret:
            return True
        import hashlib
        import hmac

        if not signature_header or not signature_header.startswith('sha256='):
            return False
        expected = signature_header.split('=', 1)[1]
        digest = hmac.new(
            app_secret.encode('utf-8'),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(digest, expected)

    def process_webhook(
        self,
        payload: dict[str, Any],
        *,
        signature_valid: bool,
        raw_body: str = '',
    ) -> dict[str, Any]:
        entries = payload.get('entry', [])
        processed = 0
        errors: list[str] = []
        kurum_id_for_log = None

        for entry in entries:
            for change in entry.get('changes', []):
                value = change.get('value', {})
                phone_number_id = value.get('metadata', {}).get('phone_number_id', '')
                config = ChannelConfigRepository.get_by_phone_number_id(phone_number_id)
                kurum_id = config.kurum_id if config else None
                if kurum_id:
                    kurum_id_for_log = kurum_id

                event = RawWebhookEventRepository.create(
                    kurum_id=kurum_id,
                    phone_number_id=phone_number_id,
                    event_type=change.get('field', 'unknown'),
                    payload=value,
                    signature_valid=signature_valid,
                )

                if not signature_valid:
                    RawWebhookEventRepository.mark_processed(
                        event,
                        WebhookProcessingStatus.FAILED,
                        error='Invalid signature',
                    )
                    errors.append('Invalid signature')
                    continue

                try:
                    self._process_value(kurum_id, value)
                    RawWebhookEventRepository.mark_processed(event, WebhookProcessingStatus.PROCESSED)
                    processed += 1
                except Exception as exc:
                    RawWebhookEventRepository.mark_processed(
                        event,
                        WebhookProcessingStatus.FAILED,
                        error=str(exc),
                    )
                    errors.append(str(exc))

        CommunicationLogRepository.create_inbound(
            kurum_id=kurum_id_for_log,
            endpoint='/webhook/',
            http_status=200 if not errors else 403,
            request_body=raw_body[:10000] if raw_body else json.dumps(payload)[:10000],
            response_body=json.dumps({'processed': processed}),
            error='; '.join(errors) if errors else '',
        )

        return {'processed': processed, 'errors': errors}

    def _process_value(self, kurum_id: int | None, value: dict[str, Any]) -> None:
        for status in value.get('statuses', []):
            self._process_status(status)

        for msg in value.get('messages', []):
            if kurum_id:
                self._process_inbound_message(kurum_id, msg, value)

    def _process_status(self, status: dict[str, Any]) -> None:
        provider_message_id = status.get('id', '')
        if not provider_message_id:
            return

        message = MessageRepository.get_by_provider_id(provider_message_id)
        if not message:
            return

        meta_status = status.get('status', '')
        timestamp = status.get('timestamp')
        occurred_at = self._parse_timestamp(timestamp)
        provider_event_id = f"{provider_message_id}:{meta_status}:{timestamp}"

        MessageStatusEventRepository.apply_status_update(
            message,
            meta_status=meta_status,
            provider_event_id=provider_event_id,
            occurred_at=occurred_at,
            raw_payload=status,
        )

        if message.campaign_id:
            from apps.communication.application.campaign_service import CampaignStatsService
            from apps.communication.application.template_service import TemplateService
            from apps.communication.domain.enums import MessageStatus

            CampaignStatsService.refresh_campaign_stats(message.campaign_id)
            if meta_status == MessageStatus.READ:
                message.refresh_from_db()
                TemplateService.update_stats_on_message_status(message, MessageStatus.READ)
            elif meta_status == MessageStatus.FAILED:
                message.refresh_from_db()
                TemplateService.update_stats_on_message_status(message, MessageStatus.FAILED)
            elif meta_status == MessageStatus.SENT:
                message.refresh_from_db()
                TemplateService.update_stats_on_message_status(message, MessageStatus.SENT)

    def _process_inbound_message(
        self,
        kurum_id: int,
        msg: dict[str, Any],
        value: dict[str, Any],
    ) -> None:
        provider_message_id = msg.get('id', '')
        if not provider_message_id:
            return

        if MessageRepository.get_by_provider_id(provider_message_id):
            return

        phone = msg.get('from', '')
        if not phone:
            return

        resolved = ContactResolver.resolve_contact(kurum_id, phone)
        e164 = resolved.e164

        conversation, created = ConversationRepository.get_or_create_for_contact(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            contact_phone=e164,
            contact_type=resolved.contact_type,
            contact_identity=resolved.identity,
            ogrenci_id=resolved.ogrenci_id,
            veli_id=resolved.veli_id,
        )

        if not created:
            updated = False
            if resolved.ogrenci_id and not conversation.ogrenci_id:
                conversation.ogrenci_id = resolved.ogrenci_id
                updated = True
            if resolved.veli_id and not conversation.veli_id:
                conversation.veli_id = resolved.veli_id
                updated = True
            if resolved.contact_type != conversation.contact_type and resolved.contact_type != 'RAW_PHONE':
                conversation.contact_type = resolved.contact_type
                updated = True
            if updated:
                conversation.save()

        if created or not conversation.assigned_coach_id:
            assign_coach_to_conversation(conversation)

        message_type, body, media_meta = self._extract_message_content(msg)
        if msg.get('type') == 'reaction':
            reaction = msg.get('reaction', {})
            from apps.communication.application.message_reaction_service import MessageReactionService

            MessageReactionService.apply_inbound_reaction(
                reaction.get('message_id', ''),
                reaction.get('emoji', ''),
            )
            return

        reply_to = None
        quoted_id = (msg.get('context') or {}).get('id')
        if quoted_id:
            reply_to = MessageRepository.get_by_provider_id(quoted_id)

        message = MessageRepository.create(
            conversation=conversation,
            direction=MessageDirection.INBOUND,
            message_type=message_type,
            body=body,
            status=MessageStatus.DELIVERED,
            provider_message_id=provider_message_id,
            reply_to=reply_to,
        )

        if media_meta.get('media_id'):
            self._save_inbound_media(kurum_id, message, media_meta)

        ConversationRepository.update_on_message(
            conversation,
            preview=body or f'[{message_type}]',
            direction=MessageDirection.INBOUND,
        )

    def _save_inbound_media(self, kurum_id: int, message, media_meta: dict[str, Any]) -> None:
        from django.core.files.base import ContentFile

        from apps.communication.domain.models import MessageAttachment
        from apps.communication.infrastructure.channels.dispatcher import ChannelDispatcher

        media_id = media_meta.get('media_id', '')
        if not media_id:
            return

        client = ChannelDispatcher().get_client(Channel.WHATSAPP)
        downloaded = client.download_media(kurum_id, media_id)
        if not downloaded:
            MessageAttachment.objects.create(
                message=message,
                provider_media_id=media_id,
                original_name=media_meta.get('filename', ''),
                mime_type=media_meta.get('mime_type', ''),
            )
            return

        content, mime_type = downloaded
        filename = media_meta.get('filename') or f'{media_id}.bin'
        attachment = MessageAttachment(
            message=message,
            provider_media_id=media_id,
            original_name=filename,
            mime_type=mime_type or media_meta.get('mime_type', ''),
            file_size=len(content),
        )
        attachment.file.save(filename, ContentFile(content), save=True)

    def _extract_message_content(self, msg: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
        msg_type = msg.get('type', 'text')
        media_meta: dict[str, Any] = {}
        if msg_type == 'reaction':
            return MessageType.TEXT, '', media_meta
        if msg_type == 'text':
            return MessageType.TEXT, msg.get('text', {}).get('body', ''), media_meta
        if msg_type == 'image':
            image = msg.get('image', {})
            caption = image.get('caption', '')
            media_meta = {
                'media_id': image.get('id', ''),
                'mime_type': image.get('mime_type', 'image/jpeg'),
                'filename': image.get('filename', 'image.jpg'),
            }
            return MessageType.IMAGE, caption or '[Görsel]', media_meta
        if msg_type == 'document':
            doc = msg.get('document', {})
            caption = doc.get('caption', '')
            filename = doc.get('filename', '')
            media_meta = {
                'media_id': doc.get('id', ''),
                'mime_type': doc.get('mime_type', 'application/octet-stream'),
                'filename': filename or 'document',
            }
            return MessageType.DOCUMENT, caption or filename or '[Belge]', media_meta
        if msg_type == 'audio':
            audio = msg.get('audio', {})
            media_meta = {
                'media_id': audio.get('id', ''),
                'mime_type': audio.get('mime_type', 'audio/ogg'),
                'filename': 'audio.ogg',
            }
            return MessageType.AUDIO, '[Ses mesajı]', media_meta
        if msg_type == 'video':
            video = msg.get('video', {})
            caption = video.get('caption', '')
            media_meta = {
                'media_id': video.get('id', ''),
                'mime_type': video.get('mime_type', 'video/mp4'),
                'filename': video.get('filename', 'video.mp4'),
            }
            return MessageType.VIDEO, caption or '[Video]', media_meta
        return MessageType.TEXT, f'[{msg_type}]', media_meta

    @staticmethod
    def _parse_timestamp(timestamp: str | int | None):
        if timestamp:
            try:
                return datetime.fromtimestamp(int(timestamp), tz=dt_timezone.utc)
            except (TypeError, ValueError):
                pass
        return timezone.now()
