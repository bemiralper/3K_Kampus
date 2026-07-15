"""Şube izolasyonu — eğitim tanımları API."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_tanimlari.models import SinifSeviyesi, Brans
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class EgitimTanimlariSubeIsolationTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Tanim Iso Kurum', kod='TISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='TISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='TISO-B')
        self.user = User.objects.create_user(username='tanimiso', password='test')
        self.client.force_login(self.user)

        self.seviye_a = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='9. Sınıf A', kod='9A', sira=1,
        )
        self.seviye_b = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='9. Sınıf B', kod='9B', sira=1,
        )
        self.brans_a = Brans.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Matematik A', kod='MAT-A',
        )
        self.brans_b = Brans.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='Fizik B', kod='FIZ-B',
        )

    def test_ders_list_requires_sube(self):
        res = self.client.get(
            '/egitim-tanimlari/api/ders/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)

    def test_sinif_seviyesi_list_scoped(self):
        res = self.client.get(
            '/egitim-tanimlari/api/sinif-seviyeleri/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        ids = {row['id'] for row in body.get('sinif_seviyeleri', [])}
        self.assertIn(self.seviye_a.id, ids)
        self.assertNotIn(self.seviye_b.id, ids)

    def test_sinif_seviyesi_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/egitim-tanimlari/api/sinif-seviyesi/{self.seviye_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertIn(res.status_code, (403, 404))

    def test_legacy_tanimlar_brans_scoped(self):
        res = self.client.get(
            '/egitim-tanimlari/api/legacy/tanimlar/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        branslar = res.json()['data']['branslar']
        ids = {row['id'] for row in branslar}
        self.assertIn(self.brans_a.id, ids)
        self.assertNotIn(self.brans_b.id, ids)

    def test_brans_list_scoped(self):
        res = self.client.get(
            '/egitim-tanimlari/api/brans/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['data']}
        self.assertIn(self.brans_b.id, ids)
        self.assertNotIn(self.brans_a.id, ids)

    def test_legacy_tanimlar_brans_scoped_via_query_param(self):
        res = self.client.get(
            '/egitim-tanimlari/api/legacy/tanimlar/?sube_id=%s' % self.sube_b.id,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['data']['branslar']}
        self.assertIn(self.brans_b.id, ids)
        self.assertNotIn(self.brans_a.id, ids)

    def test_brans_create_scoped_to_active_sube(self):
        res = self.client.post(
            '/egitim-tanimlari/api/brans/',
            data='{"ad": "Kimya B", "kod": "KIM-B", "aktif_mi": true}',
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res.status_code, 200)
        created_id = res.json()['data']['id']

        list_b = self.client.get(
            '/egitim-tanimlari/api/brans/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        ids_b = {row['id'] for row in list_b.json()['data']}
        self.assertIn(created_id, ids_b)

        list_a = self.client.get(
            '/egitim-tanimlari/api/brans/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        ids_a = {row['id'] for row in list_a.json()['data']}
        self.assertNotIn(created_id, ids_a)
