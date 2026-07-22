"""Salon yoklama listesi — kurumsal CSV/Excel dışa aktarma."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import Library
from apps.sube.domain.models import Sube

User = get_user_model()


class AttendanceExportApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Yoklama Export Kurum', kod='YEXP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YEXP-M')
        self.admin = User.objects.create_superuser(username='yoklama_export_admin', password='testpass123')
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon 1', kod='S-1', kapasite=30,
        )
        self.client.force_login(self.admin)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.payload = {
            'columns': [
                {'key': 'ogrenci_adi', 'label': 'Öğrenci Adı'},
                {'key': 'pazartesi', 'label': 'Pazartesi'},
            ],
            'rows': [
                {'ogrenci_adi': 'Elif Kaya', 'pazartesi': 'Var'},
                {'ogrenci_adi': 'Deniz Aksoy', 'pazartesi': 'Yok'},
            ],
            'meta': {'tarih': '2026-07-20', 'mode': 'daily'},
        }

    def _post(self, fmt):
        body = {**self.payload, 'format': fmt}
        return self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/yoklama-export/',
            data=json.dumps(body),
            content_type='application/json',
            **self.headers,
        )

    def test_export_csv(self):
        response = self._post('csv')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        content = response.content.decode('utf-8-sig')
        self.assertIn('Elif Kaya', content)

    def test_export_xlsx(self):
        response = self._post('xlsx')
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml', response['Content-Type'])
        self.assertGreater(len(response.content), 0)

    def test_export_requires_rows(self):
        body = {'columns': self.payload['columns'], 'rows': [], 'meta': self.payload['meta'], 'format': 'csv'}
        response = self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/yoklama-export/',
            data=json.dumps(body),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 400)
