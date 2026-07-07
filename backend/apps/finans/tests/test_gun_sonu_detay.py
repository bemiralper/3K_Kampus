"""
Gün Sonu Detay Raporu — finans mantığı birim testleri.
"""
from django.test import SimpleTestCase

from apps.finans.application.gun_sonu_finans_helpers import (
    bugun_islem_q,
    gun_datetime_araligi,
    gun_local_datetime_q,
    kova_listesi_with_yuzde,
    odeme_tip_to_bucket,
)
from datetime import date
from django.utils import timezone
from apps.finans.constants.payment_types import OdemeYontemiTipi


class GunSonuFinansHelpersTest(SimpleTestCase):
    def test_odeme_tip_to_bucket_separate_cek_senet(self):
        self.assertEqual(odeme_tip_to_bucket(OdemeYontemiTipi.CEK), 'cek')
        self.assertEqual(odeme_tip_to_bucket(OdemeYontemiTipi.SENET), 'senet')
        self.assertEqual(odeme_tip_to_bucket(OdemeYontemiTipi.NAKIT), 'nakit')
        self.assertEqual(odeme_tip_to_bucket(OdemeYontemiTipi.POS), 'kredi_karti')
        self.assertEqual(odeme_tip_to_bucket(None), 'diger')

    def test_kova_listesi_yuzde_toplam(self):
        rows = kova_listesi_with_yuzde({
            'nakit': {'toplam': 600, 'adet': 2},
            'havale': {'toplam': 400, 'adet': 1},
        })
        self.assertEqual(len(rows), 3)
        self.assertTrue(rows[-1]['is_total'])
        self.assertEqual(rows[-1]['tutar'], 1000)
        nakit = next(r for r in rows if r['tip'] == 'nakit')
        self.assertEqual(nakit['yuzde'], 60.0)

    def test_empty_kova_listesi(self):
        rows = kova_listesi_with_yuzde({})
        self.assertEqual(rows, [])


class GunSonuDateHelpersTest(SimpleTestCase):
    def test_gun_datetime_araligi_covers_full_local_day(self):
        gun = date(2026, 7, 7)
        start, end = gun_datetime_araligi(gun)
        self.assertLess(start, end)
        local_start = timezone.localtime(start)
        self.assertEqual(local_start.date(), gun)
        self.assertEqual(local_start.hour, 0)

    def test_bugun_islem_q_includes_both_date_and_created_at_paths(self):
        q = bugun_islem_q('tahsilat_tarihi', date(2026, 7, 7))
        self.assertIn('tahsilat_tarihi', str(q))
        self.assertIn('created_at', str(q))

    def test_gun_local_datetime_q_uses_range_not_date_lookup(self):
        q = gun_local_datetime_q('updated_at', date(2026, 7, 7))
        sql = str(q)
        self.assertIn('updated_at__gte', sql)
        self.assertIn('updated_at__lte', sql)
        self.assertNotIn('updated_at__date', sql)

    def test_bugun_alinan_toplam_imports_tahsilat(self):
        """Regression: NameError on Tahsilat crashed detay rapor (HTTP 500)."""
        import inspect
        from apps.finans.application import gun_sonu_finans_helpers as helpers

        src = inspect.getsource(helpers.bugun_alinan_toplam)
        self.assertIn('from apps.odeme_takip.domain.models import Tahsilat', src)


class BankaLabelTest(SimpleTestCase):
    def test_banka_label_from_banka_field(self):
        from apps.finans.application.gun_sonu_detay_report_service import _banka_label

        class Hesap:
            banka = 'garanti'
            banka_adi = ''

        self.assertEqual(_banka_label(Hesap()), 'Garanti BBVA')

    def test_banka_label_missing(self):
        from apps.finans.application.gun_sonu_detay_report_service import _banka_label
        self.assertEqual(_banka_label(None), '—')
