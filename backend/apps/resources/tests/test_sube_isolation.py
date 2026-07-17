"""ResourceBook şube izolasyonu testleri."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()


class ResourceBookSubeIsolationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kurum A', kod='KUR-A', aktif_mi=True)
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='SA', aktif_mi=True)
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='SB', aktif_mi=True)

        self.sinif_a = SinifSeviyesi.objects.create(
            ad='10. Sınıf', kod='S10', sira=10, kurum=self.kurum, sube=self.sube_a,
        )
        self.sinif_b = SinifSeviyesi.objects.create(
            ad='10. Sınıf', kod='S10', sira=10, kurum=self.kurum, sube=self.sube_b,
        )
        self.ders_a = Ders.objects.create(
            ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube_a,
        )
        self.ders_b = Ders.objects.create(
            ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube_b,
        )
        self.book_type = BookType.objects.create(kod='SORU_BANKASI', ad='Soru Bankası')

        self.book_a = ResourceBook.objects.create(
            ad='Şube A Kitabı',
            kod='BOOK-A',
            kurum=self.kurum,
            sube=self.sube_a,
            book_type=self.book_type,
            ders=self.ders_a,
            sinif_seviyesi=self.sinif_a,
            aktif_mi=True,
        )
        self.book_b = ResourceBook.objects.create(
            ad='Şube B Kitabı',
            kod='BOOK-B',
            kurum=self.kurum,
            sube=self.sube_b,
            book_type=self.book_type,
            ders=self.ders_b,
            sinif_seviyesi=self.sinif_b,
            aktif_mi=True,
        )

        self.user = User.objects.create_user(
            username='resource_sube_user',
            email='resource_sube@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_only_shows_active_sube_books(self):
        response = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(response.status_code, 200)
        book_ids = [item['id'] for item in response.data['data']]
        self.assertIn(self.book_a.id, book_ids)
        self.assertNotIn(self.book_b.id, book_ids)

    def test_create_assigns_sube_from_header(self):
        response = self.client.post(
            '/api/resources/books/',
            {
                'ad': 'Yeni Şube B Kitabı',
                'kod': 'NEW_B_001',
                'book_type': self.book_type.id,
                'ders': self.ders_b.id,
                'sinif_seviyesi': self.sinif_b.id,
                'aktif_mi': True,
            },
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(response.status_code, 201, response.data)
        book = ResourceBook.objects.get(kod='NEW_B_001')
        self.assertEqual(book.sube_id, self.sube_b.id)
        self.assertEqual(book.kurum_id, self.kurum.id)

        list_a = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        ids_a = [item['id'] for item in list_a.data['data']]
        self.assertNotIn(book.id, ids_a)
