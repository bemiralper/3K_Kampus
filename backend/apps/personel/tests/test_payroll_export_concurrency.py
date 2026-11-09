from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import connections, close_old_connections
from django.test import TransactionTestCase
from apps.personel.tests import test_audit_regressions as fixtures
from apps.personel.application.payroll_expense_service import export_payroll_expenses
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_kategorisi import GiderKategorisi


class PayrollExpenseConcurrencyTest(TransactionTestCase):
    setUp=fixtures.PersonnelAudit.setUp
    contract=fixtures.PersonnelAudit.contract
    payroll=fixtures.PersonnelAudit.payroll

    def test_parallel_export_creates_one_expense(self):
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Salary')
        ctx={'kurum_id':self.kurum.pk,'sube_id':self.sube_a.pk,'egitim_yili_id':self.yil.pk}
        body={'yil':2025,'ay':9,'gider_kategorisi_id':category.pk}
        barrier=Barrier(2)
        def execute():
            close_old_connections()
            try:
                with connections['default'].cursor() as cursor:
                    cursor.execute("SET statement_timeout = '10s'")
                barrier.wait(timeout=10)
                return export_payroll_expenses(ctx,body)
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:execute(),range(2)))
        self.assertEqual(sum(r['olusturulan'] for r in results),1)
        self.assertEqual(sum(r['zaten_aktarilan'] for r in results),1)
        self.assertEqual(GiderKaydi.objects.count(),1)
