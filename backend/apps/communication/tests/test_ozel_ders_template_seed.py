"""Özel ders Meta/LMS seed."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.notification_events import get_event
from apps.communication.application.ozel_ders_template_seed import (
    OzelDersTemplateSeedService,
    list_ozel_ders_template_drafts,
    repair_ozel_ders_bindings,
)
from apps.communication.domain.enums import Channel, MetaTemplateStatus, RecipientType
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    NotificationTemplateBinding,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXPECTED_META = {
    'ozel_ders.ogretmen_gelmedi': 'ozel_ders_ogretmen_gelmedi_veli',
    'ozel_ders.ogrenci_gelmedi': 'ozel_ders_ogrenci_gelmedi_veli',
    'ozel_ders.iptal': 'ozel_ders_iptal_veli',
    'ozel_ders.telafi_planlandi': 'ozel_ders_telafi_veli',
    'ozel_ders.islendi': 'ozel_ders_islendi_veli',
}


class OzelDersTemplateSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Özel Ders Seed', kod='ODSEED')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODSM')
        self.user = User.objects.create_superuser(
            username='odseed_admin', email='odseed@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_odseed',
            waba_id='waba_odseed',
            is_default=True,
            is_active=True,
        )

    def test_drafts_cover_five_unique_events(self):
        drafts = list_ozel_ders_template_drafts()
        self.assertEqual(len(drafts), 5)
        keys = {d.event_key for d in drafts}
        self.assertEqual(keys, set(EXPECTED_META))
        names = {d.meta_name for d in drafts}
        self.assertEqual(names, set(EXPECTED_META.values()))
        self.assertNotIn('ozel_ders_bilgi_veli', names)
        telafi = next(d for d in drafts if d.event_key == 'ozel_ders.telafi_planlandi')
        self.assertIn('telafi_tarihi', telafi.variables)
        self.assertIn('telafi_saati', telafi.variables)
        self.assertIn('{{telafi_tarihi}}', telafi.body_named)
        self.assertEqual(telafi.header_json.get('text'), 'Özel Ders Telafi Bilgilendirmesi')
        iptal = next(d for d in drafts if d.event_key == 'ozel_ders.iptal')
        self.assertIn('{{sebep}}', iptal.body_named)
        self.assertIn('{{ek_bilgi}}', iptal.body_named)
        ogretmen = next(d for d in drafts if d.event_key == 'ozel_ders.ogretmen_gelmedi')
        self.assertIn('öğretmenimizin katılım', ogretmen.body_named)
        self.assertIn('{{telafi_notu}}', ogretmen.body_named)
        self.assertNotIn('telafisi yapılacaktır', ogretmen.body_named)
        self.assertEqual(ogretmen.header_json.get('text'), 'Özel Ders Bilgilendirmesi')
        ogrenci = next(d for d in drafts if d.event_key == 'ozel_ders.ogrenci_gelmedi')
        self.assertIn('{{telafi_notu}}', ogrenci.body_named)
        self.assertNotIn('telafi edilecektir', ogrenci.body_named)

    def test_event_catalog_unique_meta_names_and_legacy(self):
        for key, expected in EXPECTED_META.items():
            event = get_event(key)
            self.assertEqual(event.suggested_meta_name(RecipientType.VELI), expected)
            self.assertIn('ozel_ders_bilgi_veli', event.meta_name_candidates(RecipientType.VELI))

    def test_seed_creates_meta_and_lms_drafts(self):
        result = OzelDersTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        self.assertEqual(len(result['created_meta']), 5)
        self.assertEqual(len(result['created_app']), 5)
        self.assertEqual(len(result['bound']), 5)
        for name in EXPECTED_META.values():
            meta = WhatsAppMetaTemplate.objects.get(channel_config=self.account, name=name)
            self.assertEqual(meta.status, MetaTemplateStatus.DRAFT)
            self.assertEqual(meta.template_group, 'ozel_ders')
            self.assertEqual((meta.header_json or {}).get('type'), 'TEXT')
        self.assertTrue(
            MessageTemplate.objects.filter(
                kurum=self.kurum,
                name='Özel Ders İptal Bilgilendirmesi',
            ).exists()
        )
        again = OzelDersTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            skip_existing=True,
            bind=True,
        )
        self.assertEqual(again['created_meta'], [])
        self.assertGreater(len(again['skipped_meta']), 0)

    def test_seed_does_not_reuse_legacy_shared_name(self):
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='ozel_ders_bilgi_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Eski ortak metin {{ogrenci_ad}}',
        )
        result = OzelDersTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        self.assertEqual(len(result['created_meta']), 5)
        binding = NotificationTemplateBinding.objects.get(
            kurum=self.kurum,
            event_key='ozel_ders.iptal',
            recipient_type=RecipientType.VELI,
        )
        self.assertEqual(binding.meta_template.name, 'ozel_ders_iptal_veli')

    def test_repair_removes_wrong_meta(self):
        wrong = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='odev_raporu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Ödev raporu ektedir.',
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            event_key='ozel_ders.iptal',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=wrong,
        )
        result = repair_ozel_ders_bindings(self.kurum.id)
        self.assertGreaterEqual(result['cleared'] + result['deleted'], 1)
        self.assertFalse(
            NotificationTemplateBinding.objects.filter(
                kurum=self.kurum,
                event_key='ozel_ders.iptal',
                meta_template=wrong,
            ).exists()
        )
