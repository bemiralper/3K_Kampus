"""Salon oturma planı — kurumsal CSV/Excel dışa aktarma."""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import Library
from apps.sube.domain.models import Sube

User = get_user_model()


class SeatExportApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Seat Export Kurum', kod='SEXP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SEXP-M')
        self.admin = User.objects.create_superuser(username='seat_export_admin', password='testpass123')
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Ana Salon', kod='AS-1', kapasite=30,
        )
        self.client.force_login(self.admin)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.payload = {
            'columns': [
                {'key': 'sira', 'label': '#'},
                {'key': 'masa_no', 'label': 'Masa No'},
                {'key': 'ogrenci', 'label': 'Öğrenci'},
                {'key': 'durum', 'label': 'Durum'},
            ],
            'rows': [
                {'sira': '1', 'masa_no': 'M-01', 'ogrenci': 'Elif Kaya', 'durum': 'Dolu'},
                {'sira': '2', 'masa_no': 'M-02', 'ogrenci': '', 'durum': 'Müsait'},
            ],
        }

    def _post(self, fmt):
        body = {**self.payload, 'format': fmt}
        return self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/masa-export/',
            data=json.dumps(body),
            content_type='application/json',
            **self.headers,
        )

    def test_export_csv_includes_salon_title(self):
        response = self._post('csv')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        content = response.content.decode('utf-8-sig')
        self.assertIn('Ana Salon — OTURMA PLANI', content)
        self.assertIn('Elif Kaya', content)

    def test_export_xlsx(self):
        response = self._post('xlsx')
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml', response['Content-Type'])
        self.assertGreater(len(response.content), 0)

    def test_export_requires_rows(self):
        body = {'columns': self.payload['columns'], 'rows': [], 'format': 'csv'}
        response = self.client.post(
            f'/kutuphane/api/salon/{self.library.id}/masa-export/',
            data=json.dumps(body),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 400)
