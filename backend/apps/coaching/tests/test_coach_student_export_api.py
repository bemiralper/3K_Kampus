"""Koç öğrenci listesi — kurumsal CSV/Excel dışa aktarma."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

EXPORT_URL = '/api/coaching/students/export/'


class CoachStudentExportApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Export Test Kurum', kod='EXPT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='EXPT-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='11-B', kod='11B', aktif_mi=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Elif', soyad='Kaya', aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(username='export_coach', password='testpass123')
        self.coach_personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Coach', soyad='User',
            tc_kimlik_no='33333333333', user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel, capacity=20, is_active=True, is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile, student=self.student,
            start_date=date(2026, 1, 1), is_primary=True,
        )

        self.client = APIClient()
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        self.client.force_authenticate(user=self.coach_user)

    def test_export_json_default(self):
        response = self.client.get(EXPORT_URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['count'], 1)

    def test_export_csv(self):
        response = self.client.get(EXPORT_URL, {'format': 'csv'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        content = response.content.decode('utf-8-sig')
        self.assertIn('Elif Kaya', content)

    def test_export_xlsx(self):
        response = self.client.get(EXPORT_URL, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml', response['Content-Type'])
        self.assertGreater(len(response.content), 0)

    def test_export_ids_filter(self):
        other_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Deniz', soyad='Aksoy', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile, student=other_student,
            start_date=date(2026, 1, 1), is_primary=True,
        )
        response = self.client.get(EXPORT_URL, {'format': 'json', 'ids': str(self.student.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['data'][0]['id'], self.student.id)
