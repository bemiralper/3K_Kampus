"""Eşit taksit bölme — frontend buildEqualTaksitRows ile backend uyumu."""
from django.test import SimpleTestCase

from apps.odeme_takip.application.services.taksit_service import TaksitService


class TaksitEqualSplitTests(SimpleTestCase):
    def test_split_150000_12_installments(self):
        amounts = TaksitService._split_equal_amounts(150_000, 12)
        self.assertEqual(len(amounts), 12)
        self.assertEqual(sum(amounts), 150_000)
        self.assertTrue(all(a == 12_500 for a in amounts[:-1]))
        self.assertEqual(amounts[-1], 12_500)

    def test_split_with_remainder_on_last(self):
        amounts = TaksitService._split_equal_amounts(100_000, 3)
        self.assertEqual(sum(amounts), 100_000)
        self.assertEqual(amounts[0], 33_300)
        self.assertEqual(amounts[1], 33_300)
        self.assertEqual(amounts[2], 33_400)

    def test_installment_count_with_pesinat(self):
        self.assertEqual(TaksitService._installment_count_for_equal_plan(12, 10_000), 11)
        self.assertEqual(TaksitService._installment_count_for_equal_plan(12, 0), 12)
        self.assertEqual(TaksitService._installment_count_for_equal_plan(1, 5_000), 1)
