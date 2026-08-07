from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.resources.models import BookType, ResourceBook, ResourcePublisher
from apps.resources.application.publisher_match import (
    assign_publisher_to_books,
    build_suggestions,
    score_match,
    suggest_for_book,
)


class PublisherMatchEngineTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test', kod='T1', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='M', aktif_mi=True)
        self.ders = Ders.objects.create(
            ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube,
        )
        self.sinif = SinifSeviyesi.objects.create(
            ad='12', kod='12', sira=12, kurum=self.kurum, sube=self.sube,
        )
        self.bt = BookType.objects.create(kod='SB', ad='Soru Bankası')
        self.pub = ResourcePublisher.objects.create(
            kurum=self.kurum,
            ad='Bilgi Sarmal',
            kisa_ad='Bilgi',
            eslesme_anahtarlari='BS, Bilgi Sar',
        )

    def test_score_boundary_match(self):
        conf = score_match('Bilgi Sarmal TYT Matematik', 'Bilgi Sarmal')
        self.assertGreaterEqual(conf, 0.7)

    def test_suggest_for_book(self):
        book = ResourceBook.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Bilgi Sarmal TYT Matematik Soru Bankası',
            kod='B1',
            book_type=self.bt,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
        )
        suggestion = suggest_for_book(book, [self.pub])
        self.assertIsNotNone(suggestion)
        self.assertEqual(suggestion.publisher_id, self.pub.id)

    def test_build_and_assign(self):
        book = ResourceBook.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='3D Yayınları TYT Fizik',
            kod='B2',
            book_type=self.bt,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
        )
        ResourcePublisher.objects.create(
            kurum=self.kurum, ad='3D Yayınları', kisa_ad='3D', eslesme_anahtarlari='3D',
        )
        suggestions = build_suggestions(self.kurum.id, sube_id=self.sube.id)
        matched = [s for s in suggestions if s['book_id'] == book.id and s['publisher_id']]
        self.assertTrue(matched)
        updated = assign_publisher_to_books(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            book_ids=[book.id],
            publisher_id=matched[0]['publisher_id'],
        )
        self.assertEqual(updated, 1)
        book.refresh_from_db()
        self.assertEqual(book.publisher.ad, '3D Yayınları')
