"""Öğrenci araması İ/i/ı ve aksanlı harfleri aynı saysın."""
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.ogrenci.interfaces.list_helpers import apply_smart_search
from apps.sube.domain.models import Sube


class TurkishStudentSearchTest(TestCase):
    def setUp(self):
        kurum = Kurum.objects.create(ad='Arama Kurum', kod='ARA')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='ARA-M')
        self.ogrenci = Ogrenci.objects.create(
            kurum=kurum,
            sube=sube,
            ad='Işık',
            soyad='İncesu',
            aktif_mi=True,
        )

    def test_ascii_query_matches_dotted_capital_i(self):
        for query in ('incesu', 'İncesu', 'INCESU', 'ıncesu'):
            with self.subTest(query=query):
                found = apply_smart_search(Ogrenci.objects.all(), query)
                self.assertEqual(list(found), [self.ogrenci])

    def test_ascii_query_matches_dotless_i_and_accents(self):
        for query in ('isik', 'ışık', 'IŞIK', 'İsik'):
            with self.subTest(query=query):
                found = apply_smart_search(Ogrenci.objects.all(), query)
                self.assertEqual(list(found), [self.ogrenci])

    def test_unrelated_name_is_not_returned(self):
        found = apply_smart_search(Ogrenci.objects.all(), 'yilmaz')
        self.assertEqual(list(found), [])
