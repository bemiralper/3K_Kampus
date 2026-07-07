"""Toplu okul içe aktarma testleri."""
import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.okul.application.bulk_import import BulkOkulImportService, build_excel_template
from apps.okul.models import Okul
from apps.sube.domain.models import Sube

User = get_user_model()


class BulkOkulImportServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Bulk Okul Kurum', kod='BOK')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='BOK-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='BOK-B')
        self.service = BulkOkulImportService()
        Okul.objects.create(kurum=self.kurum, sube=self.sube_a, ad='Mevcut Okul')

    def test_import_ad_list_dedupes_and_skips_existing(self):
        adlar = [
            'Yeni Okul 1',
            '  Yeni Okul 2  ',
            'Yeni Okul 1',
            'Mevcut Okul',
            '',
            'mevcut okul',
        ]
        result = self.service.import_ad_list(adlar, kurum_id=self.kurum.id, sube_id=self.sube_a.id)
        self.assertEqual(result.eklenen, 2)
        self.assertEqual(result.atlanan, 2)
        self.assertEqual(result.hatali, 1)
        self.assertEqual(Okul.objects.filter(sube=self.sube_a).count(), 3)

    def test_same_name_different_sube(self):
        result = self.service.import_ad_list(
            ['Mevcut Okul'], kurum_id=self.kurum.id, sube_id=self.sube_b.id,
        )
        self.assertEqual(result.eklenen, 1)
        self.assertEqual(Okul.objects.filter(ad__iexact='Mevcut Okul').count(), 2)

    def test_case_insensitive_duplicate_in_batch(self):
        result = self.service.import_ad_list(
            ['Atatürk Lisesi', 'atatürk lisesi'],
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
        )
        self.assertEqual(result.eklenen, 1)
        self.assertEqual(result.hatali, 1)
        self.assertTrue(any('tekrar' in h['neden'].lower() for h in result.hatalar))

    def test_turkish_characters(self):
        result = self.service.import_ad_list(
            ['İstanbul Anadolu Lisesi', 'Çankaya İlkokulu'],
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
        )
        self.assertEqual(result.eklenen, 2)

    def test_excel_import(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(['Okul Adı', 'Okul Türü', 'İl', 'İlçe'])
        ws.append(['Excel Okul 1', 'Anadolu', 'Ankara', 'Çankaya'])
        ws.append(['Excel Okul 2', '', '', ''])
        ws.append(['', 'Anadolu', 'Ankara', ''])  # ad boş, hatalı
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)

        result = self.service.import_excel(buf, kurum_id=self.kurum.id, sube_id=self.sube_a.id)
        self.assertEqual(result.eklenen, 2)
        self.assertEqual(result.hatali, 1)

    def test_bulk_500_performance_smoke(self):
        adlar = [f'Perf Okul {i}' for i in range(500)]
        result = self.service.import_ad_list(adlar, kurum_id=self.kurum.id, sube_id=self.sube_a.id)
        self.assertEqual(result.eklenen, 500)

    def test_template_bytes(self):
        data = build_excel_template()
        self.assertTrue(len(data) > 100)


class BulkOkulApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Bulk API', kod='BAPI')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='BAPI-M')
        self.user = User.objects.create_user(username='bulkokul', password='test')
        self.client.force_login(self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_bulk_list_api(self):
        res = self.client.post(
            '/kurum-yonetimi/api/okullar/toplu/',
            data=json.dumps({'adlar': ['API Okul 1', 'API Okul 2']}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()['data']
        self.assertEqual(body['eklenen'], 2)

    def test_bulk_template_download(self):
        res = self.client.get('/kurum-yonetimi/api/okullar/toplu/sablon/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('spreadsheet', res['Content-Type'])

    def test_bulk_excel_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(['Okul Adı', 'Okul Türü', 'İl', 'İlçe'])
        ws.append(['Upload Okul', 'Fen', 'Ankara', ''])
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)

        upload = SimpleUploadedFile(
            'okullar.xlsx',
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        res = self.client.post(
            '/kurum-yonetimi/api/okullar/toplu/excel/',
            data={'file': upload},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['data']['eklenen'], 1)
