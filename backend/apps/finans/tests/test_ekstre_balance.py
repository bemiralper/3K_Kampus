"""Cari ekstre bakiye hesaplama testleri."""
from decimal import Decimal

from django.test import TestCase

from apps.finans.application.ekstre_balance import (
    compute_devreden_bakiye,
    compute_kapanis_bakiye,
    get_bakiye_sonrasi,
)


class EkstreBalanceTest(TestCase):
    def _hareket(self, hid, tarih, yon, tutar, *, borc_oncesi=0, alacak_oncesi=0, borc_sonrasi=0, alacak_sonrasi=0):
        return {
            "id": hid,
            "islem_tarihi": tarih,
            "created_at": f"{tarih}T12:00:00Z",
            "yon": yon,
            "tutar": tutar,
            "borc_oncesi": borc_oncesi,
            "alacak_oncesi": alacak_oncesi,
            "borc_sonrasi": borc_sonrasi,
            "alacak_sonrasi": alacak_sonrasi,
        }

    def test_running_balance_after_borc_and_tahsilat(self):
        """Borç 10.000 + tahsilat 3.000 → kapanış 7.000."""
        h1 = self._hareket(
            1, "2025-01-05", "borc", 10000,
            borc_oncesi=0, alacak_oncesi=0,
            borc_sonrasi=10000, alacak_sonrasi=0,
        )
        h2 = self._hareket(
            2, "2025-01-10", "alacak", 3000,
            borc_oncesi=10000, alacak_oncesi=0,
            borc_sonrasi=10000, alacak_sonrasi=3000,
        )
        rows = [h1, h2]

        self.assertEqual(compute_devreden_bakiye(rows), Decimal("0"))
        self.assertEqual(get_bakiye_sonrasi(h1), Decimal("10000"))
        self.assertEqual(get_bakiye_sonrasi(h2), Decimal("7000"))
        self.assertEqual(compute_kapanis_bakiye(rows), Decimal("7000"))

    def test_devreden_from_prior_period(self):
        h1 = self._hareket(
            1, "2025-02-01", "borc", 5000,
            borc_oncesi=7000, alacak_oncesi=0,
            borc_sonrasi=12000, alacak_sonrasi=0,
        )
        self.assertEqual(compute_devreden_bakiye([h1]), Decimal("7000"))
        self.assertEqual(compute_kapanis_bakiye([h1]), Decimal("12000"))

    def test_iade_reduces_balance(self):
        """Borç 10.000 + iade 2.000 → kapanış 8.000."""
        h1 = self._hareket(
            1, "2025-03-01", "borc", 10000,
            borc_sonrasi=10000, alacak_sonrasi=0,
        )
        h2 = self._hareket(
            2, "2025-03-05", "alacak", 2000,
            borc_oncesi=10000, alacak_oncesi=0,
            borc_sonrasi=10000, alacak_sonrasi=2000,
        )
        self.assertEqual(compute_kapanis_bakiye([h1, h2]), Decimal("8000"))
