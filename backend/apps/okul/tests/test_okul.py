"""Okul modülü testleri."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.okul.models import Okul
from apps.sube.domain.models import Sube

User = get_user_model()


class OkulSubeIsolationTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Okul Iso Kurum', kod='OISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Ankara', kod='OISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='İstanbul', kod='OISO-B')
        self.user = User.objects.create_user(username='okuliso', password='test')
        self.client.force_login(self.user)

        self.okul_a = Okul.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Atatürk Anadolu Lisesi',
        )
        self.okul_b = Okul.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='Atatürk Anadolu Lisesi',
        )

    def _headers(self, sube):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(sube.id),
        }

    def test_list_requires_sube(self):
        res = self.client.get('/kurum-yonetimi/api/okullar/', HTTP_X_KURUM_ID=str(self.kurum.id))
        self.assertEqual(res.status_code, 400)

    def test_list_scoped_to_sube(self):
        res = self.client.get('/kurum-yonetimi/api/okullar/', **self._headers(self.sube_a))
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['data']}
        self.assertIn(self.okul_a.id, ids)
        self.assertNotIn(self.okul_b.id, ids)

    def test_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'/kurum-yonetimi/api/okullar/{self.okul_b.id}/',
            **self._headers(self.sube_a),
        )
        self.assertIn(res.status_code, (403, 404))

    def test_same_name_different_subeler(self):
        self.assertEqual(Okul.objects.filter(ad__iexact='Atatürk Anadolu Lisesi').count(), 2)

    def test_duplicate_name_same_sube_rejected(self):
        res = self.client.post(
            '/kurum-yonetimi/api/okullar/',
            data=json.dumps({'ad': 'atatürk anadolu lisesi'}),
            content_type='application/json',
            **self._headers(self.sube_a),
        )
        self.assertEqual(res.status_code, 400)


class OkulCrudTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Okul CRUD', kod='OCRUD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='OCRUD-M')
        self.user = User.objects.create_user(username='okulcrud', password='test')
        self.client.force_login(self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_create_update_deactivate(self):
        res = self.client.post(
            '/kurum-yonetimi/api/okullar/',
            data=json.dumps({'ad': 'Fen Lisesi', 'okul_turu': 'Fen Lisesi', 'il': 'Ankara'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201)
        okul_id = res.json()['data']['id']

        res = self.client.put(
            f'/kurum-yonetimi/api/okullar/{okul_id}/',
            data=json.dumps({'ad': 'Fen Lisesi', 'aktif_mi': False}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['data']['aktif_mi'])

    def test_delete_unused_okul(self):
        okul = Okul.objects.create(kurum=self.kurum, sube=self.sube, ad='Silinecek Okul')
        res = self.client.delete(f'/kurum-yonetimi/api/okullar/{okul.id}/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Okul.objects.filter(id=okul.id).exists())

    def test_delete_used_okul_blocked(self):
        from apps.egitim_yili.domain.models import EgitimYili

        okul = Okul.objects.create(kurum=self.kurum, sube=self.sube, ad='Kullanılan Okul')
        yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, tc_kimlik_no='11111111111',
            ad='Test', soyad='Öğrenci', kayit_turu='yeni_kayit',
        )
        OgrenciKayit.objects.create(
            ogrenci=ogrenci, kurum=self.kurum, sube=self.sube,
            egitim_yili=yil, school=okul, okul_no='1001', aktif_mi=True,
        )
        res = self.client.delete(f'/kurum-yonetimi/api/okullar/{okul.id}/', **self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Okul.objects.filter(id=okul.id).exists())

    def test_autocomplete_scoped(self):
        Okul.objects.create(kurum=self.kurum, sube=self.sube, ad='Atatürk Fen Lisesi')
        res = self.client.get(
            '/kurum-yonetimi/api/okullar/autocomplete/?q=Atat',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.json()['data']) >= 1)


class EnrollmentSchoolValidationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Enroll Okul', kod='ENOK')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='A', kod='ENOK-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='B', kod='ENOK-B')
        self.okul_b = Okul.objects.create(kurum=self.kurum, sube=self.sube_b, ad='Başka Şube Okulu')
        self.okul_a = Okul.objects.create(kurum=self.kurum, sube=self.sube_a, ad='A Şubesi Okulu')

    def test_resolve_school_rejects_cross_branch(self):
        from apps.okul.application.enrollment import resolve_school_for_enrollment

        okul, err = resolve_school_for_enrollment(self.okul_b.id, self.kurum.id, self.sube_a.id)
        self.assertIsNone(okul)
        self.assertIsNotNone(err)

    def test_resolve_school_accepts_same_branch(self):
        from apps.okul.application.enrollment import resolve_school_for_enrollment

        okul, err = resolve_school_for_enrollment(self.okul_a.id, self.kurum.id, self.sube_a.id)
        self.assertIsNotNone(okul)
        self.assertIsNone(err)
        self.assertEqual(okul.id, self.okul_a.id)
