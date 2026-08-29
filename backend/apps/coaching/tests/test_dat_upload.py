"""DAT yükleme — önizleme boyutu ve satır hizası."""
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

UPLOAD_URL = '/api/coaching/olcme-degerlendirme/exams/{}/results/upload/'


class DatUploadPreviewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='DAT Kurum', kod='DATK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DAT-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='datup', password='test')
        self.client.force_authenticate(user=self.user)
        self.exam = Exam.objects.create(
            name='DAT Önizleme', exam_type='DENEME',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def _upload(self, raw: bytes, media_root: str):
        with override_settings(MEDIA_ROOT=media_root):
            f = SimpleUploadedFile('ornek.dat', raw, content_type='text/plain')
            return self.client.post(
                UPLOAD_URL.format(self.exam.id),
                {'dat_file': f},
                format='multipart',
                **self.headers,
            )

    def test_preview_is_capped_and_keeps_leading_spaces(self):
        lines = [f'   SATIR{i:04d} ABCDEF' for i in range(120)]
        raw = '\n'.join(lines).encode('utf-8')
        with tempfile.TemporaryDirectory() as tmp:
            res = self._upload(raw, tmp)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['total_lines'], 120)
        self.assertTrue(res.data['preview_truncated'])
        self.assertEqual(len(res.data['preview_lines']), 80)
        self.assertTrue(res.data['preview_lines'][0].startswith('   SATIR'))

    def test_small_file_is_not_truncated(self):
        raw = b'12345ABCDEF\n67890GHIJKL\n'
        with tempfile.TemporaryDirectory() as tmp:
            res = self._upload(raw, tmp)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['total_lines'], 2)
        self.assertFalse(res.data['preview_truncated'])
        self.assertEqual(res.data['preview_lines'], ['12345ABCDEF', '67890GHIJKL'])

    def test_upload_without_sube_context_is_rejected(self):
        """Canlıda şube yalnızca header ile gelir; session boşsa yükleme 400 olmalı."""
        raw = b'12345ABCDEF\n'
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(MEDIA_ROOT=tmp):
                f = SimpleUploadedFile('ornek.dat', raw, content_type='text/plain')
                res = self.client.post(
                    UPLOAD_URL.format(self.exam.id),
                    {'dat_file': f},
                    format='multipart',
                    HTTP_X_KURUM_ID=str(self.kurum.id),
                )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn('şube', (res.data.get('error') or '').lower())
