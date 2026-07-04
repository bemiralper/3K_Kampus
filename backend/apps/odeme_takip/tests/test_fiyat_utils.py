from django.test import SimpleTestCase

from apps.odeme_takip.application.services.fiyat_utils import (
    resolve_kalem_indirim,
    hesapla_kalem_fiyat,
)


class FiyatUtilsTestCase(SimpleTestCase):
    def test_indirim_tutari_oncelikli(self):
        oran, indirim, net = resolve_kalem_indirim(290000, indirim_orani=3, indirim_tutari=10000)
        self.assertEqual(indirim, 10000)
        self.assertEqual(net, 280000)
        self.assertEqual(oran, 3)

    def test_net_tutar_oncelikli(self):
        oran, indirim, net = resolve_kalem_indirim(290000, net_tutar=280000)
        self.assertEqual(indirim, 10000)
        self.assertEqual(net, 280000)

    def test_oran_yedek(self):
        oran, indirim, net = resolve_kalem_indirim(100000, indirim_orani=10)
        self.assertEqual(indirim, 10000)
        self.assertEqual(net, 90000)
        self.assertEqual(oran, 10)

    def test_oran_yuvarlak_kesirli(self):
        oran, indirim, net = resolve_kalem_indirim(290000, indirim_orani=3.45)
        self.assertEqual(indirim, 10005)
        self.assertEqual(net, 279995)

    def test_hesapla_kalem_fiyat_kdv(self):
        fiyat = hesapla_kalem_fiyat(290000, 10, indirim_tutari=10000)
        self.assertEqual(fiyat["brut_tutar"], 290000)
        self.assertEqual(fiyat["kdv_haric"], 263600)
        self.assertEqual(fiyat["kdv_tutari"], 26400)
        self.assertEqual(fiyat["indirim_tutari"], 10000)
        self.assertEqual(fiyat["net_tutar"], 280000)
