"""Akademik sınıf ders programı Meta/LMS seed + bildirim bağlama."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.academic_schedule_template_seed import (
    AcademicScheduleTemplateSeedService,
    list_academic_schedule_template_drafts,
)
from apps.communication.application.notification_events import get_event
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    MetaTemplateUsage,
    RecipientType,
    TemplateAudienceScope,
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


class AcademicScheduleSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Akademik Kurum', kod='AKD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_superuser(
            username='akd_admin', email='akd@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Akademik WA',
            phone_number_id='pn_akd_1',
            waba_id='waba_akd',
            is_default=True,
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_draft_bodies_separate_veli_ogrenci(self):
        drafts = list_academic_schedule_template_drafts()
        self.assertEqual(len(drafts), 3)
        by_key = {(d.event_key, d.recipient_type): d for d in drafts}
        veli = by_key[('akademik.sinif_programi', RecipientType.VELI)]
        ogr = by_key[('akademik.sinif_programi', RecipientType.OGRENCI)]
        teacher = by_key[('akademik.ogretmen_programi', RecipientType.PERSONEL)]
        self.assertEqual(veli.meta_name, 'sinif_programi_veli')
        self.assertEqual(ogr.meta_name, 'sinif_programi_ogrenci')
        self.assertEqual(teacher.meta_name, 'ogretmen_programi_personel')
        self.assertEqual(veli.app_name, 'Sınıf Programı — Veli')
        self.assertEqual(ogr.app_name, 'Sınıf Programı — Öğrenci')
        self.assertEqual(teacher.app_name, 'Öğretmen Programı')
        self.assertEqual((veli.header_json or {}).get('type'), 'DOCUMENT')
        self.assertEqual((ogr.header_json or {}).get('type'), 'DOCUMENT')
        self.assertEqual((teacher.header_json or {}).get('type'), 'DOCUMENT')
        self.assertIn('{{veli_ad}}', veli.body_named)
        self.assertIn('{{ogrenci_ad}}', veli.body_named)
        self.assertIn('{{sube}}', veli.body_named)
        self.assertIn('{{sinif}}', veli.body_named)
        self.assertIn('{{donem}}', veli.body_named)
        self.assertIn('{{ogrenci_ad}}', ogr.body_named)
        self.assertIn('{{sube}}', ogr.body_named)
        self.assertNotIn('{{veli_ad}}', ogr.body_named)
        self.assertIn('{{ogretmen_ad}}', teacher.body_named)
        self.assertIn('{{donem}}', teacher.body_named)
        event = get_event('akademik.sinif_programi')
        self.assertIn('veli', event.default_body(RecipientType.VELI).lower())
        self.assertIn('ders programın', event.default_body(RecipientType.OGRENCI))
        teacher_event = get_event('akademik.ogretmen_programi')
        self.assertEqual(teacher_event.label, 'Öğretmen Programı')
        self.assertIn('programınız', teacher_event.default_body(RecipientType.PERSONEL))

    def test_seed_creates_app_meta_and_bindings(self):
        result = AcademicScheduleTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
            bind=True,
        )
        self.assertEqual(len(result['errors']), 0)
        self.assertEqual(len(result['created_app']), 3)
        self.assertEqual(len(result['created_meta']), 3)
        self.assertEqual(len(result['bound']), 3)

        meta_veli = WhatsAppMetaTemplate.objects.get(
            channel_config=self.account, name='sinif_programi_veli',
        )
        self.assertEqual(meta_veli.status, MetaTemplateStatus.DRAFT)
        self.assertEqual(meta_veli.usage_scope, MetaTemplateUsage.SYSTEM)
        self.assertEqual((meta_veli.header_json or {}).get('type'), 'DOCUMENT')
        self.assertIn('{{sube}}', meta_veli.body_named)

        app_veli = MessageTemplate.objects.get(
            kurum=self.kurum, name='Sınıf Programı — Veli',
        )
        self.assertIn('{{veli_ad}}', app_veli.body)
        app_teacher = MessageTemplate.objects.get(
            kurum=self.kurum, name='Öğretmen Programı',
        )
        self.assertIn('{{ogretmen_ad}}', app_teacher.body)

        bindings = NotificationTemplateBinding.objects.filter(
            kurum=self.kurum,
            event_key='akademik.sinif_programi',
        )
        self.assertEqual(bindings.count(), 2)
        teacher_binding = NotificationTemplateBinding.objects.get(
            kurum=self.kurum,
            event_key='akademik.ogretmen_programi',
            recipient_type=RecipientType.PERSONEL,
        )
        self.assertEqual(teacher_binding.message_template_id, app_teacher.id)
        veli_b = bindings.get(recipient_type=RecipientType.VELI)
        self.assertEqual(veli_b.meta_template_id, meta_veli.id)
        self.assertEqual(veli_b.message_template_id, app_veli.id)

    def test_seed_updates_stale_draft_body(self):
        AcademicScheduleTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        tpl = WhatsAppMetaTemplate.objects.get(
            channel_config=self.account, name='sinif_programi_veli',
        )
        tpl.body_named = 'Eski gövde metni burada.'
        tpl.save(update_fields=['body_named'])
        result = AcademicScheduleTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        self.assertIn('sinif_programi_veli', result['updated_meta'])
        tpl.refresh_from_db()
        self.assertIn('{{sube}}', tpl.body_named)

    def test_seed_renames_legacy_class_template(self):
        MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Sınıf ders programı — Veli',
            body='Eski veli metni',
            audience_scope=TemplateAudienceScope.ADMIN,
            is_active=True,
        )
        result = AcademicScheduleTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        self.assertIn('Sınıf Programı — Veli', result['updated_app'])
        self.assertFalse(
            MessageTemplate.objects.filter(
                kurum=self.kurum, name='Sınıf ders programı — Veli',
            ).exists(),
        )
        renamed = MessageTemplate.objects.get(
            kurum=self.kurum, name='Sınıf Programı — Veli',
        )
        self.assertIn('{{veli_ad}}', renamed.body)

    def test_seed_api_endpoint(self):
        res = self.client.post(
            '/api/communication/meta-templates/seed-academic-schedule/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.account.id),
                'sube_id': self.sube.id,
                'bind': True,
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['created_meta_count'], 3)
        self.assertEqual(res.data['created_app_count'], 3)
        self.assertEqual(res.data['bound_count'], 3)
        res2 = self.client.post(
            '/api/communication/meta-templates/seed-academic-schedule/',
            {
                'kurum_id': self.kurum.id,
                'channel_config_id': str(self.account.id),
                'sube_id': self.sube.id,
            },
            format='json',
        )
        self.assertEqual(res2.status_code, 200, res2.data)
        self.assertEqual(res2.data['skipped_meta_count'], 3)
