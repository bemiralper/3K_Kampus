"""Kitap listesi — ünite/konu/içerik sayaçları (batch GROUP BY)."""
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
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
            topic=t1, ad='İ1', content_type='TEST_SET', sira=1, aktif_mi=True, question_count=10,
        )
        ResourceContent.objects.create(
            topic=t1, ad='İ2', content_type='TEST_SET', sira=2, aktif_mi=True, question_count=20,
        )
        ResourceContent.objects.create(
            topic=t2, ad='İ3', content_type='TEST_SET', sira=1, aktif_mi=True, question_count=5,
        )
        ResourceContent.objects.create(
            topic=t1, ad='Pasif içerik', content_type='TEST_SET', sira=3, aktif_mi=False, question_count=99,
        )

        self.user = User.objects.create_user(
            username='countuser',
            email='countuser@test.com',
            password='testpass123',
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def _seed_extra_books(self, n: int):
        for i in range(n):
            book = ResourceBook.objects.create(
                ad=f'Ekstra Kitap {i}',
                kod=f'EXT-{i}',
                kurum=self.kurum,
                sube=self.sube,
                book_type=self.book_type,
                ders=self.ders,
                sinif_seviyesi=self.sinif,
                aktif_mi=True,
            )
            unit = ResourceUnit.objects.create(
                book=book, ad='Ü', kod='U1', sira=1, aktif_mi=True,
            )
            topic = ResourceTopic.objects.create(
                unit=unit, ad='K', kod='T1', sira=1, aktif_mi=True,
            )
            ResourceContent.objects.create(
                topic=topic, ad='İ', content_type='TEST_SET', sira=1,
                aktif_mi=True, question_count=3,
            )

    def test_list_returns_active_unit_topic_content_counts(self):
        response = self.client.get('/api/resources/books/', **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])

        row = next(item for item in response.data['data'] if item['id'] == self.book.id)
        self.assertEqual(row['unit_count'], 2)
        self.assertEqual(row['topic_count'], 2)
        self.assertEqual(row['content_count'], 3)
        self.assertEqual(row['total_question_count'], 35)

    def test_retrieve_returns_total_question_count(self):
        response = self.client.get(
            f'/api/resources/books/{self.book.id}/',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        self.assertEqual(response.data['data']['total_question_count'], 35)

    def test_search_matches_kod(self):
        response = self.client.get(
            '/api/resources/books/',
            {'search': 'CNT-BOOK'},
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        ids = [row['id'] for row in response.data['data']]
        self.assertEqual(ids, [self.book.id])

    def test_list_query_count_does_not_grow_with_book_count(self):
        """Batch GROUP BY: kitap sayısı artsa da sorgu sayısı sabit kalmalı."""
        with CaptureQueriesContext(connection) as ctx_one:
            r1 = self.client.get('/api/resources/books/', **self.headers)
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(len(r1.data['data']), 1)
        q_one = len(ctx_one.captured_queries)

        self._seed_extra_books(8)
        with CaptureQueriesContext(connection) as ctx_many:
            r2 = self.client.get('/api/resources/books/', **self.headers)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(len(r2.data['data']), 9)
        q_many = len(ctx_many.captured_queries)

        self.assertLessEqual(
            q_many,
            q_one + 3,
            f'Sorgu sayısı satırla büyüdü: {q_one} → {q_many}',
        )
