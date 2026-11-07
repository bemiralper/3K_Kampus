from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.finans.tests import test_cari_hesaplama as fixtures
from apps.finans.tests import test_finans_logic_fixes as logic
from apps.finans.application.precision_repair import (
    build_precision_repair_plan, apply_precision_repair, rollback_precision_repair,
)
from apps.finans.application.data_audit import build_finans_audit
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.domain.finans_islem_log import FinansIslemLog


class PrecisionRepairTest(fixtures.CariHesaplamaTestBase):
    gider = logic.FinansLogicFixesTest.gider
    ode = logic.FinansLogicFixesTest.ode
    cash = logic.FinansLogicFixesTest.cash

    def damaged_payment(self, old='100'):
        payment, err = self.ode(self.gider())
        self.assertIsNone(err, err)
        BakiyeHareketi.objects.filter(pk=payment.bakiye_hareketi_id).update(
            tutar=Decimal(old), bakiye_sonrasi=-Decimal(old))
        DonemBakiye.objects.filter(mali_hesap=self.mali_hesap).update(
            toplam_gider=Decimal(old), donem_sonu_bakiye=-Decimal(old))
        return payment

    def test_preview_only_selects_and_apply_is_idempotent(self):
        self.damaged_payment()
        with CaptureQueriesContext(connection) as queries:
            plan = build_precision_repair_plan()
        self.assertTrue(all(q['sql'].lstrip().upper().startswith('SELECT') for q in queries))
        self.assertEqual(len(plan['payments']), 1)
        result = apply_precision_repair(plan['digest'])
        self.assertEqual(result['payment_count'], 1)
        self.assertEqual(self.cash(), Decimal('-100.75'))
        self.assertEqual(build_finans_audit()['finding_count'], 0)
        empty = build_precision_repair_plan()
        self.assertEqual(apply_precision_repair(empty['digest'])['payment_count'], 0)
        self.assertEqual(FinansIslemLog.objects.count(), 1)

    def test_restores_rounded_up_fee_and_can_rollback(self):
        self.damaged_payment(old='101')
        plan = build_precision_repair_plan()
        result = apply_precision_repair(plan['digest'])
        self.assertEqual(self.cash(), Decimal('-100.75'))
        rollback_precision_repair(result['repair_id'])
        self.assertEqual(self.cash(), Decimal('-101'))
        self.assertEqual(DonemBakiye.objects.get(mali_hesap=self.mali_hesap).toplam_gider, 101)
        self.assertEqual(len(build_precision_repair_plan()['payments']), 1)

    def test_changed_data_invalidates_approved_digest(self):
        payment = self.damaged_payment()
        plan = build_precision_repair_plan()
        BakiyeHareketi.objects.filter(pk=payment.bakiye_hareketi_id).update(bakiye_oncesi=9)
        with self.assertRaises(ValueError):
            apply_precision_repair(plan['digest'])
        self.assertEqual(self.cash(), -100)
        self.assertEqual(FinansIslemLog.objects.count(), 0)

    def test_wrong_source_is_blocked_without_partial_write(self):
        payment = self.damaged_payment()
        BakiyeHareketi.objects.filter(pk=payment.bakiye_hareketi_id).update(kaynak_id=payment.pk + 100)
        plan = build_precision_repair_plan()
        self.assertTrue(plan['blocked'])
        with self.assertRaises(ValueError):
            apply_precision_repair(plan['digest'])
        self.assertEqual(self.cash(), -100)

    def test_closed_period_requires_separate_manual_review(self):
        self.damaged_payment()
        DonemBakiye.objects.filter(mali_hesap=self.mali_hesap).update(durum='kapandi')
        plan = build_precision_repair_plan()
        self.assertTrue(plan['blocked'])
        with self.assertRaises(ValueError):
            apply_precision_repair(plan['digest'])
        self.assertEqual(self.cash(), -100)

    def test_snapshot_changes_and_every_before_value_are_journalled(self):
        self.damaged_payment()
        _, err = self.ode(self.gider(), tutar=Decimal('20'))
        self.assertIsNone(err, err)
        plan = build_precision_repair_plan()
        self.assertEqual(len(plan['ledger_changes']), 2)
        result = apply_precision_repair(plan['digest'])
        self.assertEqual(self.cash(), Decimal('-120.75'))
        log = FinansIslemLog.objects.get(detay__repair_id=result['repair_id'])
        self.assertEqual(log.detay['ledger_changes'], plan['ledger_changes'])
        self.assertEqual(log.detay['period_changes'], plan['period_changes'])
