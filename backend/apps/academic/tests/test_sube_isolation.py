"""Şube izolasyonu — akademik modül API."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class AcademicSubeIsolationTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Akademik Iso Kurum', kod='AISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='AISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='AISO-B')
        self.user = User.objects.create_user(username='akademikiso', password='test')
        self.client.force_login(self.user)

        self.template_a = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube_a, name='Sablon A',
        )
        self.template_b = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube_b, name='Sablon B',
        )

    def test_schedule_template_list_requires_sube(self):
        res = self.client.get(
            '/api/academic/schedule-templates/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_schedule_template_list_scoped(self):
        res = self.client.get(
            '/api/academic/schedule-templates/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        ids = {row['id'] for row in body.get('data', [])}
        self.assertIn(self.template_a.id, ids)
        self.assertNotIn(self.template_b.id, ids)

    def test_schedule_template_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/api/academic/schedule-templates/{self.template_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)
