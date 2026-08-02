"""WhatsApp Meta şablon mapper / service / webhook / send-guard testleri."""
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.communication.application.meta_template_mapper import (
    build_meta_components,
    build_send_body_parameters,
    build_variable_map,
    map_meta_status,
    named_to_numbered,
)
from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.application.outbound_processor import process_queue_item
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
    OutboundCampaign,
    OutboundQueueItem,
    WhatsAppMetaTemplate,
)
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.kurum.domain.models import Kurum


class MetaTemplateMapperTest(TestCase):
    def test_variable_map_order(self):
        body = 'Merhaba {{ogrenci_ad}}\n{{kurum_ad}} ailesine hoş geldiniz.\nŞubeniz:\n{{sube}}'
        vmap = build_variable_map(body)
        self.assertEqual(vmap, {'1': 'ogrenci_ad', '2': 'kurum_ad', '3': 'sube'})
        numbered = named_to_numbered(body, vmap)
        self.assertIn('{{1}}', numbered)
        self.assertIn('{{2}}', numbered)
        self.assertIn('{{3}}', numbered)
        self.assertNotIn('ogrenci_ad', numbered)

    def test_build_meta_components_body_example(self):
        components, vmap = build_meta_components(
            body_named='Merhaba {{veli_ad}}, tutar: {{taksit_tutar}}',
            footer_text='3K Kampüs',
        )
        self.assertEqual(vmap['1'], 'veli_ad')
        body = next(c for c in components if c['type'] == 'BODY')
        self.assertIn('{{1}}', body['text'])
        self.assertIn('{{2}}', body['text'])
        self.assertIn('example', body)

    def test_send_params_follow_map(self):
        vmap = {'1': 'veli_ad', '2': 'ogrenci_ad'}
        params = build_send_body_parameters(vmap, {'veli_ad': 'Ayşe', 'ogrenci_ad': 'Ali'})
        self.assertEqual(params[0]['text'], 'Ayşe')
        self.assertEqual(params[1]['text'], 'Ali')

    def test_map_meta_status(self):
        self.assertEqual(map_meta_status('APPROVED'), MetaTemplateStatus.APPROVED)
        self.assertEqual(map_meta_status('REJECTED'), MetaTemplateStatus.REJECTED)


class MetaTemplateServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Meta Kurum', kod='METAK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn1',
            waba_id='waba1',
            is_active=True,
            is_default=True,
        )

    def test_create_draft_builds_map(self):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='hosgeldin',
            body_named='Merhaba {{ogrenci_ad}} — {{kurum_ad}}',
        )
        self.assertEqual(tpl.status, MetaTemplateStatus.DRAFT)
        self.assertEqual(tpl.variable_map_json['1'], 'ogrenci_ad')
        self.assertEqual(tpl.variable_map_json['2'], 'kurum_ad')

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_calls_meta(self, mock_create):
        mock_create.return_value = {'success': True, 'id': '123', 'status': 'PENDING'}
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='odeme_hatirlat',
            body_named='{{veli_ad}} taksit: {{taksit_tutar}}',
        )
        tpl = MetaTemplateService.submit(tpl)
        self.assertEqual(tpl.meta_template_id, '123')
        self.assertIn(tpl.status, (MetaTemplateStatus.PENDING, MetaTemplateStatus.SUBMITTED))
        mock_create.assert_called_once()
        kwargs = mock_create.call_args.kwargs
        self.assertEqual(kwargs['name'], 'odeme_hatirlat')
        body = next(c for c in kwargs['components'] if c['type'] == 'BODY')
        self.assertIn('{{1}}', body['text'])

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_media_header_requires_handle(self, mock_create):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='gorselli',
            body_named='Merhaba {{ogrenci_ad}}',
            header_json={'type': 'IMAGE'},
        )
        with self.assertRaises(MetaTemplateServiceError):
            MetaTemplateService.submit(tpl)
        mock_create.assert_not_called()

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_media_header_sends_handle(self, mock_create):
        mock_create.return_value = {'success': True, 'id': '456', 'status': 'PENDING'}
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='gorselli_ok',
            body_named='Merhaba {{ogrenci_ad}}',
            header_json={'type': 'IMAGE', 'example_handle': '4::aW1hZ2UvcG5n:ARZ'},
        )
        MetaTemplateService.submit(tpl)
        components = mock_create.call_args.kwargs['components']
        header = next(c for c in components if c['type'] == 'HEADER')
        self.assertEqual(header['format'], 'IMAGE')
        self.assertEqual(header['example']['header_handle'], ['4::aW1hZ2UvcG5n:ARZ'])

    def test_approved_cannot_update(self):
        tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='locked',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Hi {{veli_ad}}',
            variable_map_json={'1': 'veli_ad'},
        )
        with self.assertRaises(MetaTemplateServiceError):
            MetaTemplateService.update_draft(tpl, body_named='Changed')

    @patch.object(WhatsAppCloudClient, 'list_message_templates')
    def test_sync_upserts(self, mock_list):
        mock_list.return_value = {
            'success': True,
            'templates': [{
                'id': 'm1',
                'name': 'hello_world',
                'language': 'tr',
                'status': 'APPROVED',
                'category': 'UTILITY',
                'components': [
                    {'type': 'BODY', 'text': 'Hello {{1}}'},
                ],
            }],
        }
        result = MetaTemplateService.sync_account(self.account)
        self.assertTrue(result['success'])
        self.assertEqual(result['upserted'], 1)
        tpl = WhatsAppMetaTemplate.objects.get(name='hello_world', language='tr')
        self.assertEqual(tpl.status, MetaTemplateStatus.APPROVED)

    def test_webhook_status_update(self):
        tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='pending_tpl',
            language='tr',
            status=MetaTemplateStatus.PENDING,
            body_named='x',
        )
        n = MetaTemplateService.apply_webhook_status(
            phone_number_id='pn1',
            event={
                'event': 'APPROVED',
                'message_template_name': 'pending_tpl',
                'message_template_language': 'tr',
            },
        )
        self.assertEqual(n, 1)
        tpl.refresh_from_db()
        self.assertEqual(tpl.status, MetaTemplateStatus.APPROVED)


class MetaTemplateSendGuardTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Send Kurum', kod='SENDK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn2',
            waba_id='waba2',
            is_active=True,
            is_default=True,
        )
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905551112233',
            contact_type=RecipientType.RAW_PHONE,
            channel_config=self.account,
        )

    @patch.object(WhatsAppCloudClient, 'send_template')
    def test_rejected_template_blocked(self, mock_send):
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='blocked_tpl',
            language='tr',
            status=MetaTemplateStatus.REJECTED,
            body_named='Merhaba {{veli_ad}}',
            variable_map_json={'1': 'veli_ad'},
        )
        campaign = OutboundCampaign.objects.create(
            kurum=self.kurum,
            body_template='Merhaba {{veli_ad}}',
            recipient_filter_json={
                'template_name': 'blocked_tpl',
                'template_language': 'tr',
                'channel_config_id': str(self.account.id),
            },
            status='CONFIRMED',
        )
        message = Message.objects.create(
            conversation=self.conversation,
            campaign=campaign,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEMPLATE,
            body='x',
            status=MessageStatus.PENDING,
        )
        item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            campaign=campaign,
            message=message,
            next_attempt_at=timezone.now(),
        )
        ok = process_queue_item(item, WhatsAppCloudClient(channel_config=self.account))
        self.assertFalse(ok)
        mock_send.assert_not_called()

    @patch.object(WhatsAppCloudClient, 'send_template')
    def test_approved_uses_variable_map(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.x'}]}
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='ok_tpl',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Merhaba {{veli_ad}}',
            variable_map_json={'1': 'veli_ad'},
            approved_at=timezone.now(),
        )
        campaign = OutboundCampaign.objects.create(
            kurum=self.kurum,
            body_template='Merhaba {{veli_ad}}',
            recipient_filter_json={
                'template_name': 'ok_tpl',
                'template_language': 'tr',
                'channel_config_id': str(self.account.id),
            },
            status='CONFIRMED',
        )
        message = Message.objects.create(
            conversation=self.conversation,
            campaign=campaign,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEMPLATE,
            body='x',
            status=MessageStatus.PENDING,
        )
        item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            campaign=campaign,
            message=message,
            next_attempt_at=timezone.now(),
        )
        ok = process_queue_item(item, WhatsAppCloudClient(channel_config=self.account))
        self.assertTrue(ok)
        mock_send.assert_called_once()
        components = mock_send.call_args.kwargs['components']
        self.assertEqual(components[0]['type'], 'body')
