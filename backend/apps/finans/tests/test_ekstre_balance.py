"""Cari ekstre dönem bakiyesi testleri."""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.finans.application.cari_hareket_service import CariHareketService
from apps.finans.application.ekstre_balance import cari_donem_bakiyesi, tarih_parametresi
from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu, CariHesapTuru
from apps.finans.domain.cari_hesap import CariHesap
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class EkstreBalanceTest(TestCase):
    def setUp(self):
        kurum = Kurum.objects.create(ad='Ekstre Kurum', kod='EKS001')
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod='MRK')
        self.hesap = CariHesap.objects.create(
            kurum=kurum, sube=sube, unvan='Ekstre Cari', hesap_turu=CariHesapTuru.MUSTERI,
        )

    def _hareket(self, tarih, yon, tutar, tur=CariHareketTuru.SATIS):
        return CariHareketService().hareket_olustur(
            cari_hesap_id=self.hesap.id, kurum_id=self.hesap.kurum_id, tutar=Decimal(tutar),
            yon=yon, islem_turu=tur, islem_tarihi=tarih, sube_id=self.hesap.sube_id,
        )

    def test_running_balance_after_borc_and_tahsilat(self):
        """Borç 10.000 + tahsilat 3.000 → kapanış 7.000."""
        h1 = self._hareket(date(2025, 1, 5), CariHareketYonu.BORC, '10000')
        h2 = self._hareket(date(2025, 1, 10), CariHareketYonu.ALACAK, '3000', CariHareketTuru.TAHSILAT)
        donem = cari_donem_bakiyesi(self.hesap.id)
        self.assertEqual(donem.devreden, Decimal('0'))
        self.assertEqual(donem.satir_bakiyeleri[h1.id], Decimal('10000'))
        self.assertEqual(donem.satir_bakiyeleri[h2.id], Decimal('7000'))
        self.assertEqual(donem.kapanis, Decimal('7000'))

    def test_devreden_from_prior_period(self):
        self._hareket(date(2025, 1, 20), CariHareketYonu.BORC, '7000')
        h = self._hareket(date(2025, 2, 1), CariHareketYonu.BORC, '5000')
        donem = cari_donem_bakiyesi(self.hesap.id, baslangic=date(2025, 2, 1))
        self.assertEqual(donem.devreden, Decimal('7000'))
        self.assertEqual(donem.toplam_borc, Decimal('5000'))
        self.assertEqual(list(donem.satir_bakiyeleri), [h.id])
        self.assertEqual(donem.kapanis, Decimal('12000'))

    def test_iade_reduces_balance(self):
        """Borç 10.000 + iade 2.000 → kapanış 8.000."""
        self._hareket(date(2025, 3, 1), CariHareketYonu.BORC, '10000')
        self._hareket(date(2025, 3, 5), CariHareketYonu.ALACAK, '2000', CariHareketTuru.IADE)
        self.assertEqual(cari_donem_bakiyesi(self.hesap.id).kapanis, Decimal('8000'))

    def test_bitis_sonrasi_hareketler_kapanisa_girmez(self):
        self._hareket(date(2025, 3, 1), CariHareketYonu.BORC, '1000')
        self._hareket(date(2025, 4, 1), CariHareketYonu.BORC, '500')
        donem = cari_donem_bakiyesi(self.hesap.id, bitis=date(2025, 3, 31))
        self.assertEqual(donem.kapanis, Decimal('1000'))
        self.assertEqual(donem.toplam_borc, Decimal('1000'))

    def test_tarih_parametresi(self):
        self.assertIsNone(tarih_parametresi(''))
        self.assertIsNone(tarih_parametresi(None))
        self.assertEqual(tarih_parametresi('2025-03-01'), date(2025, 3, 1))
        self.assertEqual(tarih_parametresi(date(2025, 3, 1)), date(2025, 3, 1))
        with self.assertRaises(ValueError):
            tarih_parametresi('01.03.2025')
        with self.assertRaises(ValueError):
            tarih_parametresi('2025-02-30')
