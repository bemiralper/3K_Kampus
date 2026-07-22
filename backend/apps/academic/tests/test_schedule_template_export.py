"""Ders saatleri şablonu — kurumsal CSV/Excel dışa aktarma."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class ScheduleTemplateExportApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Ders Saati Export Kurum', kod='DEXP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DEXP-M')
        self.user = User.objects.create_user(username='ders_saati_export', password='test')
        self.client.force_login(self.user)

        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Standart Program',
        )
        TimeSlot.objects.create(
            schedule_template=self.template, slot_type=SlotType.LESSON,
            name='1. Ders', start_time='08:30', end_time='09:15', order=1,
        )
        TimeSlot.objects.create(
            schedule_template=self.template, slot_type=SlotType.SHORT_BREAK,
            name='Teneffüs', start_time='09:15', end_time='09:30', order=2,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.url = f'/api/academic/schedule-templates/{self.template.id}/export/'

    def test_export_csv(self):
        response = self.client.get(self.url, {'format': 'csv'}, **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        content = response.content.decode('utf-8-sig')
        self.assertIn('1. Ders', content)

    def test_export_xlsx_default(self):
        response = self.client.get(self.url, **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml', response['Content-Type'])
        self.assertGreater(len(response.content), 0)
