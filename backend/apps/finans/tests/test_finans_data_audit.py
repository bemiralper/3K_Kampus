import json
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection, InternalError
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext

from apps.finans.application.data_audit import build_finans_audit
from apps.finans.tests import test_cari_hesaplama as fixtures
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.kurum.domain.models import Kurum


class FinansDataAuditTest(fixtures.CariHesaplamaTestBase):
    def test_finds_corrupt_history_without_writes_and_caps_only_samples(self):
        cari = self._create_musteri()
        gel = GelirKaydi.tum_kayitlar.create(kurum=self.kurum, sube=self.sube,
            cari_hesap=cari, brut_tutar=100, net_tutar=100, kdv_tutar=0,
            fatura_tarihi=self.today, vade_tarihi=self.today, durum='onaylandi',
            silindi_mi=True)
        for _ in range(2):
            GelirTahsilat.objects.create(gelir_kaydi=gel, tutar=80,
                tahsilat_tarihi=self.today, durum='tamamlandi')
        CariHesap.objects.filter(pk=cari.pk).update(toplam_borc=900)
        with CaptureQueriesContext(connection) as queries:
            report = build_finans_audit(kurum_id=self.kurum.pk, sample_limit=1)
        sql = [q['sql'].strip().upper() for q in queries]
        self.assertTrue(sql)
        self.assertTrue(all(q.startswith('SELECT') for q in sql), sql)
        self.assertEqual(report['findings']['missing_payment_ledger']['count'], 2)
        self.assertEqual(len(report['findings']['missing_payment_ledger']['samples']), 1)
        self.assertEqual(report['findings']['overpaid_invoice']['count'], 1)
        self.assertEqual(report['findings']['cari_totals_mismatch']['count'], 1)
        self.assertEqual(GelirTahsilat.objects.count(), 2)
        self.assertEqual(CariHesap.objects.get(pk=cari.pk).toplam_borc, 900)
        other_report = build_finans_audit(kurum_id=self.kurum.pk + 10000)
        self.assertEqual(other_report['finding_count'], 0)

    def test_clean_account_does_not_produce_balance_findings(self):
        self._create_musteri()
        report = build_finans_audit(kurum_id=self.kurum.pk)
        self.assertEqual(report['findings'], {})


class FinansReadOnlyCommandTest(TransactionTestCase):
    def test_command_enforces_database_read_only(self):
        def attempted_write(**kwargs):
            Kurum.objects.create(ad='Yazılmamalı', kod='AUDIT-RO')
        with patch('apps.finans.management.commands.audit_finans_data.build_finans_audit',
                   side_effect=attempted_write):
            with self.assertRaises(InternalError):
                call_command('audit_finans_data', stdout=StringIO())
        self.assertFalse(Kurum.objects.filter(kod='AUDIT-RO').exists())

    def test_command_outputs_json_from_read_only_snapshot(self):
        output = StringIO()
        with CaptureQueriesContext(connection) as queries:
            call_command('audit_finans_data', stdout=output)
        report = json.loads(output.getvalue())
        self.assertTrue(report['read_only'])
        self.assertEqual(report['finding_count'], 0)
        self.assertTrue(any('READ ONLY' in q['sql'] for q in queries))
        writes = [q['sql'] for q in queries if q['sql'].lstrip().upper().startswith(
            ('INSERT ', 'UPDATE ', 'DELETE ', 'ALTER ', 'CREATE ', 'TRUNCATE '))]
        self.assertEqual(writes, [])
