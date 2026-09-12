"""TYT puanı seçilen ÖSYM yılına göre değişmeli (yayınevi kitapçığı ~2024)."""
from django.test import SimpleTestCase

from apps.coaching.olcme_degerlendirme.services.scoring import (
    calculate_ayt_score,
    calculate_tyt_score,
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
