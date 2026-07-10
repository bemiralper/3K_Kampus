"""Öğrenci listesi filtre/serileştirme yardımcıları."""
from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.ogrenci.interfaces.list_helpers import resolve_sinif_seviyesi_ad


class ResolveSinifSeviyesiAdTest(SimpleTestCase):
    def test_prefers_sinif_seviyesi_on_class(self):
        kayit = SimpleNamespace(
            sinif=SimpleNamespace(sinif_seviyesi=SimpleNamespace(ad='12. Sınıf')),
            sinif_seviyesi=SimpleNamespace(ad='11. Sınıf'),
        )
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '12. Sınıf')

    def test_falls_back_to_kayit_sinif_seviyesi(self):
        kayit = SimpleNamespace(
            sinif=None,
            sinif_seviyesi=SimpleNamespace(ad='11. Sınıf'),
        )
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '11. Sınıf')

    def test_returns_empty_when_missing(self):
        kayit = SimpleNamespace(sinif=None, sinif_seviyesi=None)
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '')
