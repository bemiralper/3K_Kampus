"""TYT puanı seçilen ÖSYM yılına göre değişmeli (yayınevi kitapçığı ~2024)."""
from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.services.scoring import (
    calculate_ayt_score,
    calculate_tyt_score,
    estimate_ranking,
    is_reliable_tyt_link_code,
)

# Yayın Denizi DK TYT 2 — Arda Yayla (PDF: 428.364)
ARDA_NETS = {
    'Türkçe': 32.50,
    'Sosyal Bilimler': 15.00,
    'Temel Matematik': 38.75,
    'Fen Bilimleri': 10.00,
}


class TytScoreYearTest(SimpleTestCase):
    def test_2025_is_higher_than_publisher_booklet(self):
        r = calculate_tyt_score(ARDA_NETS, year=2025)
        self.assertAlmostEqual(r['puan'], 434.70, places=1)

    def test_2024_matches_publisher_booklet_closely(self):
        r = calculate_tyt_score(ARDA_NETS, year=2024)
        # PDF 428.364 — 2024 ÖSYM tablomuz ~0.3 puan sapar
        self.assertAlmostEqual(r['puan'], 428.67, places=1)
        self.assertLess(abs(r['puan'] - 428.364), 0.4)


class AytOptionalPhilosophyScoreTest(SimpleTestCase):
    def test_soz_adds_optional_philosophy_to_felsefe_grubu(self):
        base_nets = {'Felsefe Grubu': 4.0, 'DKAB': 3.0}
        extra = {**base_nets, 'Felsefe (Seçmeli)': 2.0}
        without = calculate_ayt_score(base_nets, puan_turu='SOZ', year=2025)
        with_opt = calculate_ayt_score(extra, puan_turu='SOZ', year=2025)
        self.assertAlmostEqual(with_opt['ham_puan'] - without['ham_puan'], 2.0 * 3.76, places=2)

    def test_say_ignores_optional_philosophy(self):
        extra = {'Felsefe Grubu': 4.0, 'Felsefe (Seçmeli)': 5.0, 'Matematik': 20.0}
        only_mat = calculate_ayt_score({'Matematik': 20.0}, puan_turu='SAY', year=2025)
        with_opt = calculate_ayt_score(extra, puan_turu='SAY', year=2025)
        self.assertAlmostEqual(with_opt['ham_puan'], only_mat['ham_puan'], places=2)


# Branşlar Karması TG AYT 2 — Arda Yayla (yayınevi kartı)
ARDA_AYT = {
    'Matematik': 37.50,
    'Geometri': 9.00,
    'Fizik': 10.25,
    'Kimya': 11.75,
    'Biyoloji': 11.75,
    'Fen Bilimleri': 33.75,
}
ARDA_TYT_MAINS = {
    'Türkçe': 36.25,
    'Sosyal Bilimler': 11.25,
    'Temel Matematik': 36.25,
    'Fen Bilimleri': 16.25,
}
ARDA_TYT_WITH_SUBS = {
    **ARDA_TYT_MAINS,
    'Matematik': 30.00,
    'Geometri': 6.25,
    'Fizik': 6.00,
    'Kimya': 5.00,
    'Biyoloji': 5.25,
}


class AytLinkedTytScoreTest(SimpleTestCase):
    def test_publisher_say_score_is_close(self):
        r = calculate_ayt_score(ARDA_AYT, ARDA_TYT_MAINS, puan_turu='SAY', year=2025)
        self.assertAlmostEqual(r['puan'], 452.42, places=1)
        self.assertLess(abs(r['puan'] - 451.413), 1.1)

    def test_tyt_math_subsection_is_not_double_counted(self):
        mains = calculate_ayt_score(ARDA_AYT, ARDA_TYT_MAINS, puan_turu='SAY', year=2025)
        with_subs = calculate_ayt_score(ARDA_AYT, ARDA_TYT_WITH_SUBS, puan_turu='SAY', year=2025)
        self.assertAlmostEqual(mains['puan'], with_subs['puan'], places=2)
        self.assertAlmostEqual(mains['tyt_net'], 100.0, places=2)
        self.assertAlmostEqual(with_subs['tyt_net'], 100.0, places=2)

    def test_matematik2_plus_geo_fills_parent_math(self):
        leaves = {
            'Matematik-2': 28.50,
            'Geometri': 9.00,
            'Fizik': 10.25,
            'Kimya': 11.75,
            'Biyoloji': 11.75,
        }
        parent = calculate_ayt_score(ARDA_AYT, ARDA_TYT_MAINS, puan_turu='SAY', year=2025)
        from_leaves = calculate_ayt_score(leaves, ARDA_TYT_MAINS, puan_turu='SAY', year=2025)
        self.assertAlmostEqual(parent['puan'], from_leaves['puan'], places=2)

    def test_linked_tyt_does_not_use_ayt_ranking_floor(self):
        r = calculate_ayt_score(ARDA_AYT, ARDA_TYT_MAINS, puan_turu='SAY', year=2025)
        est = estimate_ranking(r['puan'], 'YKS_AYT', 2025)
        self.assertIsNotNone(est['tahmini_siralama'])
        self.assertLess(est['tahmini_siralama'], 10_000)
        self.assertGreater(est['tahmini_siralama'], 1_000)


class TytLinkCodeTest(SimpleTestCase):
    def test_rejects_generic_row_numbers(self):
        self.assertFalse(is_reliable_tyt_link_code('0'))
        self.assertFalse(is_reliable_tyt_link_code('1'))
        self.assertFalse(is_reliable_tyt_link_code('105'))
        self.assertFalse(is_reliable_tyt_link_code(''))

    def test_accepts_tc_and_school_codes(self):
        self.assertTrue(is_reliable_tyt_link_code('12345678901'))
        self.assertTrue(is_reliable_tyt_link_code('OKL-4421'))
