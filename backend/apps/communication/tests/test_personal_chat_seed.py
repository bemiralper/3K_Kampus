"""Personel sohbet açılış PERSONAL Meta seed + personel_ad context."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.personal_chat_template_seed import (
    PersonalChatTemplateSeedService,
    list_personal_chat_template_drafts,
)
from apps.communication.application.variable_resolver import resolve_sender_personel_ad
from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    MetaTemplateUsage,
)
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class PersonalChatSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sohbet Kurum', kod='SHB')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_superuser(
            username='sohbet_admin', email='sohbet@test.com', password='testpass123',
        )
        self.accounting = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe WA',
            phone_number_id='pn_acc',
            waba_id='waba_acc',
            department=CommunicationDepartment.ACCOUNTING,
            is_default=True,
            is_active=True,
        )
        self.coaching = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_coach',
            waba_id='waba_coach',
            department=CommunicationDepartment.COACHING,
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_drafts_by_department(self):
        acc = list_personal_chat_template_drafts(
            department=CommunicationDepartment.ACCOUNTING,
        )
        names = {d.meta_name for d in acc}
        self.assertEqual(len(acc), 4)
        self.assertIn('sohbet_muhasebe_veli', names)
        self.assertIn('sohbet_muhasebe_ogrenci', names)
        self.assertIn('sohbet_genel_veli', names)
        self.assertNotIn('sohbet_kocluk_veli', names)

        coach = list_personal_chat_template_drafts(
            department=CommunicationDepartment.COACHING,
        )
        self.assertIn('sohbet_kocluk_veli', {d.meta_name for d in coach})
        self.assertNotIn('sohbet_muhasebe_veli', {d.meta_name for d in coach})

        other = list_personal_chat_template_drafts(department='SECRETARIAT')
        self.assertEqual({d.meta_name for d in other}, {
            'sohbet_genel_veli', 'sohbet_genel_ogrenci',
        })

    def test_bodies_and_buttons(self):
        draft = next(
            d for d in list_personal_chat_template_drafts(
                department=CommunicationDepartment.ACCOUNTING,
            )
            if d.meta_name == 'sohbet_muhasebe_veli'
        )
        self.assertIn('{{veli_ad}}', draft.body_named)
        self.assertIn('{{personel_ad}}', draft.body_named)
        self.assertIn('Müsait misiniz?', draft.body_named)
        self.assertEqual(len(draft.buttons_json), 3)
        self.assertEqual(draft.buttons_json[0]['text'], 'Uygunum')

    def test_seed_accounting_account(self):
        result = PersonalChatTemplateSeedService.seed(
            self.kurum.id,
            channel_config_id=self.accounting.id,
            user=self.user,
        )
        self.assertEqual(len(result['errors']), 0)
        self.assertEqual(len(result['created_meta']), 4)
        tpl = WhatsAppMetaTemplate.objects.get(
            channel_config=self.accounting, name='sohbet_muhasebe_veli',
        )
        self.assertEqual(tpl.usage_scope, MetaTemplateUsage.PERSONAL)
        self.assertEqual(len(tpl.buttons_json or []), 3)

    def test_seed_api(self):
        res = self.client.post(
            '/api/communication/meta-templates/seed-personal-chat/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.coaching.id),
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['created_count'], 4)
        self.assertEqual(res.data['department'], CommunicationDepartment.COACHING)
        res2 = self.client.post(
            '/api/communication/meta-templates/seed-personal-chat/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.coaching.id),
            },
            format='json',
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data['skipped_count'], 4)

    def test_resolve_sender_personel_ad(self):
        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Tuba',
            soyad='Yılmaz',
            user=self.user,
        )
        self.user = User.objects.get(pk=self.user.pk)
        self.assertEqual(resolve_sender_personel_ad(self.user), 'Tuba Yılmaz')
