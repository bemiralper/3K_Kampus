"""Kitap listesi — ünite/konu/içerik sayaçları (Subquery anotasyonu)."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.resources.models import (
    BookType,
    ResourceBook,
    ResourceContent,
    ResourceTopic,
    ResourceUnit,
)
from apps.sube.domain.models import Sube

User = get_user_model()


class ResourceBookListCountsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Count Kurum', kod='CNT', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Count Şube', kod='CS', aktif_mi=True)
        self.sinif = SinifSeviyesi.objects.create(
            ad='10. Sınıf', kod='S10', sira=10, kurum=self.kurum, sube=self.sube,
        )
        self.ders = Ders.objects.create(
            ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube,
        )
        self.book_type = BookType.objects.create(kod='CNT_SB', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            ad='Sayaç Kitabı',
            kod='CNT-BOOK',
            kurum=self.kurum,
            sube=self.sube,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )

        u1 = ResourceUnit.objects.create(book=self.book, ad='Ü1', kod='U1', sira=1, aktif_mi=True)
        u2 = ResourceUnit.objects.create(book=self.book, ad='Ü2', kod='U2', sira=2, aktif_mi=True)
        ResourceUnit.objects.create(book=self.book, ad='Pasif', kod='U0', sira=3, aktif_mi=False)

        t1 = ResourceTopic.objects.create(unit=u1, ad='K1', kod='T1', sira=1, aktif_mi=True)
        t2 = ResourceTopic.objects.create(unit=u1, ad='K2', kod='T2', sira=2, aktif_mi=True)
        ResourceTopic.objects.create(unit=u2, ad='Pasif konu', kod='T0', sira=1, aktif_mi=False)

        ResourceContent.objects.create(
            topic=t1, ad='İ1', content_type='CUSTOM', sira=1, aktif_mi=True,
        )
        ResourceContent.objects.create(
            topic=t1, ad='İ2', content_type='CUSTOM', sira=2, aktif_mi=True,
        )
        ResourceContent.objects.create(
            topic=t2, ad='İ3', content_type='CUSTOM', sira=1, aktif_mi=True,
        )
        ResourceContent.objects.create(
            topic=t1, ad='Pasif içerik', content_type='CUSTOM', sira=3, aktif_mi=False,
        )

        self.user = User.objects.create_user(
            username='countuser',
            email='countuser@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_returns_active_unit_topic_content_counts(self):
        response = self.client.get(
            '/api/resources/books/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])

        row = next(item for item in response.data['data'] if item['id'] == self.book.id)
        self.assertEqual(row['unit_count'], 2)
        self.assertEqual(row['topic_count'], 2)
        self.assertEqual(row['content_count'], 3)
