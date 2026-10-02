from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.odeme_takip.application.services.fesih_service import (
    FesihService,
    indirimsiz_tutar,
    kesinti_kalemlerini_birlestir,
    kesinti_tutari_oku,
    normalize_kesintiler,
    onerilen_kullanilan_bedel,
    _manuel_tutar,
)


class FesihBedelTest(SimpleTestCase):
    def test_oneri_indirimsiz_tutardan(self):
        # 100 günün 50'si, indirimsiz 100.000 → 50.000. Net 80.000 kullanılmaz.
        self.assertEqual(onerilen_kullanilan_bedel(100_000, 100, 50), 50_000)

    def test_indirimsiz_brut_indirimi_dusmez(self):
        sozlesme = SimpleNamespace(
            brut_tutar=100_000,
            net_tutar=80_000,
            toplam_indirim_tutari=20_000,
        )
        self.assertEqual(indirimsiz_tutar(sozlesme), 100_000)

    def test_manuel_tutar_oneriyi_eger(self):
        self.assertIsNone(_manuel_tutar(None))
        self.assertIsNone(_manuel_tutar(''))
        self.assertEqual(_manuel_tutar('12500'), 12_500)
        self.assertEqual(_manuel_tutar(-40), 0)

    def test_kesinti_tutari_turkce_binlik(self):
        self.assertEqual(kesinti_tutari_oku('2.500'), 2_500)
        self.assertEqual(kesinti_tutari_oku('2.500,50'), 2_501)
        self.assertEqual(kesinti_tutari_oku('2500'), 2_500)
        self.assertEqual(kesinti_tutari_oku('abc'), 0)

    def test_normalize_bozuk_satiri_dusurur(self):
        self.assertEqual(
            normalize_kesintiler([
                {'ad': 'Kitap', 'tutar': '4.500'},
                {'ad': '', 'tutar': 100},
                'bozuk',
            ]),
            [{'ad': 'Kitap', 'tutar': 4_500}],
        )

    def test_oneri_indirimsiz_ve_tekrarsiz(self):
        satirlar = [
            ('Yayın Paketi', 4_500),
            ('Yayın Paketi', 1_000),
            ('Üniforma', 2_000),
            ('', 500),
        ]
        self.assertEqual(
            kesinti_kalemlerini_birlestir(satirlar),
            [
                {'ad': 'Yayın Paketi', 'tutar': 4_500},
                {'ad': 'Üniforma', 'tutar': 2_000},
            ],
        )


class FesihDetayTest(SimpleTestCase):
    def test_get_fesih_detay_sozlesmeye_gore_okur(self):
        svc = FesihService()
        kayit = object()
        with patch('apps.odeme_takip.application.services.fesih_service.SozlesmeFesih') as model:
            qs = MagicMock()
            model.objects.select_related.return_value = qs
            qs.prefetch_related.return_value = qs
            qs.filter.return_value = qs
            qs.first.return_value = kayit
            self.assertIs(svc.get_fesih_detay(12), kayit)
            model.objects.select_related.assert_called_once_with(
                'sozlesme', 'sozlesme__ogrenci', 'fesih_eden',
            )
            qs.prefetch_related.assert_called_once_with('sozlesme__kalemler')
            qs.filter.assert_called_once_with(sozlesme_id=12)
