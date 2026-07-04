"""Kütüphane şube izolasyonu testleri."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import Library
from apps.sube.domain.models import Sube

User = get_user_model()


class KutuphaneSubeIsolationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sube Test Kurum', kod='STK')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='SA')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='SB')

        self.admin = User.objects.create_superuser(
            username='kutuphane_sube_admin', password='testpass123',
        )

        self.library_a = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
            ad='Salon A',
            kod='S-A',
            kapasite=30,
        )
        self.library_b = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube_b.id,
            ad='Salon B',
            kod='S-B',
            kapasite=40,
        )

        self.base_headers = {'HTTP_X_KURUM_ID': str(self.kurum.id)}

    def _headers_for_sube(self, sube_id):
        return {**self.base_headers, 'HTTP_X_SUBE_ID': str(sube_id)}

    def test_sube_a_does_not_see_sube_b_salons(self):
        self.client.force_login(self.admin)
        res = self.client.get('/kutuphane/api/salon/', **self._headers_for_sube(self.sube_a.id))
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        salon_ids = {item['id'] for item in data}
        salon_ads = {item['ad'] for item in data}
        self.assertIn(str(self.library_a.id), salon_ids)
        self.assertNotIn(str(self.library_b.id), salon_ids)
        self.assertIn('Salon A', salon_ads)
        self.assertNotIn('Salon B', salon_ads)

    def test_sube_b_does_not_see_sube_a_salons(self):
        self.client.force_login(self.admin)
        res = self.client.get('/kutuphane/api/salon/', **self._headers_for_sube(self.sube_b.id))
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        salon_ids = {item['id'] for item in data}
        self.assertIn(str(self.library_b.id), salon_ids)
        self.assertNotIn(str(self.library_a.id), salon_ids)

    def test_cross_sube_library_detail_forbidden(self):
        self.client.force_login(self.admin)
        res = self.client.get(
            f'/kutuphane/api/salon/{self.library_b.id}/',
            **self._headers_for_sube(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_create_library_uses_active_sube(self):
        self.client.force_login(self.admin)
        res = self.client.post(
            '/kutuphane/api/salon/',
            data=json.dumps({'ad': 'Yeni Salon', 'kod': 'YS', 'kapasite': 20}),
            content_type='application/json',
            **self._headers_for_sube(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        created = Library.objects.get(kod='YS')
        self.assertEqual(created.sube_id, self.sube_a.id)

    def test_missing_sube_header_returns_400(self):
        self.client.force_login(self.admin)
        res = self.client.get('/kutuphane/api/salon/', **self.base_headers)
        self.assertEqual(res.status_code, 400)
