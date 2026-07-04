"""
Meta template gönderimi testleri — mock Graph API.
"""
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.communication.application.outbound_processor import process_queue_item
from apps.communication.application.template_component_builder import (
    build_body_parameters,
    build_template_components,
)
from apps.communication.domain.enums import (
    Channel,
    MessageDirection,
    MessageStatus,
    MessageType,
    RecipientType,
)
from apps.communication.domain.models import Conversation, Message, OutboundCampaign, OutboundQueueItem
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.kurum.domain.models import Kurum

User = get_user_model()


class TemplateComponentBuilderTest(TestCase):
    def test_build_body_parameters_in_order(self):
        body = 'Merhaba {{veli_ad}}, {{ogrenci_ad}} için bilgilendirme.'
        ctx = {'veli_ad': 'Ayşe Hanım', 'ogrenci_ad': 'Ali Yılmaz'}
        params = build_body_parameters(body, ctx)
        self.assertEqual(len(params), 2)
        self.assertEqual(params[0]['text'], 'Ayşe Hanım')
        self.assertEqual(params[1]['text'], 'Ali Yılmaz')

    def test_build_template_components_body_only(self):
        components = build_template_components('{{veli_ad}}', {'veli_ad': 'Test'})
        self.assertEqual(components[0]['type'], 'body')
        self.assertEqual(components[0]['parameters'][0]['text'], 'Test')


class WhatsAppTemplateSendTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Tpl Kurum', kod='TPLKUR')
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905551112233',
            contact_type=RecipientType.RAW_PHONE,
        )
        self.campaign = OutboundCampaign.objects.create(
            kurum=self.kurum,
            body_template='Merhaba {{veli_ad}}',
            recipient_filter_json={
                'template_name': 'hello_world',
                'template_language': 'tr',
            },
            status='CONFIRMED',
        )
        self.message = Message.objects.create(
            conversation=self.conversation,
            campaign=self.campaign,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEMPLATE,
            body='Merhaba Test Veli',
            status=MessageStatus.PENDING,
        )
        self.queue_item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            campaign=self.campaign,
            message=self.message,
            next_attempt_at=timezone.now(),
        )

    @patch.object(WhatsAppCloudClient, 'send_template')
    def test_outbound_processor_calls_send_template(self, mock_send):
        mock_send.return_value = {'success': True, 'messages': [{'id': 'wamid.test123'}]}

        client = WhatsAppCloudClient()
        ok = process_queue_item(self.queue_item, client)
        self.assertTrue(ok)
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs['template_name'], 'hello_world')
        self.assertEqual(kwargs['language_code'], 'tr')
        self.assertTrue(kwargs['components'])

    def test_send_template_payload_structure(self):
        client = WhatsAppCloudClient()
        with patch.object(client, '_post_message') as mock_post:
            mock_post.return_value = {'success': True, 'messages': [{'id': 'x'}]}
            client.send_template(
                self.kurum.id,
                '+905551112233',
                template_name='hello_world',
                language_code='tr',
                components=[{'type': 'body', 'parameters': [{'type': 'text', 'text': 'Ali'}]}],
            )
            payload = mock_post.call_args[0][1]
            self.assertEqual(payload['type'], 'template')
            self.assertEqual(payload['template']['name'], 'hello_world')
            self.assertEqual(payload['template']['language']['code'], 'tr')
