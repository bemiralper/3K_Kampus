"""Kütüphane yoklama Meta/LMS seed."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from django.utils import timezone

from apps.communication.application.kutuphane_yoklama_template_seed import (
    KutuphaneYoklamaTemplateSeedService,
    list_kutuphane_yoklama_template_drafts,
    repair_kutuphane_yoklama_bindings,
)
from apps.communication.application.notification_events import get_event
from apps.communication.domain.enums import Channel, MetaTemplateStatus, RecipientType
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    NotificationTemplateBinding,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class KutuphaneYoklamaSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kütüphane Seed', kod='KSEED')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KSM')
        self.user = User.objects.create_superuser(
            username='kseed_admin', email='kseed@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_kseed',
            waba_id='waba_kseed',
            is_default=True,
            is_active=True,
        )

    def test_drafts_are_kutuphane_only(self):
        drafts = list_kutuphane_yoklama_template_drafts()
        keys = {d.event_key for d in drafts}
        self.assertEqual(keys, {'yoklama.gelmedi', 'yoklama.gec', 'yoklama.cikis'})
        self.assertNotIn('sinif.yoklama.gelmedi', keys)
        names = {d.meta_name for d in drafts}
        self.assertIn('yoklama_gelmedi_veli', names)
        self.assertIn('yoklama_gec_veli', names)
        self.assertIn('yoklama_cikis_veli', names)
        event = get_event('yoklama.gelmedi')
        self.assertEqual(event.group, 'kutuphane')
        self.assertEqual(get_event('sinif.yoklama.gelmedi').group, 'sinif')

    def test_seed_creates_meta_drafts_and_skips_existing(self):
        result = KutuphaneYoklamaTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        self.assertGreater(len(result['created_meta']), 0)
        self.assertTrue(
            WhatsAppMetaTemplate.objects.filter(
                channel_config=self.account, name='yoklama_gelmedi_veli',
            ).exists()
        )
        self.assertTrue(
            NotificationTemplateBinding.objects.filter(
                kurum=self.kurum,
                event_key='yoklama.gelmedi',
                recipient_type=RecipientType.VELI,
            ).exists()
        )
        again = KutuphaneYoklamaTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            skip_existing=True,
            bind=True,
        )
        self.assertEqual(again['created_meta'], [])
        self.assertGreater(len(again['skipped_meta']), 0)

    def test_seed_binds_approved_legacy_not_draft_and_active_lms(self):
        from apps.communication.domain.enums import TemplateAudienceScope, TemplateCategory
        from apps.communication.domain.models import MessageTemplate

        MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Yoklama — Gelmedi (Varsayılan)',
            category=TemplateCategory.YOKLAMA_GELMEDI,
            body='Pasif varsayılan metin.',
            audience_scope=TemplateAudienceScope.COACH,
            is_active=False,
        )
        active = MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='yoklama devamsizlik veli',
            category=TemplateCategory.YOKLAMA_GELMEDI,
            body='🚨 Merhaba {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
            audience_scope=TemplateAudienceScope.COACH,
            is_active=True,
        )
        approved = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_devamsizlik_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='🚨 Merhaba {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
            approved_at=timezone.now(),
        )
        result = KutuphaneYoklamaTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        binding = NotificationTemplateBinding.objects.get(
            kurum=self.kurum,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            sube=self.sube,
            channel_config=self.account,
        )
        self.assertEqual(binding.meta_template_id, approved.id)
        self.assertEqual(binding.message_template_id, active.id)
        self.assertFalse(
            WhatsAppMetaTemplate.objects.filter(
                channel_config=self.account,
                name='yoklama_gelmedi_veli',
            ).exists()
        )

    def test_repair_removes_homework_meta_from_yoklama(self):
        wrong = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='odev_raporu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Ödev raporu ektedir.',
            approved_at=timezone.now(),
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=wrong,
        )
        result = repair_kutuphane_yoklama_bindings(self.kurum.id)
        self.assertGreaterEqual(result['cleared'] + result['deleted'], 1)
        self.assertFalse(
            NotificationTemplateBinding.objects.filter(
                kurum=self.kurum,
                event_key='yoklama.gelmedi',
                meta_template=wrong,
            ).exists()
        )
