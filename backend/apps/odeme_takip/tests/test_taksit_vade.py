"""Taksit vade hesaplama — TaksitPeriyodu enum ile uyum."""
from datetime import date

from django.test import SimpleTestCase

from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.domain.enums import TaksitPeriyodu


class TaksitVadeHesaplamaTests(SimpleTestCase):
    def setUp(self):
        self.svc = TaksitService()
        self.baslangic = date(2026, 1, 15)

    def test_aylik_periyot(self):
        vade = self.svc._hesapla_vade(self.baslangic, 0, TaksitPeriyodu.AYLIK)
        self.assertEqual(vade, date(2026, 1, 15))

        vade2 = self.svc._hesapla_vade(self.baslangic, 1, TaksitPeriyodu.AYLIK)
        self.assertEqual(vade2, date(2026, 2, 15))

    def test_iki_aylik_periyot(self):
        vade = self.svc._hesapla_vade(self.baslangic, 1, TaksitPeriyodu.IKI_AYLIK)
        self.assertEqual(vade, date(2026, 3, 15))

    def test_uc_aylik_periyot(self):
        vade = self.svc._hesapla_vade(self.baslangic, 1, TaksitPeriyodu.UC_AYLIK)
        self.assertEqual(vade, date(2026, 4, 15))

    def test_ozel_periyot_aylik_gibi(self):
        vade = self.svc._hesapla_vade(self.baslangic, 2, TaksitPeriyodu.OZEL)
        self.assertEqual(vade, date(2026, 3, 15))

    def test_pesinat_offset(self):
        vade = self.svc._hesapla_vade(
            self.baslangic, 0, TaksitPeriyodu.AYLIK, has_pesinat=True
        )
        self.assertEqual(vade, date(2026, 2, 15))

    def test_ay_sonu_gunu_bir_gun_oncesi(self):
        """31. gün seçildiyse Şubat gibi kısa aylarda bir gün öncesi (veya son gün) kullanılır."""
        baslangic = date(2026, 1, 31)
        vade = self.svc._hesapla_vade(baslangic, 1, TaksitPeriyodu.AYLIK)
        self.assertEqual(vade, date(2026, 2, 28))

        vade_nisan = self.svc._hesapla_vade(baslangic, 3, TaksitPeriyodu.AYLIK)
        self.assertEqual(vade_nisan, date(2026, 4, 30))
