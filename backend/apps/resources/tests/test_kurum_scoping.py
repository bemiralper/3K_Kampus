from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import BookType, ResourceBook

User = get_user_model()


class ResourceBookKurumScopingTest(TestCase):
    def setUp(self):
        self.kurum_a = Kurum.objects.create(ad='Kurum A', kod='KUR-A', aktif_mi=True)
        self.kurum_b = Kurum.objects.create(ad='Kurum B', kod='KUR-B', aktif_mi=True)

        self.sinif_seviyesi = SinifSeviyesi.objects.create(ad='10. Sınıf', kod='S10', sira=10)
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.book_type = BookType.objects.create(kod='SORU_BANKASI', ad='Soru Bankası')

        self.book_a = ResourceBook.objects.create(
            ad='Kurum A Kitabı',
            kod='BOOK-A',
            kurum=self.kurum_a,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            aktif_mi=True,
        )

        self.user = User.objects.create_user(
            username='resourceuser',
            email='resourceuser@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_book_in_kurum_a_not_visible_with_kurum_b_header(self):
        response = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum_b.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        book_ids = [item['id'] for item in response.data['data']]
        self.assertNotIn(self.book_a.id, book_ids)

    def test_book_visible_with_matching_kurum_header(self):
        response = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum_a.id),
        )
        self.assertEqual(response.status_code, 200)
        book_ids = [item['id'] for item in response.data['data']]
        self.assertIn(self.book_a.id, book_ids)

    def test_create_assigns_kurum_from_header(self):
        response = self.client.post(
            '/api/resources/books/',
            {
                'ad': 'Yeni Kitap',
                'kod': 'NEW_001',
                'book_type': self.book_type.id,
                'ders': self.ders.id,
                'sinif_seviyesi': self.sinif_seviyesi.id,
                'aktif_mi': True,
            },
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum_b.id),
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['success'])

        book = ResourceBook.objects.get(kod='NEW_001')
        self.assertEqual(book.kurum_id, self.kurum_b.id)

        list_response = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum_a.id),
        )
        book_ids = [item['id'] for item in list_response.data['data']]
        self.assertNotIn(book.id, book_ids)
