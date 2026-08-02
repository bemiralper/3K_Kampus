"""Meta DOCUMENT-header template + PDF eki — tek WhatsApp mesajı."""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.utils import timezone

from apps.communication.application.outbound_processor import process_queue_item
from apps.communication.application.template_media_header import build_media_header_component
from apps.communication.domain.enums import (
    Channel,
    MessageDirection,
    MessageStatus,
    MessageType,
    MetaTemplateStatus,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    Message,
    MessageAttachment,
    OutboundQueueItem,
    WhatsAppMetaTemplate,
)
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.kurum.domain.models import Kurum

User = get_user_model()

MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'


class TemplateMediaHeaderUnitTest(TestCase):
    def test_document_header_with_media_id(self):
        comp = build_media_header_component(
            header_type='DOCUMENT',
            media_id='media123',
            filename='odev.pdf',
        )
        self.assertEqual(comp['type'], 'header')
        param = comp['parameters'][0]
        self.assertEqual(param['type'], 'document')
        self.assertEqual(param['document']['id'], 'media123')
        self.assertEqual(param['document']['filename'], 'odev.pdf')

    def test_requires_media_or_https_link(self):
        self.assertIsNone(build_media_header_component(header_type='DOCUMENT'))
        self.assertIsNone(build_media_header_component(
            header_type='DOCUMENT', link='http://localhost/x.pdf',
        ))

    def test_filename_sanitized(self):
        from apps.communication.application.template_media_header import sanitize_document_filename
        name = sanitize_document_filename('Ali Yılmaz — 4. Hafta.pdf')
        self.assertTrue(name.endswith('.pdf'))
        self.assertNotIn(' ', name)
        self.assertTrue(name.isascii())


class TemplateDocumentOutboundTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='DocTpl Kurum', kod='DTPL')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-doc',
            waba_id='waba-doc',
            is_active=True,
            is_default=True,
        )
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905559998877',
            contact_type=RecipientType.RAW_PHONE,
            channel_config=self.account,
        )
        self.meta_tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='odev_plani_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='{{ogrenci_ad}} — {{hafta}} ödev planı ektedir.',
            header_json={'type': 'DOCUMENT', 'example_handle': '4::example'},
            variable_map_json={'1': 'ogrenci_ad', '2': 'hafta'},
            approved_at=timezone.now(),
        )

    @patch.object(WhatsAppCloudClient, 'upload_media', return_value='media_uploaded_1')
    @patch.object(WhatsAppCloudClient, 'send_template')
    def test_send_options_document_header_template(self, mock_send, mock_upload):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.doc1'}]}

        message = Message.objects.create(
            conversation=self.conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEMPLATE,
            body='Önizleme',
            status=MessageStatus.PENDING,
            source_module='odev',
        )
        att = MessageAttachment(
            message=message,
            original_name='Ali-Yilmaz-4-Hafta-Odev-Plani.pdf',
            mime_type='application/pdf',
            file_size=len(MINIMAL_PDF),
        )
        att.file.save('odev.pdf', ContentFile(MINIMAL_PDF), save=True)

        item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=message,
            next_attempt_at=timezone.now(),
            send_options={
                'template_name': 'odev_plani_veli',
                'template_language': 'tr',
                'channel_config_id': str(self.account.id),
                'template_context': {
                    'ogrenci_ad': 'Ali',
                    'hafta': '4. Hafta',
                },
            },
        )

        ok = process_queue_item(item, WhatsAppCloudClient(channel_config=self.account))
        self.assertTrue(ok, item.last_error)
        mock_send.assert_called_once()
        components = mock_send.call_args.kwargs['components']
        self.assertEqual(components[0]['type'], 'header')
        self.assertEqual(components[0]['parameters'][0]['type'], 'document')
        self.assertEqual(components[0]['parameters'][0]['document']['id'], 'media_uploaded_1')
        self.assertEqual(components[1]['type'], 'body')
        body_texts = [p['text'] for p in components[1]['parameters']]
        self.assertEqual(body_texts, ['Ali', '4. Hafta'])
        mock_upload.assert_called()

    @patch.object(WhatsAppCloudClient, 'upload_media', return_value=None)
    @patch.object(WhatsAppCloudClient, 'send_template')
    def test_document_header_without_media_fails(self, mock_send, _mock_upload):
        message = Message.objects.create(
            conversation=self.conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEMPLATE,
            body='x',
            status=MessageStatus.PENDING,
        )
        # attachment yok → header üretilemez
        item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=message,
            next_attempt_at=timezone.now(),
            send_options={
                'template_name': 'odev_plani_veli',
                'template_language': 'tr',
                'channel_config_id': str(self.account.id),
            },
        )
        ok = process_queue_item(item, WhatsAppCloudClient(channel_config=self.account))
        self.assertFalse(ok)
        mock_send.assert_not_called()
        item.refresh_from_db()
        self.assertIn('header', item.last_error.lower())
