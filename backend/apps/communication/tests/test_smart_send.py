"""
Akıllı gönderim — 24 saatlik pencere, şablona düşme ve toplu gönderim kuralı.

Kullanıcı 24 saat kuralını bilmek zorunda değildir: pencere açıkken serbest mesaj,
kapalıyken Meta şablonu, toplu gönderimde her zaman şablon kullanılır.
"""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.communication.application.campaign_service import CampaignService
from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
)
from apps.communication.application.notification_dispatcher import (
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_template_resolver import resolve_binding
from apps.communication.application.outbound_processor import process_queue_item
from apps.communication.application.session_window import (
    STATE_EXPIRED,
    STATE_NEVER,
    STATE_OPEN,
    is_session_error,
    window_for_recipient,
    window_from_timestamp,
)
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
    MessageTemplate,
    NotificationTemplateBinding,
    OutboundQueueItem,
    WhatsAppMetaTemplate,
)
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.tests.session_helpers import close_session_window, open_session_window
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube


class SessionWindowTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Pencere Kurum', kod='WIN')

    def test_recent_inbound_keeps_window_open(self):
        window = window_from_timestamp(timezone.now() - timedelta(hours=2))
        self.assertEqual(window.state, STATE_OPEN)
        self.assertTrue(window.is_open)
        self.assertGreater(window.seconds_left, 0)
        self.assertEqual(window.notice, '')

    def test_old_inbound_closes_window(self):
        window = window_from_timestamp(timezone.now() - timedelta(hours=25))
        self.assertEqual(window.state, STATE_EXPIRED)
        self.assertFalse(window.is_open)
        self.assertEqual(window.seconds_left, 0)
        self.assertTrue(window.notice)

    def test_no_inbound_means_never(self):
        window = window_from_timestamp(None)
        self.assertEqual(window.state, STATE_NEVER)
        self.assertFalse(window.is_open)

    def test_non_whatsapp_channel_has_no_limit(self):
        window = window_from_timestamp(None, channel=Channel.SMS)
        self.assertTrue(window.is_open)

    def test_recipient_window_uses_most_recent_thread(self):
        """Aynı numaraya ait ikinci bir sohbet açıksa kişi engellenmemeli."""
        Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905551110000',
            last_customer_message_at=timezone.now() - timedelta(hours=40),
        )
        Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905551110000',
            subject='İkinci thread',
            last_customer_message_at=timezone.now() - timedelta(minutes=10),
        )
        window = window_for_recipient(self.kurum.id, phone='05551110000')
        self.assertEqual(window.state, STATE_OPEN)

    def test_inbound_message_opens_window(self):
        conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905551110001',
        )
        ConversationRepository.update_on_message(
            conversation, preview='Merhaba', direction=MessageDirection.INBOUND,
        )
        conversation.refresh_from_db()
        self.assertIsNotNone(conversation.last_customer_message_at)
        self.assertTrue(window_for_recipient(self.kurum.id, phone='05551110001').is_open)

    def test_meta_error_131047_is_detected(self):
        self.assertTrue(is_session_error({'success': False, 'error_code': 131047}))
        self.assertTrue(is_session_error({'success': False, 'error': 'Bir hata (#131047)'}))
        self.assertFalse(is_session_error({'success': False, 'error': 'Invalid parameter'}))


class SmartChannelSelectionTest(TestCase):
    """Pencere durumu, serbest mesaj ↔ Meta şablonu kararını belirler."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Akıllı Kurum', kod='SMART')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-smart',
            waba_id='waba-smart',
            is_active=True,
            is_default=True,
        )
        self.meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{ogrenci_ad}} bugün derse gelmedi.',
            approved_at=timezone.now(),
        )

    def test_auto_mode_prefers_freeform_while_window_open(self):
        resolved = resolve_binding(self.kurum.id, 'yoklama.gelmedi', RecipientType.VELI)
        self.assertFalse(resolved.use_meta(needs_document=False, session_open=True))

    def test_auto_mode_switches_to_meta_when_window_closed(self):
        resolved = resolve_binding(self.kurum.id, 'yoklama.gelmedi', RecipientType.VELI)
        self.assertTrue(resolved.use_meta(needs_document=False, session_open=False))

    def test_meta_only_mode_ignores_open_window(self):
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            meta_template=self.meta,
            send_mode='META_ONLY',
        )
        resolved = resolve_binding(self.kurum.id, 'yoklama.gelmedi', RecipientType.VELI)
        self.assertTrue(resolved.use_meta(needs_document=False, session_open=True))

    def test_preview_reports_closed_window_without_meta_template(self):
        self.meta.delete()
        close_session_window(self.kurum.id)
        Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905559990000',
            last_customer_message_at=timezone.now() - timedelta(hours=48),
        )
        preview = dispatch_event(
            self.kurum.id,
            'yoklama.gelmedi',
            recipient=NotificationRecipient(
                recipient_type=RecipientType.VELI, phone='05559990000',
            ),
            context={'ogrenci_ad': 'Ali', 'tarih': '03.08.2026'},
            dry_run=True,
        )
        self.assertFalse(preview.session_is_open)
        self.assertFalse(preview.meta_available)
        self.assertTrue(preview.blocked_reason)


class FreeformFailFastTest(TestCase):
    """Pencere kapalıyken serbest mesaj Meta'ya hiç gitmemeli."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='FailFast Kurum', kod='FFAST')
        CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-ff',
            waba_id='waba-ff',
            is_active=True,
            is_default=True,
        )

    def _send_text(self, phone: str):
        return CommunicationService().send(
            self.kurum.id,
            recipients=RecipientQuery(phone=phone),
            content=MessageContent(text='Merhaba'),
            source=MessageSource(module='test', ref_id='1'),
            process_immediately=False,
        )

    def test_open_window_allows_freeform(self):
        open_session_window(self.kurum.id, '05551234567')
        result = self._send_text('05551234567')
        self.assertTrue(result.success)

    def test_closed_window_blocks_freeform(self):
        open_session_window(self.kurum.id, '05551234567')
        close_session_window(self.kurum.id, '05551234567')
        result = self._send_text('05551234567')
        self.assertFalse(result.success)
        self.assertTrue(result.session_expired)
        self.assertTrue(result.session)
        self.assertFalse(result.session['is_open'])

    @override_settings(COMMUNICATION_ENFORCE_SESSION_WINDOW=False)
    def test_enforcement_can_be_disabled(self):
        open_session_window(self.kurum.id, '05551234567')
        close_session_window(self.kurum.id, '05551234567')
        self.assertTrue(self._send_text('05551234567').success)


class SessionFallbackRetryTest(TestCase):
    """Meta 131047 dönerse aynı içerik onaylı şablonla tek sefer yeniden denenir."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Fallback Kurum', kod='FBACK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-fb',
            waba_id='waba-fb',
            is_active=True,
            is_default=True,
        )
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='bilgilendirme',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{ogrenci_ad}} hakkında bilgilendirme.',
            approved_at=timezone.now(),
        )
        self.conversation = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            channel_config=self.account,
            contact_phone='+905551112233',
            contact_type=RecipientType.RAW_PHONE,
        )
        self.message = Message.objects.create(
            conversation=self.conversation,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEXT,
            body='Merhaba',
            status=MessageStatus.PENDING,
        )

    def _queue_item(self, send_options: dict | None = None) -> OutboundQueueItem:
        return OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=self.message,
            next_attempt_at=timezone.now(),
            send_options=send_options or {},
        )

    @patch.object(WhatsAppCloudClient, 'send_template')
    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_falls_back_to_template_on_session_error(self, mock_text, mock_template):
        mock_text.return_value = {'success': False, 'error': 'Re-engagement message (#131047)'}
        mock_template.return_value = {'success': True, 'messages': [{'id': 'wamid.fb'}]}

        item = self._queue_item({
            'session_fallback': {
                'template_name': 'bilgilendirme',
                'template_language': 'tr',
                'channel_config_id': str(self.account.id),
                'template_context': {'ogrenci_ad': 'Ali'},
            },
        })
        self.assertTrue(process_queue_item(item, WhatsAppCloudClient()))
        self.assertEqual(mock_template.call_args.kwargs['template_name'], 'bilgilendirme')
        self.message.refresh_from_db()
        self.assertEqual(self.message.message_type, MessageType.TEMPLATE)

    @patch.object(WhatsAppCloudClient, 'send_text')
    def test_session_error_without_fallback_is_permanent(self, mock_text):
        mock_text.return_value = {'success': False, 'error': 'Re-engagement message (#131047)'}
        item = self._queue_item()
        self.assertFalse(process_queue_item(item, WhatsAppCloudClient()))
        item.refresh_from_db()
        self.message.refresh_from_db()
        # Kalıcı hata: deneme hakkı tükenir, kuyruk aynı mesajı tekrar denemez
        self.assertEqual(item.attempt_count, item.max_attempts)
        self.assertEqual(self.message.status, MessageStatus.FAILED)


class CampaignTemplateRequirementTest(TestCase):
    """Toplu gönderim yalnızca Meta onaylı şablonla yapılabilir."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Toplu Kurum', kod='BULK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='BULKM')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='12-A',
            kod='12A',
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-bulk',
            waba_id='waba-bulk',
            is_active=True,
            is_default=True,
        )
        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            telefon='05321111111',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=ogrenci,
            sinif=self.sinif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Yılmaz',
            telefon='05323333333',
            sms_bildirimleri=['duyuru'],
        )
        self.audience = {
            'audience_type': 'sinif',
            'sinif_id': self.sinif.id,
            'egitim_yili_id': self.egitim_yili.id,
        }
        self.meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='genel_duyuru',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{mesaj}} bilginize sunulur.',
            approved_at=timezone.now(),
        )

    def test_freeform_bulk_is_rejected(self):
        with self.assertRaises(ValidationError):
            CampaignService().create_draft(
                self.kurum.id,
                created_by_id=None,
                body='Yarın okul tatil.',
                audience_filter=self.audience,
            )

    def test_approved_template_is_accepted(self):
        campaign = CampaignService().create_draft(
            self.kurum.id,
            created_by_id=None,
            template_name='genel_duyuru',
            template_language='tr',
            audience_filter=self.audience,
        )
        self.assertEqual(campaign.recipient_filter_json['template_name'], 'genel_duyuru')

    def test_app_template_uses_its_paired_meta_template(self):
        """Kullanıcı uygulama şablonu seçtiğinde Meta karşılığı otomatik kullanılır."""
        app_template = MessageTemplate.objects.create(
            kurum=self.kurum,
            name='Genel duyuru',
            body='Sayın velimiz, {{mesaj}} bilginize sunulur.',
            meta_template=self.meta,
        )
        campaign = CampaignService().create_draft(
            self.kurum.id,
            created_by_id=None,
            template_id=app_template.id,
            audience_filter=self.audience,
        )
        self.assertEqual(campaign.recipient_filter_json['template_name'], 'genel_duyuru')
