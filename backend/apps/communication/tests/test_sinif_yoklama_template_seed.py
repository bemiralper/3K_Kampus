"""Sınıf yoklama Meta/LMS seed."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.notification_events import get_event
from apps.communication.application.sinif_yoklama_template_seed import (
    SINIF_YOKLAMA_EVENT_KEYS,
    SinifYoklamaTemplateSeedService,
    list_sinif_yoklama_template_drafts,
)
from apps.communication.domain.enums import Channel, MetaTemplateStatus, RecipientType
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXPECTED_META = {
    ('sinif.yoklama.gelmedi', RecipientType.VELI): 'sinif_yoklama_gelmedi_veli',
    ('sinif.yoklama.gelmedi', RecipientType.OGRENCI): 'sinif_yoklama_gelmedi_ogrenci',
    ('sinif.yoklama.gec', RecipientType.VELI): 'sinif_yoklama_gec_veli',
    ('sinif.yoklama.gec', RecipientType.OGRENCI): 'sinif_yoklama_gec_ogrenci',
}


class SinifYoklamaTemplateSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sınıf Yoklama Seed', kod='SYSEED')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SYSM')
        self.user = User.objects.create_superuser(
            username='syseed_admin', email='syseed@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_syseed',
            waba_id='waba_syseed',
            is_default=True,
            is_active=True,
        )

    def test_drafts_and_catalog(self):
        drafts = list_sinif_yoklama_template_drafts()
        self.assertEqual(len(drafts), 4)
        keys = {(d.event_key, d.recipient_type) for d in drafts}
        self.assertEqual(keys, set(EXPECTED_META))
        gec = next(
            d for d in drafts
            if d.event_key == 'sinif.yoklama.gec' and d.recipient_type == RecipientType.VELI
        )
        self.assertIn('{{saat}}', gec.body_named)
        self.assertIn('geç', gec.body_named.lower())
        event = get_event('sinif.yoklama.gec')
        self.assertIn('giris_saati', event.variables)
        self.assertIn('oturum_ad', event.variables)
        self.assertEqual(event.suggested_meta_name(RecipientType.VELI), 'sinif_yoklama_gec_veli')
        self.assertIn('gunluk_ders_yoklama_veli_gec', event.meta_name_candidates(RecipientType.VELI))
        gelmedi = get_event('sinif.yoklama.gelmedi')
        self.assertIn('gunluk_ders_yoklama_veli', gelmedi.meta_name_candidates(RecipientType.VELI))
        self.assertIn('Değerli Velimiz', gelmedi.default_body(RecipientType.VELI))

    def test_seed_creates_lms_and_meta(self):
        result = SinifYoklamaTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        self.assertEqual(len(result['created_meta']), 4)
        self.assertEqual(len(result['created_app']), 4)
        self.assertEqual(set(result['event_keys']), set(SINIF_YOKLAMA_EVENT_KEYS))
        for name in EXPECTED_META.values():
            meta = WhatsAppMetaTemplate.objects.get(channel_config=self.account, name=name)
            self.assertEqual(meta.status, MetaTemplateStatus.DRAFT)
            self.assertEqual(meta.template_group, 'yoklama:sinif')
        self.assertTrue(
            MessageTemplate.objects.filter(
                kurum=self.kurum,
                name='Sınıf yoklama — Geç Kalma (Veli)',
            ).exists(),
        )
        again = SinifYoklamaTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            skip_existing=True,
            bind=True,
        )
        self.assertEqual(again['created_meta'], [])
        self.assertGreater(len(again['skipped_meta']), 0)
