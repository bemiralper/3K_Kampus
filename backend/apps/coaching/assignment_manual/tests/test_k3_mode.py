from django.test import TestCase

from apps.coaching.assignment_manual.k3_mode import (
    compute_k3_distribution,
    resolve_week_focus,
)


class K3DistributionTest(TestCase):
    def test_question_weighted_percentages(self):
        rows = compute_k3_distribution({
            'OGREN': 45,
            'PEKISTIR': 25,
            'TEKRARLA': 20,
            'TAMAMLA': 10,
        })
        by_mode = {r['mode']: r['percent'] for r in rows}
        self.assertEqual(by_mode['OGREN'], 45)
        self.assertEqual(by_mode['PEKISTIR'], 25)
        self.assertEqual(by_mode['TEKRARLA'], 20)
        self.assertEqual(by_mode['TAMAMLA'], 10)

    def test_ignores_unknown_and_zero(self):
        rows = compute_k3_distribution({
            'OGREN': 10,
            'FOO': 50,
            'HIZLAN': 0,
            '': 8,
        })
        self.assertEqual([r['mode'] for r in rows], ['OGREN'])
        self.assertEqual(rows[0]['percent'], 100)

    def test_catalog_order(self):
        rows = compute_k3_distribution({
            'TAMAMLA': 1,
            'OGREN': 1,
            'HIZLAN': 1,
        })
        self.assertEqual([r['mode'] for r in rows], ['OGREN', 'HIZLAN', 'TAMAMLA'])


class WeekFocusTest(TestCase):
    def test_clear_leader_is_shown(self):
        shares = compute_k3_distribution({
            'OGREN': 45,
            'PEKISTIR': 25,
            'TEKRARLA': 20,
            'TAMAMLA': 10,
        })
        focus = resolve_week_focus(shares)
        self.assertIsNotNone(focus)
        self.assertEqual(focus['mode'], 'OGREN')

    def test_close_race_hides_focus(self):
        shares = compute_k3_distribution({
            'OGREN': 30,
            'PEKISTIR': 28,
            'TEKRARLA': 22,
            'TAMAMLA': 20,
        })
        self.assertIsNone(resolve_week_focus(shares))

    def test_single_mode_is_focus(self):
        shares = compute_k3_distribution({'HIZLAN': 12})
        focus = resolve_week_focus(shares)
        self.assertEqual(focus['mode'], 'HIZLAN')

    def test_empty_has_no_focus(self):
        self.assertIsNone(resolve_week_focus([]))
