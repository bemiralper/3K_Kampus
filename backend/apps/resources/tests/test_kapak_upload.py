"""Kitap kapak yükleme — 600x600 JPEG."""
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()


def _make_png(width=800, height=400, color=(30, 120, 200)):
    buf = BytesIO()
    Image.new('RGB', (width, height), color).save(buf, format='PNG')
    buf.seek(0)
    return SimpleUploadedFile('cover.png', buf.read(), content_type='image/png')


class ResourceBookKapakUploadTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kapak Kurum', kod='KPK', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK', aktif_mi=True)
        self.sinif = SinifSeviyesi.objects.create(
            ad='10. Sınıf', kod='S10', sira=10, kurum=self.kurum, sube=self.sube,
        )
        self.ders = Ders.objects.create(
            ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube,
        )
        self.book_type = BookType.objects.create(kod='SB_KPK', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            ad='Kapaklı Kitap',
            kod='KPK-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(
            username='kapakadmin',
            email='kapak@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_upload_kapak_preserves_client_crop_size(self):
        """Sunucu zorla kırpmaz; istemci 600×600 gönderdiğinde boyut korunur."""
        url = f'/api/resources/books/{self.book.id}/upload-kapak/'
        cropped = _make_png(width=600, height=600)
        response = self.client.post(
            url,
            {'kapak': cropped},
            format='multipart',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['success'])
        kapak_url = response.data['data']['kapak_url']
        self.assertTrue(kapak_url.startswith('/media/'))

        self.book.refresh_from_db()
        self.assertTrue(bool(self.book.kapak))
        with Image.open(self.book.kapak.path) as img:
            self.assertEqual(img.size, (600, 600))

        list_res = self.client.get('/api/resources/books/', **self.headers)
        self.assertEqual(list_res.status_code, 200)
        row = next(b for b in list_res.data['data'] if b['id'] == self.book.id)
        self.assertEqual(row['kapak_url'], kapak_url)

    def test_upload_does_not_force_center_crop(self):
        """Dikdörtgen görsel otomatik 600×600'e zorlanmaz."""
        response = self.client.post(
            f'/api/resources/books/{self.book.id}/upload-kapak/',
            {'kapak': _make_png(width=800, height=400)},
            format='multipart',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.book.refresh_from_db()
        with Image.open(self.book.kapak.path) as img:
            self.assertEqual(img.size, (800, 400))

    def test_delete_kapak(self):
        self.client.post(
            f'/api/resources/books/{self.book.id}/upload-kapak/',
            {'kapak': _make_png()},
            format='multipart',
            **self.headers,
        )
        res = self.client.delete(
            f'/api/resources/books/{self.book.id}/delete-kapak/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.book.refresh_from_db()
        self.assertFalse(bool(self.book.kapak))
        self.assertEqual(self.book.kapak_url, '')
