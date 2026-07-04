"""
Communication Service — modüller için tek giriş noktası.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.utils import timezone

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.outbound_processor import process_queue_item
from apps.communication.domain.enums import Channel, MessageDirection, MessageStatus, MessageType, RecipientType
from apps.communication.infrastructure.channels.dispatcher import ChannelDispatcher
from apps.communication.infrastructure.repository import (
    ConversationRepository,
    MessageRepository,
    OutboundQueueRepository,
)


@dataclass
class MessageContent:
    text: str = ''
    message_type: str = MessageType.TEXT
    attachment_path: str | None = None
    attachment_filename: str = ''
    attachment_mime_type: str = ''
    reply_to_message_id: str | None = None


@dataclass
class MessageSource:
    module: str = ''
    ref_id: str | int = ''


@dataclass
class RecipientQuery:
    phone: str | None = None
    ogrenci_id: int | None = None
    veli_id: int | None = None
    conversation_id: str | None = None
    opt_in_category: str = 'duyuru'


@dataclass
class SendResult:
    success: bool
    message_id: str | None = None
    errors: list[str] = field(default_factory=list)
    provider_response: dict[str, Any] = field(default_factory=dict)
    sent_to_phone: str | None = None
    message_status: str | None = None


class CommunicationService:
    """Kanal-bağımsız mesaj gönderim facade."""

    def __init__(self):
        self._dispatcher = ChannelDispatcher()

    def send(
        self,
        kurum_id: int,
        *,
        channel: str = Channel.WHATSAPP,
        recipients: RecipientQuery | None = None,
        content: MessageContent | None = None,
        source: MessageSource | None = None,
        sender_user_id: int | None = None,
        process_immediately: bool = True,
    ) -> SendResult:
        """
        Tekli mesaj gönderimi — kuyruğa alır, isteğe bağlı anında işler.
        """
        recipients = recipients or RecipientQuery()
        content = content or MessageContent()
        source = source or MessageSource()

        if not content.text and not content.attachment_path:
            return SendResult(success=False, errors=['Mesaj içeriği boş olamaz.'])

        phone = recipients.phone
        conversation = None
        if recipients.conversation_id:
            conversation = ConversationRepository.get_by_id(kurum_id, recipients.conversation_id)
            if conversation:
                from apps.communication.application.conversation_phone_sync import (
                    resolve_outbound_phone,
                    sync_conversation_linked_phone,
                )

                conversation = sync_conversation_linked_phone(conversation)
                phone = resolve_outbound_phone(conversation)

        if not phone and recipients.veli_id:
            from apps.ogrenci.domain.models import OgrenciVeli

            veli = OgrenciVeli.objects.filter(
                id=recipients.veli_id,
                ogrenci__kurum_id=kurum_id,
            ).select_related('ogrenci').first()
            if veli:
                if not ContactResolver.veli_allows_outbound(veli, recipients.opt_in_category):
                    return SendResult(
                        success=False,
                        errors=['Veli bu tür bildirimleri almayı kabul etmemiş.'],
                    )
                from apps.ogrenci.application.veli_contact import effective_veli_phone

                phone = effective_veli_phone(veli, veli.ogrenci)
                if not phone:
                    phone = veli.telefon

        if not phone:
            return SendResult(success=False, errors=['Alıcı telefonu bulunamadı.'])

        try:
            e164 = ContactResolver.normalize(phone)
        except Exception as exc:
            return SendResult(success=False, errors=[str(exc)])

        if not conversation:
            resolved = ContactResolver.resolve_contact(kurum_id, e164)
            if recipients.ogrenci_id and not recipients.veli_id:
                thread_ogrenci_id = recipients.ogrenci_id
                thread_veli_id = None
                thread_contact_type = RecipientType.OGRENCI
            elif recipients.veli_id:
                veli_ogrenci_id = recipients.ogrenci_id
                if veli_ogrenci_id is None:
                    from apps.ogrenci.domain.models import OgrenciVeli

                    veli_row = OgrenciVeli.objects.filter(
                        id=recipients.veli_id,
                        ogrenci__kurum_id=kurum_id,
                    ).values_list('ogrenci_id', flat=True).first()
                    veli_ogrenci_id = veli_row
                thread_ogrenci_id = veli_ogrenci_id or resolved.ogrenci_id
                thread_veli_id = recipients.veli_id
                thread_contact_type = RecipientType.VELI
            else:
                thread_ogrenci_id = resolved.ogrenci_id or recipients.ogrenci_id
                thread_veli_id = resolved.veli_id or recipients.veli_id
                thread_contact_type = resolved.contact_type
            conversation, _ = ConversationRepository.get_or_create_for_contact(
                kurum_id=kurum_id,
                channel=channel,
                contact_phone=e164,
                contact_type=thread_contact_type,
                contact_identity=resolved.identity,
                ogrenci_id=thread_ogrenci_id,
                veli_id=thread_veli_id,
            )

        message_type = content.message_type
        if content.attachment_path and message_type == MessageType.TEXT:
            message_type = MessageType.DOCUMENT

        reply_to = None
        if content.reply_to_message_id:
            from apps.communication.domain.models import Message

            reply_to = Message.objects.filter(
                id=content.reply_to_message_id,
                conversation=conversation,
            ).first()

        message = MessageRepository.create(
            conversation=conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=message_type,
            body=content.text,
            status=MessageStatus.PENDING,
            sender_user_id=sender_user_id,
            source_module=source.module,
            source_ref_id=str(source.ref_id) if source.ref_id else '',
            reply_to=reply_to,
        )

        if content.attachment_path:
            from apps.communication.domain.models import MessageAttachment
            from django.core.files.base import ContentFile
            from django.core.files.storage import default_storage

            import os

            filename = content.attachment_filename or os.path.basename(content.attachment_path)
            mime = content.attachment_mime_type or (
                'application/pdf' if filename.lower().endswith('.pdf') else 'application/octet-stream'
            )
            attachment = MessageAttachment(
                message=message,
                original_name=filename,
                mime_type=mime,
            )
            if default_storage.exists(content.attachment_path):
                with default_storage.open(content.attachment_path, 'rb') as source:
                    data = source.read()
                attachment.file_size = len(data)
                attachment.file.save(
                    os.path.basename(content.attachment_path),
                    ContentFile(data),
                    save=True,
                )
            else:
                attachment.file = content.attachment_path
                attachment.save()

        ConversationRepository.update_on_message(
            conversation,
            preview=content.text or f'[{content.message_type}]',
            direction=MessageDirection.OUTBOUND,
        )

        queue_item = OutboundQueueRepository.enqueue(
            kurum_id=kurum_id,
            message=message,
            next_attempt_at=timezone.now(),
        )

        provider_response: dict[str, Any] = {}
        if process_immediately:
            client = self._dispatcher.get_client(channel)
            success = process_queue_item(queue_item, client)
            message.refresh_from_db()
            if not success:
                return SendResult(
                    success=False,
                    message_id=str(message.id),
                    errors=[message.failed_reason or 'Gönderim başarısız.'],
                )
            stub_id = message.provider_message_id or ''
            if stub_id.startswith('stub_'):
                return SendResult(
                    success=False,
                    message_id=str(message.id),
                    errors=['WhatsApp API yapılandırması eksik — mesaj simüle edildi, iletilmedi.'],
                )
            provider_response = {'processed_immediately': True}

        elif queue_item:
            from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

            dispatch_process_outbound_queue()
            message.refresh_from_db()
            if message.status not in (MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ):
                return SendResult(
                    success=False,
                    message_id=str(message.id),
                    errors=[message.failed_reason or 'Mesaj kuyruğa alındı ancak iletilemedi.'],
                )

        from apps.communication.application.conversation_phone_sync import resolve_outbound_phone

        return SendResult(
            success=True,
            message_id=str(message.id),
            provider_response=provider_response,
            sent_to_phone=resolve_outbound_phone(conversation),
            message_status=message.status,
        )

    def send_message(self, *args, **kwargs) -> SendResult:
        """Alias for send()."""
        return self.send(*args, **kwargs)

    def send_bulk(self, kurum_id: int, **kwargs) -> SendResult:
        """Toplu gönderim — CampaignService.create_draft + confirm."""
        from apps.communication.application.campaign_service import CampaignService

        service = CampaignService()
        try:
            campaign = service.create_draft(kurum_id, **kwargs)
            service.confirm(campaign, sender_user_id=kwargs.get('created_by_id'))
            return SendResult(success=True, message_id=str(campaign.id))
        except Exception as exc:
            return SendResult(success=False, errors=[str(exc)])

    def retry_failed(self, campaign_id: str) -> SendResult:
        """Başarısız kampanya mesajlarını yeniden kuyruğa al."""
        from apps.communication.application.campaign_service import CampaignService
        from apps.communication.domain.models import OutboundCampaign

        campaign = OutboundCampaign.objects.filter(id=campaign_id).first()
        if not campaign:
            return SendResult(success=False, errors=['Kampanya bulunamadı.'])
        result = CampaignService().retry_failed(campaign)
        return SendResult(success=True, provider_response=result)

    def preview_campaign(
        self,
        kurum_id: int,
        filter_json: dict | None = None,
        *,
        user=None,
        attachment_count: int = 0,
        ai_used: bool = False,
    ) -> dict:
        """Kampanya önizleme."""
        from apps.communication.application.campaign_service import CampaignService

        return CampaignService().preview(
            kurum_id,
            filter_json,
            user=user,
            attachment_count=attachment_count,
            ai_used=ai_used,
        )

    def test_whatsapp_connection(self, kurum_id: int) -> dict:
        """WhatsApp bağlantı testi."""
        return self._dispatcher.get_client(Channel.WHATSAPP).test_connection(kurum_id)
