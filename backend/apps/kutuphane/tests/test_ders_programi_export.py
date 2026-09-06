"""
Ders programı Excel/CSV dışa aktarma ucu.

Frontend ekrandaki matrisi {columns, rows} olarak gönderir; bu uç kurumsal
şablonla dosyayı üretir. Sütun tipi ("Süre (dk)" -> integer) frontend'den gelir
ve backend'de hizalama/sayı biçimine dönüşür.
"""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXPORT_URL = '/kutuphane/api/ders-programi/export/'

COLUMNS = [
    {'key': 'oturum', 'label': 'Oturum'},
    {'key': 'bolum', 'label': 'Bölüm'},
    {'key': 'tur', 'label': 'Tür'},
    {'key': 'sure', 'label': 'Süre (dk)', 'type': 'integer'},
    {'key': '0', 'label': 'Pazartesi', 'type': 'text'},
    {'key': '1', 'label': 'Salı', 'type': 'text'},
]

ROWS = [
    {'oturum': 'Sabah', 'bolum': '1. Etüt', 'tur': 'Etüt', 'sure': 40,
     '0': '09:00 - 09:40', '1': '09:00 - 09:40'},
    {'oturum': 'Sabah', 'bolum': '2. Etüt', 'tur': 'Etüt', 'sure': 40,
     '0': '09:50 - 10:30', '1': ''},
    {'oturum': 'Sabah', 'bolum': 'Öğle Arası', 'tur': 'Ara', 'sure': 100,
     '0': '11:20 - 13:00', '1': '11:20 - 13:00'},
]


class DersProgramiExportApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Export Kurum', kod='EXP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='EXPM')
        self.admin = User.objects.create_superuser(
            username='export_admin', email='export@test.local', password='test',
        )
        self.client.force_login(self.admin)
        self.headers = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}

    def _post(self, fmt, columns=None, rows=None):
        payload = {
            'columns': columns if columns is not None else COLUMNS,
            'rows': rows if rows is not None else ROWS,
            'meta': {
                'program_ad': 'Güz Programı',
                'sube_id': self.sube.id,
                'aktif_gun': 2,
                'toplam_periyot': 2,
                'toplam_ders': 4,
            },
            'format': fmt,
        }
        return self.client.post(
            EXPORT_URL, data=json.dumps(payload), content_type='application/json', **self.headers,
        )

    def test_xlsx_export_returns_workbook(self):
        response = self._post('xlsx')
        self.assertEqual(response.status_code, 200, response.content[:400])
        self.assertIn('spreadsheet', response['Content-Type'])
        # xlsx bir zip arşividir.
        self.assertTrue(response.content.startswith(b'PK'))

    def test_csv_export_contains_new_columns(self):
        response = self._post('csv')
        self.assertEqual(response.status_code, 200, response.content[:400])
        text = response.content.decode('utf-8-sig')
        self.assertIn('Süre (dk)', text)
        self.assertIn('Öğle Arası', text)
        self.assertIn('09:00 - 09:40', text)

        # Oturum/Bölüm/Tür ayrı sütunlarda: veri satırlarında "☀ Sabah — 1. Etüt"
        # gibi birleşik metin ve emoji kalmadı (üstteki kurumsal başlık hariç).
        header_idx = text.index('Oturum;')
        data = text[header_idx:]
        self.assertIn('Sabah;1. Etüt;Etüt;40;', data)
        self.assertNotIn('—', data)
        self.assertNotIn('☀', data)

    def test_unknown_column_type_falls_back_to_text(self):
        columns = [{'key': 'oturum', 'label': 'Oturum', 'type': 'sihirli'}]
        response = self._post('csv', columns=columns, rows=[{'oturum': 'Sabah'}])
        self.assertEqual(response.status_code, 200, response.content[:400])
        self.assertIn('Sabah', response.content.decode('utf-8-sig'))

    def test_empty_rows_rejected(self):
        response = self._post('xlsx', rows=[])
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])
