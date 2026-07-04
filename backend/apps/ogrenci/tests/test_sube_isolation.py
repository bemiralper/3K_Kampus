"""
Şube zorunluluğu — öğrenci list endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()


class OgrenciSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Ogr Sube Kurum', kod='OSK')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='OSK-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='OSK-B')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.sinif_a = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.yil,
            ad='9-A',
            aktif_mi=True,
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            egitim_yili=self.yil,
            ad='9-B',
            aktif_mi=True,
        )
        self.ogrenci_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ali',
            soyad='A',
            aktif_mi=True,
        )
        self.ogrenci_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Veli',
            soyad='B',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_a,
            kurum=self.kurum,
            sube=self.sube_a,
            sinif=self.sinif_a,
            egitim_yili=self.yil,
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci_b,
            kurum=self.kurum,
            sube=self.sube_b,
            sinif=self.sinif_b,
            egitim_yili=self.yil,
            aktif_mi=True,
        )

    def test_list_requires_sube_context(self):
        res = self.client.get('/ogrenciler/api/list/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_list_scoped_to_sube_header(self):
        res = self.client.get(
            '/ogrenciler/api/list/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get('success'))
        ids = {row['id'] for row in body.get('ogrenciler', [])}
        self.assertIn(self.ogrenci_a.id, ids)
        self.assertNotIn(self.ogrenci_b.id, ids)

    def test_list_scoped_to_sube_query_param(self):
        res = self.client.get(
            f'/ogrenciler/api/list/?sube_id={self.sube_b.id}',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_EGITIMYILI_ID=str(self.yil.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json().get('ogrenciler', [])}
        self.assertIn(self.ogrenci_b.id, ids)
        self.assertNotIn(self.ogrenci_a.id, ids)

    def test_filter_options_requires_sube(self):
        res = self.client.get(
            '/ogrenciler/api/filter-options/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_export_requires_sube(self):
        res = self.client.get('/ogrenciler/api/export/')
        self.assertEqual(res.status_code, 400)

    def test_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/ogrenciler/api/{self.ogrenci_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_detail_ok_matching_sube(self):
        res = self.client.get(
            f'/ogrenciler/api/{self.ogrenci_a.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json().get('id'), self.ogrenci_a.id)
