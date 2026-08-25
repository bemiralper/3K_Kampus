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
from apps.communication.application.notification_template_resolver import (
    SOURCE_BINDING_KURUM,
    resolve_binding,
)
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
        self.assertIn(
            'kutuphane_yoklama_veli_gelmedi',
            event.meta_name_candidates(RecipientType.VELI),
        )
        self.assertIn(
            'kutuphane_yoklama_veli_gec_v2',
            get_event('yoklama.gec').meta_name_candidates(RecipientType.VELI),
        )
        self.assertIn(
            'kutuphane_yoklama_veli_cks',
            get_event('yoklama.cikis').meta_name_candidates(RecipientType.VELI),
        )

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
        meta = WhatsAppMetaTemplate.objects.get(
            channel_config=self.account, name='yoklama_gelmedi_veli',
        )
        self.assertEqual(meta.template_group, 'yoklama:kutuphane')
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

    def test_specific_draft_binding_does_not_hide_approved_kutuphane_meta(self):
        draft = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Taslak gelmedi.',
        )
        approved = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='kutuphane_yoklama_veli_gelmedi',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='🚨 {{veli_ad}}, {{ogrenci_ad}} kütüphaneye gelmedi.',
            approved_at=timezone.now(),
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel_config=self.account,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=draft,
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=approved,
        )
        resolved = resolve_binding(
            self.kurum.id,
            'yoklama.gelmedi',
            RecipientType.VELI,
            sube_id=self.sube.id,
            channel_config_id=str(self.account.id),
        )
        self.assertEqual(resolved.meta_template.id, approved.id)
        self.assertTrue(resolved.use_meta(needs_document=False, session_open=False))
        self.assertEqual(resolved.source, SOURCE_BINDING_KURUM)

    def test_discovers_approved_kutuphane_name_when_only_draft_is_bound(self):
        draft = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Taslak gelmedi.',
        )
        approved = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='kutuphane_yoklama_veli_gelmedi',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='🚨 {{veli_ad}}, {{ogrenci_ad}} kütüphaneye gelmedi.',
            approved_at=timezone.now(),
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel_config=self.account,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=draft,
        )
        resolved = resolve_binding(
            self.kurum.id,
            'yoklama.gelmedi',
            RecipientType.VELI,
            sube_id=self.sube.id,
            channel_config_id=str(self.account.id),
        )
        self.assertEqual(resolved.meta_template.id, approved.id)
        self.assertTrue(resolved.use_meta(needs_document=False, session_open=False))

    def test_repair_replaces_draft_with_sibling_approved_kutuphane_meta(self):
        draft = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Taslak gelmedi.',
        )
        approved = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='kutuphane_yoklama_veli_gelmedi',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='🚨 {{veli_ad}}, {{ogrenci_ad}} kütüphaneye gelmedi.',
            approved_at=timezone.now(),
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=approved,
        )
        specific = NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel_config=self.account,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=draft,
        )
        result = repair_kutuphane_yoklama_bindings(self.kurum.id)
        self.assertGreaterEqual(result['updated'], 1)
        specific.refresh_from_db()
        self.assertEqual(specific.meta_template_id, approved.id)
