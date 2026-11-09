"""PostgreSQL: aynı hakedişin eşzamanlı bordro aktarımı tek kez uygulanır."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from decimal import Decimal

from django.db import close_old_connections, connections
from django.test import TransactionTestCase

from apps.academic.tests import test_audit_regressions as fixtures
from apps.academic.tests import test_lesson_operations as lesson_fixtures
from apps.ozel_ders.services.bordro_bridge import apply_approved_to_bordro
from apps.personel.domain.sozlesme_models import AylikHakedis


class PayrollConcurrencyTest(TransactionTestCase):
    setUp = lesson_fixtures.LessonOperationsApiTest.setUp
    contract = fixtures.AcademicAuditRegressionTests.contract
    approved_individual = fixtures.AcademicAuditRegressionTests.approved_individual

    def test_history_plan_preserves_ambiguous_tariff(self):
        from apps.academic.services.historical_repair_plan import build_historical_repair_plan
        self.contract()
        h=self.approved_individual()
        h.durum='TASLAK'
        h.tutar=Decimal('250')
        h.birim_ucret=Decimal('250')
        h.save()
        result=build_historical_repair_plan()
        self.assertFalse(result['database_writes'])
        self.assertEqual(result['automatic_actions'],[])
        self.assertEqual(result['manual_review'][0]['kind'],'draft_tariff_difference')
        h.refresh_from_db()
        self.assertEqual(h.tutar,Decimal('250'))

    def test_parallel_transfers_link_entitlement_once(self):
        self.contract()
        self.approved_individual()
        barrier=Barrier(2)
        kurum_id,sube_id=self.kurum.pk,self.sube.pk

        def transfer():
            close_old_connections()
            try:
                with connections['default'].cursor() as cursor:
                    cursor.execute("SET statement_timeout = '10s'")
                barrier.wait(timeout=10)
                return apply_approved_to_bordro(kurum_id=kurum_id,sube_id=sube_id,yil=2025,ay=9)
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:transfer(),range(2)))
        self.assertEqual(sum(r['hakedis_linked'] for r in results),1)
        self.assertEqual(AylikHakedis.objects.count(),1)
        self.assertEqual(AylikHakedis.objects.get().ozel_ders_hakedis_toplam,Decimal('300'))
