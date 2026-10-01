from django.test import SimpleTestCase

from apps.personel.application.rapor_donem import resolve_rapor_aylari


class RaporDonemTest(SimpleTestCase):
    def test_yillik_spans_september_to_august(self):
        aylar = resolve_rapor_aylari(baslangic_yil=2025, bitis_yil=2026, kapsam='yillik')
        self.assertEqual(aylar[0], (2025, 9))
        self.assertEqual(aylar[4], (2026, 1))
        self.assertEqual(aylar[-1], (2026, 8))
        self.assertEqual(len(aylar), 12)

    def test_donemler(self):
        birinci = resolve_rapor_aylari(
            baslangic_yil=2025, bitis_yil=2026, kapsam='donem', donem='1',
        )
        self.assertEqual(birinci, [(2025, 9), (2025, 10), (2025, 11), (2025, 12), (2026, 1)])
        ikinci = resolve_rapor_aylari(
            baslangic_yil=2025, bitis_yil=2026, kapsam='donem', donem='2',
        )
        self.assertEqual(ikinci[0], (2026, 2))
        self.assertEqual(ikinci[-1], (2026, 6))
        yaz = resolve_rapor_aylari(
            baslangic_yil=2025, bitis_yil=2026, kapsam='donem', donem='yaz',
        )
        self.assertEqual(yaz, [(2026, 7), (2026, 8)])

    def test_secili_aylar_keep_education_year_order(self):
        aylar = resolve_rapor_aylari(
            baslangic_yil=2025,
            bitis_yil=2026,
            kapsam='aylar',
            aylar_param='2026-02,2025-09,2026-02',
        )
        self.assertEqual(aylar, [(2025, 9), (2026, 2)])

    def test_rejects_month_outside_education_year(self):
        with self.assertRaises(ValueError):
            resolve_rapor_aylari(
                baslangic_yil=2025, bitis_yil=2026, kapsam='aylar', aylar_param='2024-09',
            )
