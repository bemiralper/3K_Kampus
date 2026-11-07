"""İncelemede bulunan hataların komşu işlem ve uç durumları."""
from decimal import Decimal

from django.test import override_settings
from django.utils import timezone

from apps.finans.tests import test_cari_hesaplama as fixtures
from apps.finans.tests import test_finans_audit_regressions as audit
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.application.donem_bakiye_service import DonemBakiyeService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.hesap_transferi_service import HesapTransferiService
from apps.finans.application.finans_v2.rapor_service import FinansV2RaporService
from apps.finans.application.period.period_service import PeriodService
from apps.finans.application.gun_sonu_finans_helpers import bugun_alinan_toplam
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.islem_masrafi import IslemMasrafi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.egitim_yili.domain.models import EgitimYili


@override_settings(CEK_SENET_V2_ENABLED=True)
class FinansLogicFixesTest(fixtures.CariHesaplamaTestBase):
    gelir = audit.FinansAuditRegressions.gelir
    tahsilat = audit.FinansAuditRegressions.tahsilat
    manual_cheque = audit.FinansAuditRegressions.manual_cheque

    def gider(self, **extra):
        data = dict(kurum_id=self.kurum.pk, sube_id=self.sube.pk,
            cari_hesap_id=self._create_tedarikci().pk, gider_kategorisi_id=self.gider_kat.pk,
            brut_tutar=Decimal('1000'), kdv_orani=0, fatura_tarihi=self.today,
            vade_tarihi=self.today, egitim_yili_id=self.ey.pk)
        data.update(extra)
        obj, err = GiderService().create(data)
        self.assertIsNone(err, err)
        return obj

    def ode(self, gider, **extra):
        data = dict(gider_kaydi_id=gider.pk, tutar=Decimal('100.75'), odeme_tarihi=self.today,
            mali_hesap_id=self.mali_hesap.pk, odeme_yontemi_id=self.odeme_yontemi.pk)
        data.update(extra)
        return GiderOdemeService().odeme_yap(data)

    def cash(self):
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        return BakiyeHareketiRepository.son_bakiye(self.mali_hesap.pk)

    def test_expense_cents_survive_payment_and_cancellation(self):
        gider = self.gider()
        odeme, err = self.ode(gider)
        self.assertIsNone(err, err)
        self.assertEqual(self.cash(), Decimal('-100.75'))
        _, err = GiderOdemeService().odeme_iptal(odeme.pk)
        self.assertIsNone(err, err)
        self.assertEqual(self.cash(), Decimal('0.00'))
        gider.refresh_from_db()
        self.assertEqual(gider.odenen_toplam, 0)

    def test_fee_rejection_rolls_back_expense_payment(self):
        gider = self.gider()
        _, err = self.ode(gider, kesinti_turu='havale_masrafi', kesinti_tutar=Decimal('10'))
        self.assertIsNotNone(err)
        self.assertEqual(GiderOdeme.objects.count(), 0)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)
        gider.refresh_from_db()
        self.assertEqual(gider.odenen_toplam, 0)

    def test_fee_rejection_rolls_back_both_transfer_legs(self):
        hedef = MaliHesap.objects.create(sube=self.sube, ad='Hedef kasa')
        _, err = HesapTransferiService().transfer_yap(dict(kaynak_hesap_id=self.mali_hesap.pk,
            hedef_hesap_id=hedef.pk, tutar=Decimal('100.75'), transfer_tarihi=self.today,
            egitim_yili_id=self.ey.pk, odeme_yontemi_id=self.odeme_yontemi.pk,
            kesinti_turu='havale_masrafi', kesinti_tutar=Decimal('10')))
        self.assertIsNotNone(err)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)
        self.assertEqual(self.cash(), 0)

    def test_sub_lira_fee_and_cancel_without_year_are_exact(self):
        self.odeme_yontemi.tip = 'havale_eft'
        self.odeme_yontemi.save()
        gel = self.gelir(egitim_yili_id=None)
        th, err = self.tahsilat(gel, tutar=Decimal('100.75'),
            kesinti_turu='havale_masrafi', kesinti_tutar=Decimal('0.25'))
        self.assertIsNone(err, err)
        self.assertEqual(self.cash(), Decimal('100.50'))
        self.assertEqual(IslemMasrafi.objects.get().bakiye_tutar, Decimal('0.25'))
        _, err = GelirTahsilatService().tahsilat_iptal(th.pk)
        self.assertIsNone(err, err)
        self.assertEqual(self.cash(), 0)

    def test_paid_expense_cannot_change_supplier(self):
        gider = self.gider()
        _, err = self.ode(gider)
        self.assertIsNone(err, err)
        yeni = self._create_tedarikci('Yeni')
        _, err = GiderService().update(gider.pk, {'cari_hesap_id': yeni.pk})
        self.assertIsNotNone(err)
        gider.refresh_from_db()
        self.assertNotEqual(gider.cari_hesap_id, yeni.pk)

    def test_expense_partial_inclusive_vat_update_preserves_total(self):
        gider = self.gider(brut_tutar=Decimal('1200'), kdv_orani=20, kdv_mod='dahil')
        gider, err = GiderService().update(gider.pk, {'kdv_orani': 10})
        self.assertIsNone(err, err)
        self.assertEqual(gider.net_tutar, Decimal('1200'))
        self.assertEqual(gider.brut_tutar + gider.kdv_tutar, gider.net_tutar)

    def test_closed_period_failed_payment_leaves_no_rows(self):
        gider = self.gider()
        period = DonemBakiyeService()
        period.donem_ac(self.kurum.pk, self.sube.pk, self.ey.pk)
        period.donem_kapat(self.sube.pk, self.ey.pk)
        _, err = self.ode(gider)
        self.assertIsNotNone(err)
        self.assertEqual(GiderOdeme.objects.count(), 0)
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

    def test_negative_fractional_rollover_to_existing_open_period(self):
        period = DonemBakiyeService()
        period.donem_ac(self.kurum.pk, self.sube.pk, self.ey.pk)
        _, err = self.ode(self.gider())
        self.assertIsNone(err, err)
        period.donem_kapat(self.sube.pk, self.ey.pk)
        yeni = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027)
        period.donem_ac(self.kurum.pk, self.sube.pk, yeni.pk)
        period.donem_devret(self.sube.pk, self.ey.pk, yeni.pk, self.kurum.pk)
        self.assertEqual(self.cash(), Decimal('-100.75'))
        donem = DonemBakiye.objects.get(mali_hesap=self.mali_hesap, egitim_yili=yeni)
        self.assertEqual(donem.donem_basi_bakiye, Decimal('-100.75'))
        self.assertEqual(donem.donem_sonu_bakiye, Decimal('-100.75'))
        with self.assertRaises(ValueError):
            period.donem_devret(self.sube.pk, self.ey.pk, yeni.pk, self.kurum.pk)

    def test_partial_vat_receipt_summary_and_rows_agree_to_cent(self):
        gel = self.gelir(brut_tutar=Decimal('100.25'), kdv_orani=20)
        _, err = self.tahsilat(gel, tutar=Decimal('20.15'))
        self.assertIsNone(err, err)
        params = dict(kurum_id=self.kurum.pk, sube_id=self.sube.pk,
            baslangic=self.today, bitis=self.today, kaynak='gelir', mode='beklenen')
        rows = PeriodService.period_details(**params)
        summary = PeriodService.period_summary(**params)['ozet']
        self.assertEqual(rows[0]['kalan_tutar'], Decimal('100.15'))
        self.assertEqual(summary['toplam_kalan'], Decimal('100.15'))

    def test_manual_cheque_cari_receipt_counts_once_and_cannot_repeat(self):
        pk = self.manual_cheque()
        from apps.odeme_takip.domain.cek_senet import CekSenetDetay
        cari = self._create_musteri()
        CekSenetDetay.objects.filter(pk=pk).update(cari_hesap=cari)
        svc = CekSenetService()
        _, err = svc.tahsil_et(pk, tahsilat_mali_hesap_id=self.mali_hesap.pk)
        self.assertIsNone(err, err)
        self.assertEqual(self.cash(), 1000)
        cari.refresh_from_db()
        self.assertEqual(cari.toplam_alacak, 1000)
        self.assertEqual(bugun_alinan_toplam(self.kurum.pk, self.today, self.sube.pk), 1000)
        _, err = svc.tahsil_et(pk, tahsilat_mali_hesap_id=self.mali_hesap.pk)
        self.assertIsNotNone(err)
        self.assertEqual(self.cash(), 1000)

    def test_manual_cheque_without_cari_in_period_and_cash_flow(self):
        _, err = CekSenetService().tahsil_et(self.manual_cheque(),
            tahsilat_mali_hesap_id=self.mali_hesap.pk)
        self.assertIsNone(err, err)
        summary = PeriodService.period_summary(kurum_id=self.kurum.pk, sube_id=self.sube.pk,
            baslangic=self.today, bitis=self.today)['ozet']
        self.assertEqual(summary['toplam_tutar'], 1000)
        self.assertEqual(bugun_alinan_toplam(self.kurum.pk, self.today, self.sube.pk), 1000)
        report = FinansV2RaporService().nakit_akisi(self.kurum.pk, self.sube.pk, {})
        self.assertEqual(report['kpis'][0]['value'], 1000)

    def test_money_list_and_json_and_report_format_preserve_cents(self):
        import json
        from rest_framework.renderers import JSONRenderer
        from apps.finans.application.selectors.para_hareketi_selector import ParaHareketiSelector
        from apps.finans.interfaces.serializers.bakiye_hareketi_serializer import BakiyeHareketiListSerializer
        from apps.finans.application.export.gun_sonu_report_html import _fmt_tl

        _, err = self.tahsilat(self.gelir(), tutar=Decimal('100.75'))
        self.assertIsNone(err, err)
        data = ParaHareketiSelector().list(self.kurum.pk, sube_id=self.sube.pk)
        self.assertEqual(data['toplam_giris'], Decimal('100.75'))
        self.assertEqual(data['results'][0]['tutar'], Decimal('100.75'))
        serialized = BakiyeHareketiListSerializer(BakiyeHareketi.objects.get()).data
        payload = json.loads(JSONRenderer().render(serialized))
        self.assertEqual(payload['tutar'], 100.75)
        self.assertEqual(payload['signed_tutar'], 100.75)
        self.assertEqual(_fmt_tl(Decimal('100.75')), '₺100,75')
