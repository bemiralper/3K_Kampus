from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()

BOOKS_URL = '/api/resources/books/'


class ResourceBookCrudTest(TestCase):
    """Kitap CRUD API — kurum + şube header ile oluşturma, listeleme, güncelleme."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='CRUD Kurum', kod='CRUD', aktif_mi=True)
        self.other_kurum = Kurum.objects.create(ad='Diğer Kurum', kod='OTHER', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='CRUD Şube', kod='CS', aktif_mi=True)
        self.other_sube = Sube.objects.create(
            kurum=self.other_kurum, ad='Diğer Şube', kod='DS', aktif_mi=True,
        )

        self.sinif_seviyesi = SinifSeviyesi.objects.create(
            ad='11. Sınıf', kod='S11', sira=11, kurum=self.kurum, sube=self.sube,
        )
        self.ders = Ders.objects.create(
            ad='Fizik', kod='FIZ', kurum=self.kurum, sube=self.sube,
        )
        self.book_type = BookType.objects.create(kod='SB_CRUD', ad='Soru Bankası')

        self.user = User.objects.create_user(
            username='bookcrud',
            email='bookcrud@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.create_payload = {
            'ad': 'Fizik Soru Bankası',
            'kod': 'FSB_CRUD',
            'book_type': self.book_type.id,
            'ders': self.ders.id,
            'sinif_seviyesi': self.sinif_seviyesi.id,
            'yayinevi': 'Palme',
            'aktif_mi': True,
        }
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def _book_url(self, book_id):
        return f'{BOOKS_URL}{book_id}/'

    def test_create_book_via_api(self):
        response = self.client.post(
            BOOKS_URL,
            self.create_payload,
            format='json',
            **self.headers,
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['kod'], 'FSB_CRUD')

        book = ResourceBook.objects.get(kod='FSB_CRUD')
        self.assertEqual(book.kurum_id, self.kurum.id)
        self.assertEqual(book.sube_id, self.sube.id)
        self.assertEqual(book.ad, 'Fizik Soru Bankası')

    def test_list_includes_only_sube_scoped_books(self):
        own_book = ResourceBook.objects.create(
            ad='Kendi Kitabım',
            kod='OWN-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
        )
        ResourceBook.objects.create(
            ad='Başka Kurum Kitabı',
            kod='OTHER-001',
            kurum=self.other_kurum,
            sube=self.other_sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
        )

        response = self.client.get(BOOKS_URL, **self.headers)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        book_ids = [item['id'] for item in response.data['data']]
        self.assertEqual(book_ids, [own_book.id])

    def test_retrieve_and_update_kod(self):
        create_response = self.client.post(
            BOOKS_URL,
            self.create_payload,
            format='json',
            **self.headers,
        )
        book_id = create_response.data['data']['id']

        retrieve_response = self.client.get(self._book_url(book_id), **self.headers)
        self.assertEqual(retrieve_response.status_code, 200)
        self.assertEqual(retrieve_response.data['data']['kod'], 'FSB_CRUD')

        patch_response = self.client.patch(
            self._book_url(book_id),
            {'kod': 'FSB_UPDATED'},
            format='json',
            **self.headers,
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertTrue(patch_response.data['success'])
        self.assertEqual(patch_response.data['data']['kod'], 'FSB_UPDATED')

        book = ResourceBook.objects.get(pk=book_id)
        self.assertEqual(book.kod, 'FSB_UPDATED')

    def test_retrieve_with_wrong_kurum_header_not_found(self):
        book = ResourceBook.objects.create(
            ad='Gizli Kitap',
            kod='HIDDEN-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
        )

        response = self.client.get(
            self._book_url(book.id),
            HTTP_X_KURUM_ID=str(self.other_kurum.id),
            HTTP_X_SUBE_ID=str(self.other_sube.id),
        )
        self.assertEqual(response.status_code, 404)

    def test_patch_icerik_tamamlandi_mi(self):
        book = ResourceBook.objects.create(
            ad='Tamamlanacak Kitap',
            kod='COMPLETE-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
            icerik_tamamlandi_mi=False,
        )

        patch_response = self.client.patch(
            self._book_url(book.id),
            {'icerik_tamamlandi_mi': True},
            format='json',
            **self.headers,
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertTrue(patch_response.data['success'])
        self.assertTrue(patch_response.data['data']['icerik_tamamlandi_mi'])

        list_response = self.client.get(BOOKS_URL, **self.headers)
        self.assertTrue(list_response.data['data'][0]['icerik_tamamlandi_mi'])

        book.refresh_from_db()
        self.assertTrue(book.icerik_tamamlandi_mi)

    def test_list_filter_icerik_tamamlandi(self):
        complete = ResourceBook.objects.create(
            ad='Tamamlanan',
            kod='DONE-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
            icerik_tamamlandi_mi=True,
        )
        ResourceBook.objects.create(
            ad='Eksik',
            kod='PEND-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
            icerik_tamamlandi_mi=False,
        )

        response = self.client.get(
            BOOKS_URL,
            {'icerik_tamamlandi': 'true'},
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        ids = [item['id'] for item in response.data['data']]
        self.assertEqual(ids, [complete.id])

    def test_duplicate_resets_icerik_tamamlandi_mi(self):
        source = ResourceBook.objects.create(
            ad='Kaynak Kitap',
            kod='SRC-001',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
            icerik_tamamlandi_mi=True,
        )

        response = self.client.post(
            f'{BOOKS_URL}{source.id}/duplicate/',
            {'ad': 'Kopya Kitap', 'kod': 'COPY-001'},
            format='json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])

        copy = ResourceBook.objects.get(kod='COPY-001')
        self.assertFalse(copy.icerik_tamamlandi_mi)
