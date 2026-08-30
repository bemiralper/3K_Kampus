"""Ölçme / sınav Meta/LMS seed."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.sinav_template_seed import (
    SINAV_EVENT_KEYS,
    SinavTemplateSeedService,
    list_sinav_template_drafts,
)
from apps.communication.domain.enums import Channel, RecipientType
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    NotificationTemplateBinding,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class SinavTemplateSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sınav Seed', kod='SSEED')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SSM')
        self.user = User.objects.create_superuser(
            username='sseed_admin', email='sseed@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_sseed',
            waba_id='waba_sseed',
            is_default=True,
            is_active=True,
        )

    def test_drafts_cover_all_sinav_slots(self):
        drafts = list_sinav_template_drafts()
        keys = {d.event_key for d in drafts}
        self.assertEqual(keys, set(SINAV_EVENT_KEYS))
        pairs = {(d.event_key, d.recipient_type) for d in drafts}
        self.assertIn(('sinav.hatirlatma', RecipientType.VELI), pairs)
        self.assertIn(('sinav.hatirlatma', RecipientType.OGRENCI), pairs)
        self.assertIn(('sinav.cevap_anahtari', RecipientType.OGRENCI), pairs)
        self.assertEqual(len(drafts), 9)
        karne = next(d for d in drafts if d.event_key == 'sinav.karne')
        self.assertEqual(karne.header_json.get('type'), 'DOCUMENT')

    def test_seed_creates_and_binds(self):
        result = SinavTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(result['errors'], [])
        self.assertEqual(len(result['created_app']), 9)
        self.assertGreaterEqual(len(result['bound']), 9)
        self.assertTrue(
            MessageTemplate.objects.filter(
                kurum=self.kurum, name='Sınav bilgilendirmesi — Öğrenci',
            ).exists(),
        )
        self.assertTrue(
            NotificationTemplateBinding.objects.filter(
                kurum=self.kurum,
                event_key='sinav.hatirlatma',
                recipient_type=RecipientType.OGRENCI,
            ).exists(),
        )
