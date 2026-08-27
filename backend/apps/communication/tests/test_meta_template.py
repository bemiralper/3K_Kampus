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
    MetaTemplateUsage,
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

    def test_build_meta_components_uses_example_overrides(self):
        components, _vmap = build_meta_components(
            body_named='Sayın {{veli_ad}},\n\n{{sube}} duyurusu:\n\n{{mesaj}}\n\nBilginize sunarız.',
            example_values={'mesaj': 'Yarın saat 10.00’da deneme sınavı yapılacaktır.'},
        )
        body = next(c for c in components if c['type'] == 'BODY')
        examples = body['example']['body_text'][0]
        self.assertIn('Yarın saat 10.00’da deneme sınavı yapılacaktır.', examples)

    def test_footer_variables_frozen_to_static_text(self):
        """Meta FOOTER parametre kabul etmez; değişken sabit metne çevrilmeli."""
        components, _vmap = build_meta_components(
            body_named='Sayın {{veli_ad}}, bilgilendirme metnidir.',
            footer_text='3K Kampüs — {{sube}}',
        )
        footer = next(c for c in components if c['type'] == 'FOOTER')
        self.assertNotIn('{{', footer['text'])
        self.assertIn('Merkez', footer['text'])
        self.assertNotIn('example', footer)

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

    def test_set_usage_scope_on_approved(self):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='kullanim_alani',
            body_named='Merhaba, bilgilendirme metni.',
            usage_scope=MetaTemplateUsage.ALL,
        )
        tpl.status = MetaTemplateStatus.APPROVED
        tpl.save(update_fields=['status'])
        MetaTemplateService.set_usage_scope(tpl, MetaTemplateUsage.CAMPAIGN)
        tpl.refresh_from_db()
        self.assertEqual(tpl.usage_scope, MetaTemplateUsage.CAMPAIGN)
        # İçerik güncellemesi hâlâ engelli
        with self.assertRaises(MetaTemplateServiceError):
            MetaTemplateService.update_draft(tpl, body_named='Yeni metin burada.')

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_calls_meta(self, mock_create):
        mock_create.return_value = {'success': True, 'id': '123', 'status': 'PENDING'}
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='odeme_hatirlat',
            body_named='Sayın {{veli_ad}}, taksit tutarı {{taksit_tutar}} olarak görünüyor.',
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
    def test_submit_sends_custom_mesaj_example(self, mock_create):
        mock_create.return_value = {'success': True, 'id': '456', 'status': 'PENDING'}
        sample = 'Yarın saat 10.00’da deneme sınavı A salonunda yapılacaktır.'
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='duyuru_metin',
            body_named='Sayın {{veli_ad}},\n\n{{sube}} duyurusu:\n\n{{mesaj}}\n\nBilginize sunarız.',
            example_values_json={'mesaj': sample},
        )
        MetaTemplateService.submit(tpl)
        body = next(c for c in mock_create.call_args.kwargs['components'] if c['type'] == 'BODY')
        self.assertIn(sample, body['example']['body_text'][0])

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_media_header_requires_handle(self, mock_create):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='gorselli',
            body_named='Merhaba {{ogrenci_ad}}, görsel ektedir.',
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
            body_named='Merhaba {{ogrenci_ad}}, görsel ektedir.',
            header_json={'type': 'IMAGE', 'example_handle': '4::aW1hZ2UvcG5n:ARZ'},
        )
        MetaTemplateService.submit(tpl)
        components = mock_create.call_args.kwargs['components']
        header = next(c for c in components if c['type'] == 'HEADER')
        self.assertEqual(header['format'], 'IMAGE')
        self.assertEqual(header['example']['header_handle'], ['4::aW1hZ2UvcG5n:ARZ'])

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_rejects_body_starting_or_ending_with_variable(self, mock_create):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='odev_plani_veli',
            body_named='{{ogrenci_ad}} — {{hafta}} ödev planı ektedir. {{teslim_tarihi}}',
        )
        with self.assertRaises(MetaTemplateServiceError) as ctx:
            MetaTemplateService.submit(tpl)
        self.assertIn('değişkenle başlayamaz', str(ctx.exception))
        self.assertIn('değişkenle bitemez', str(ctx.exception))
        mock_create.assert_not_called()

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_allows_lone_variable_body_with_header_and_footer(self, mock_create):
        """Başlık + alt bilgi varsa gövde tek başına değişken olabilir."""
        mock_create.return_value = {'success': True, 'id': '901', 'status': 'PENDING'}
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='genel_toplu_duyuru',
            body_named='{{mesaj}}',
            header_json={'type': 'TEXT', 'text': 'DUYURU'},
            footer_text='3K Kampüs / 3K keşif',
        )
        MetaTemplateService.submit(tpl)
        mock_create.assert_called_once()
        body = next(c for c in mock_create.call_args.kwargs['components'] if c['type'] == 'BODY')
        self.assertEqual(body['text'], '{{1}}')

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_rejects_adjacent_variables(self, mock_create):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='yan_yana',
            body_named='Sayın {{veli_ad}} {{ogrenci_ad}} için bilgilendirme.',
        )
        with self.assertRaises(MetaTemplateServiceError) as ctx:
            MetaTemplateService.submit(tpl)
        self.assertIn('yan yana', str(ctx.exception))
        mock_create.assert_not_called()

    @patch.object(WhatsAppCloudClient, 'create_message_template')
    def test_submit_accepts_compliant_document_body(self, mock_create):
        mock_create.return_value = {'success': True, 'id': '789', 'status': 'PENDING'}
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='odev_plani_veli_ok',
            body_named=(
                'Sayın {{veli_ad}}, {{ogrenci_ad}} için haftalık ödev planı ektedir. '
                'Teslim tarihi: {{teslim_tarihi}}. İyi çalışmalar.'
            ),
            header_json={'type': 'DOCUMENT', 'example_handle': '4::YXBwbGljYXRpb24=:ARZ'},
        )
        MetaTemplateService.submit(tpl)
        components = mock_create.call_args.kwargs['components']
        header = next(c for c in components if c['type'] == 'HEADER')
        self.assertEqual(header['format'], 'DOCUMENT')

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
    def test_sync_preserves_named_vars_and_heals_numbered(self, mock_list):
        """Meta {{1}} dönse bile variable_map / named gövde korunur; bozuk {{1}} iyileşir."""
        mock_list.return_value = {
            'success': True,
            'templates': [{
                'id': 'm-lib',
                'name': 'kutuphane_gelmedi_veli',
                'language': 'tr',
                'status': 'APPROVED',
                'category': 'UTILITY',
                'components': [
                    {
                        'type': 'BODY',
                        'text': (
                            'Değerli Velimiz,\nÖğrencimiz {{1}} bugün kütüphane '
                            '{{2}} oturumununa katılmamıştır.'
                        ),
                    },
                ],
            }],
        }
        # Önce named + map
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='kutuphane_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named=(
                'Değerli Velimiz,\nÖğrencimiz {{ogrenci_ad}} bugün kütüphane '
                '{{oturum}} oturumununa katılmamıştır.'
            ),
            variable_map_json={'1': 'ogrenci_ad', '2': 'oturum'},
        )
        result = MetaTemplateService.sync_account(self.account)
        self.assertTrue(result['success'])
        tpl = WhatsAppMetaTemplate.objects.get(name='kutuphane_gelmedi_veli')
        self.assertIn('{{ogrenci_ad}}', tpl.body_named)
        self.assertIn('{{oturum}}', tpl.body_named)
        self.assertNotIn('{{1}}', tpl.body_named)

        # Simüle bozulmuş kayıt (yalnızca numaralı gövde + map)
        tpl.body_named = (
            'Değerli Velimiz,\nÖğrencimiz {{1}} bugün kütüphane '
            '{{2}} oturumununa katılmamıştır.'
        )
        tpl.save(update_fields=['body_named', 'updated_at'])
        MetaTemplateService.sync_account(self.account)
        tpl.refresh_from_db()
        self.assertIn('{{ogrenci_ad}}', tpl.body_named)
        self.assertNotIn('{{1}}', tpl.body_named)

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

    @patch.object(WhatsAppCloudClient, 'list_message_templates')
    def test_sync_reverts_missing_pending_to_draft(self, mock_list):
        mock_list.return_value = {
            'success': True,
            'templates': [{
                'id': 'keep',
                'name': 'kalan_sablon',
                'language': 'tr',
                'status': 'APPROVED',
                'category': 'UTILITY',
                'components': [{'type': 'BODY', 'text': 'Merhaba'}],
            }],
        }
        gone = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='silinen_inceleme',
            language='tr',
            status=MetaTemplateStatus.PENDING,
            meta_template_id='old-123',
            body_named='Sayın {{veli_ad}},\n\n{{mesaj}}',
        )
        local_draft = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yalniz_taslak',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Yerel taslak {{mesaj}}',
        )
        result = MetaTemplateService.sync_account(self.account)
        self.assertTrue(result['success'])
        self.assertEqual(result['reverted'], 1)
        gone.refresh_from_db()
        local_draft.refresh_from_db()
        self.assertEqual(gone.status, MetaTemplateStatus.DRAFT)
        self.assertEqual(gone.meta_template_id, '')
        self.assertEqual(local_draft.status, MetaTemplateStatus.DRAFT)

    @patch.object(WhatsAppCloudClient, 'list_message_templates')
    def test_sync_skips_mass_revert_when_meta_list_empty(self, mock_list):
        mock_list.return_value = {'success': True, 'templates': []}
        approved = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='onayli_kalan',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            meta_template_id='keep-1',
            body_named='Onaylı metin',
        )
        result = MetaTemplateService.sync_account(self.account)
        self.assertTrue(result['success'])
        self.assertEqual(result['reverted'], 0)
        approved.refresh_from_db()
        self.assertEqual(approved.status, MetaTemplateStatus.APPROVED)

    @patch.object(WhatsAppCloudClient, 'get_message_template')
    def test_refresh_status_reverts_when_missing_on_meta(self, mock_get):
        mock_get.return_value = {
            'success': False,
            'error': 'Şablon Meta üzerinde bulunamadı.',
            'template': None,
        }
        tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='silinen_refresh',
            language='tr',
            status=MetaTemplateStatus.PENDING,
            meta_template_id='old-456',
            body_named='{{mesaj}}',
        )
        refreshed = MetaTemplateService.refresh_status(tpl)
        self.assertEqual(refreshed.status, MetaTemplateStatus.DRAFT)
        self.assertEqual(refreshed.meta_template_id, '')

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
