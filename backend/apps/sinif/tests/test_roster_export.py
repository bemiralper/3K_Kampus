"""Sınıf öğrenci listesi roster export testleri."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class SinifRosterExportTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Roster Kurum', kod='RST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='RST-M')
        self.user = User.objects.create_user(username='rostertest', password='test')
        self.client.force_login(self.user)

        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.seviye_11 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='S11', sira=11,
        )
        self.seviye_12 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='S12', sira=12,
        )
        today = date.today()
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='2025-2026 Güz',
            code='Guz25',
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=120),
            order_no=1,
            is_active=True,
        )
        self.sinif_11a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='11-A', kod='11A', kapasite=30, sinif_seviyesi=self.seviye_11, aktif_mi=True,
        )
        self.sinif_12a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='12-A', kod='12A', kapasite=30, sinif_seviyesi=self.seviye_12, aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Test', soyad='Ogrenci', aktif_mi=True,
            tc_kimlik_no='12345678901', telefon='05551234567', cinsiyet='E',
        )
        OgrenciKayit.objects.create(
            kurum=self.kurum, sube=self.sube, ogrenci=self.ogrenci,
            egitim_yili=self.egitim_yili, sinif_seviyesi=self.seviye_11,
            okul_no='1001', aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci,
            classroom=self.sinif_11a,
            is_active=True,
        )

    def _headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def test_roster_export_single_sinif_json(self):
        res = self.client.get(
            f'/siniflar/api/roster-export/?format=json&scope=sinif&sinif_id={self.sinif_11a.id}&term_id={self.term.id}',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['total_students'], 1)
        self.assertEqual(body['groups'][0]['sinif_ad'], '11-A')
        self.assertEqual(body['groups'][0]['rows'][0]['tam_ad'], 'Test Ogrenci')

    def test_roster_export_seviye_scope(self):
        res = self.client.get(
            f'/siniflar/api/roster-export/?format=json&scope=seviye&sinif_seviyesi_id={self.seviye_11.id}&term_id={self.term.id}',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(len(body['groups']), 1)
        self.assertEqual(body['total_students'], 1)

    def test_roster_export_csv(self):
        res = self.client.get(
            f'/siniflar/api/roster-export/?format=csv&scope=sinif&sinif_id={self.sinif_11a.id}&term_id={self.term.id}',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        content = res.content.decode('utf-8-sig')
        self.assertIn('Test Ogrenci', content)
        self.assertIn('11-A', content)
        self.assertIn('Ad Soyad', content)

    def test_roster_export_csv_grouped_by_sinif(self):
        res = self.client.get(
            f'/siniflar/api/roster-export/?format=csv&scope=all&term_id={self.term.id}',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        content = res.content.decode('utf-8-sig')
        self.assertIn('11-A', content)
        self.assertIn('12-A', content)
        self.assertIn('Test Ogrenci', content)
        # Her sınıf ayrı tablo başlığı
        self.assertIn('11-A — 11. Sınıf', content)
        self.assertIn('12-A — 12. Sınıf', content)
        # Boş sınıf mesajı
        self.assertIn('Bu sınıfta yerleşmiş öğrenci yok', content)

    def test_roster_export_custom_columns(self):
        res = self.client.get(
            f'/siniflar/api/roster-export/?format=json&scope=sinif&sinif_id={self.sinif_11a.id}'
            f'&term_id={self.term.id}&columns=telefon,tc_kimlik_no,cinsiyet,tam_ad',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['columns'], ['telefon', 'tc_kimlik_no', 'cinsiyet', 'tam_ad'])
        row = body['groups'][0]['rows'][0]
        self.assertEqual(row['telefon'], '05551234567')
        self.assertEqual(row['tc_kimlik_no'], '12345678901')
        self.assertEqual(row['cinsiyet'], 'Erkek')

    def test_class_list_export_uses_placement_count(self):
        res = self.client.get(
            '/siniflar/api/export/?format=json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.json()['rows'] if r['ad'] == '11-A')
        self.assertEqual(row['ogrenci_sayisi'], 1)
