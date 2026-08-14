"""Yeni kayıt sözleşmesi Meta/LMS seed + bildirim bağlama."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.kayit_sozlesme_template_seed import (
    KayitSozlesmeTemplateSeedService,
    list_kayit_sozlesme_template_drafts,
)
from apps.communication.application.notification_events import get_event
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    MetaTemplateUsage,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    NotificationTemplateBinding,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class KayitSozlesmeSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kayıt Seed Kurum', kod='KSD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KSD-M')
        self.user = User.objects.create_superuser(
            username='ksd_admin', email='ksd@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Kayıt WA',
            phone_number_id='pn_ksd_1',
            waba_id='waba_ksd',
            is_default=True,
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_draft_is_personel_text(self):
        drafts = list_kayit_sozlesme_template_drafts()
        self.assertEqual(len(drafts), 1)
        draft = drafts[0]
        self.assertEqual(draft.recipient_type, RecipientType.PERSONEL)
        self.assertEqual(draft.meta_name, 'ogrenci_kayit_sozlesme_personel')
        self.assertEqual(draft.header_json, {})
        self.assertIn('{{ogrenci_ad}}', draft.body_named)
        self.assertIn('{{egitim_paketleri}}', draft.body_named)
        self.assertIn('{{kayit_yapan}}', draft.body_named)
        event = get_event('ogrenci.kayit_sozlesme')
        self.assertIn('öğrenci kaydı', event.default_body(RecipientType.PERSONEL).lower())

    def test_seed_creates_app_meta_and_binding(self):
        result = KayitSozlesmeTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(len(result['errors']), 0)
        self.assertEqual(len(result['created_app']), 1)
        self.assertEqual(len(result['created_meta']), 1)
        self.assertEqual(len(result['bound']), 1)

        meta = WhatsAppMetaTemplate.objects.get(
            channel_config=self.account, name='ogrenci_kayit_sozlesme_personel',
        )
        self.assertEqual(meta.status, MetaTemplateStatus.DRAFT)
        self.assertEqual(meta.usage_scope, MetaTemplateUsage.SYSTEM)
        self.assertIn('{{egitim_paketleri}}', meta.body_named)

        app = MessageTemplate.objects.get(
            kurum=self.kurum, name='Yeni kayıt sözleşmesi — Personel',
        )
        self.assertIn('{{kayit_yapan}}', app.body)

        binding = NotificationTemplateBinding.objects.get(
            kurum=self.kurum,
            event_key='ogrenci.kayit_sozlesme',
            recipient_type=RecipientType.PERSONEL,
        )
        self.assertEqual(binding.meta_template_id, meta.id)
        self.assertEqual(binding.message_template_id, app.id)

    def test_seed_api_endpoint(self):
        res = self.client.post(
            '/api/communication/meta-templates/seed-kayit-sozlesme/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.account.id),
                'sube_id': self.sube.id,
                'bind': True,
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['created_meta_count'], 1)
        self.assertEqual(res.data['created_app_count'], 1)
        self.assertEqual(res.data['bound_count'], 1)
        res2 = self.client.post(
            '/api/communication/meta-templates/seed-kayit-sozlesme/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.account.id),
                'sube_id': self.sube.id,
            },
            format='json',
        )
        self.assertEqual(res2.status_code, 200, res2.data)
        self.assertEqual(res2.data['skipped_meta_count'], 1)
