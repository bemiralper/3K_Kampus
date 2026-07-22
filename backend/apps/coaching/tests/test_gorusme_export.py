from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, GorusmeKaydi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()

EXPORT_URL = '/api/coaching/gorusmeler/export/'


class GorusmeExportTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Export Test Kurum', kod='EXPK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')

        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Kaya',
            aktif_mi=True,
        )

        self.admin_user = User.objects.create_superuser(
            username='export_admin',
            email='export_admin@test.com',
            password='testpass123',
        )

        self.coach_user = User.objects.create_user(
            username='export_coach',
            email='export_coach@test.com',
            password='testpass123',
        )
        self.coach_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Elif',
            soyad='Demir',
            tc_kimlik_no='22222222222',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )

        self.gorusme = GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            olusturan=self.admin_user,
            gorusme_turu='ogrenci',
            durum='tamamlandi',
            oncelik='normal',
            gorusme_tarihi=date(2026, 6, 1),
            gorusme_saati=time(14, 30),
            sure_dakika=45,
            konu='Sınav kaygısı üzerine görüşme',
            notlar='Öğrenci sınav öncesi kaygı belirtileri gösteriyor.',
        )

        self.client = APIClient()
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        self.client.force_authenticate(user=self.admin_user)

    def test_export_json_returns_rows(self):
        response = self.client.get(EXPORT_URL, {'format': 'json'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['total'], 1)
        row = response.data['rows'][0]
        self.assertEqual(row['ogrenci_adi'], 'Zeynep Kaya')
        self.assertEqual(row['koc_adi'], 'Elif Demir')
        self.assertEqual(row['durum_display'], 'Tamamlandı')
        self.assertEqual(row['konu'], 'Sınav kaygısı üzerine görüşme')

    def test_export_xlsx_returns_workbook(self):
        response = self.client.get(EXPORT_URL, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertGreater(len(response.content), 0)

    def test_export_csv_contains_expected_data(self):
        response = self.client.get(EXPORT_URL, {'format': 'csv'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        content = response.content.decode('utf-8-sig')
        self.assertIn('Zeynep Kaya', content)
        self.assertIn('Elif Demir', content)
        self.assertIn('GÖRÜŞMELER LİSTESİ', content)

    def test_export_filters_by_durum(self):
        GorusmeKaydi.objects.create(
            kurum=self.kurum,
            ogrenci=self.student,
            koc=self.coach_profile,
            gorusme_turu='veli',
            durum='planlandi',
            gorusme_tarihi=date(2026, 6, 10),
            konu='Veli görüşmesi',
        )
        response = self.client.get(EXPORT_URL, {'format': 'json', 'durum': 'tamamlandi'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 1)
        self.assertEqual(response.data['rows'][0]['durum_display'], 'Tamamlandı')

    def test_export_requires_authentication(self):
        anon_client = APIClient()
        response = anon_client.get(EXPORT_URL, {'format': 'xlsx'})
        self.assertIn(response.status_code, (401, 403))
