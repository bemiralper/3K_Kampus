"""Finans incelemesinde bulunan hataların tekrarını önleyen regresyon testleri."""
from decimal import Decimal
from django.test import override_settings
from rest_framework.test import APIClient

from apps.finans.tests import test_cari_hesaplama as fixtures
from apps.finans.application.gelir_service import GelirService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.application.period.period_service import PeriodService
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class FinansAuditRegressions(fixtures.CariHesaplamaTestBase):
    def gelir(self, **extra):
        data = dict(kurum_id=self.kurum.id, sube_id=self.sube.id,
                    cari_hesap_id=self._create_musteri().id,
                    gelir_kategorisi_id=self.gelir_kat.id,
                    fatura_tarihi=self.today, vade_tarihi=self.today,
                    brut_tutar=Decimal('1000'), kdv_orani=0,
                    egitim_yili_id=self.ey.id)
        data.update(extra)
        obj, err = GelirService().create(data)
        self.assertIsNone(err, err)
        return obj

    def tahsilat(self, gelir, **extra):
        data = dict(gelir_kaydi_id=gelir.id, tutar=Decimal('100'),
                    mali_hesap_id=self.mali_hesap.id,
                    odeme_yontemi_id=self.odeme_yontemi.id,
                    tahsilat_tarihi=self.today)
        data.update(extra)
        return GelirTahsilatService().tahsilat_yap(data)

    def test_rejected_fee_leaves_no_collection_or_balance(self):
        gelir = self.gelir()
        obj, err = self.tahsilat(gelir, kesinti_turu='havale_masrafi', kesinti_tutar=Decimal('10'))
        self.assertIsNotNone(err)
        self.assertIsNone(obj)
        self.assertEqual(gelir.tahsilatlar.count(), 0, '400 dönen tahsilat yine de kaydedildi')
        self.assertEqual(BakiyeHareketi.objects.count(), 0)

    def test_collection_rejects_foreign_institution_account(self):
        gelir = self.gelir()
        kurum = Kurum.objects.create(ad='Diğer kurum', kod='OTHER')
        sube = Sube.objects.create(kurum=kurum, ad='Diğer şube', kod='OTHER')
        hesap = MaliHesap.objects.create(sube=sube, ad='Diğer kasa', tip='kasa')
        yontem = OdemeYontemi.objects.create(kurum=kurum, mali_hesap=hesap, ad='Nakit', tip='nakit')
        _, err = self.tahsilat(gelir, mali_hesap_id=hesap.id, odeme_yontemi_id=yontem.id)
        self.assertIsNotNone(err, 'Başka kurumun hesabına tahsilat kabul edildi')

    def test_collection_preserves_cents_in_cash_ledger(self):
        obj, err = self.tahsilat(self.gelir(), tutar=Decimal('100.75'))
        self.assertIsNone(err, err)
        hareket = BakiyeHareketi.objects.get(pk=obj.bakiye_hareketi_id)
        self.assertEqual(Decimal(hareket.tutar), obj.tutar)

    def test_partial_vat_change_preserves_inclusive_total(self):
        gelir = self.gelir(brut_tutar=Decimal('1200'), kdv_orani=20, kdv_mod='dahil')
        gelir, err = GelirService().update(gelir.id, {'kdv_orani': 10})
        self.assertIsNone(err, err)
        self.assertEqual(gelir.net_tutar, Decimal('1200'))

    def test_changing_customer_after_collection_keeps_balances_consistent(self):
        gelir = self.gelir()
        old_cari = gelir.cari_hesap
        _, err = self.tahsilat(gelir)
        self.assertIsNone(err, err)
        yeni = self._create_musteri('Yeni müşteri')
        _, err = GelirService().update(gelir.id, {'cari_hesap_id': yeni.id})
        if err:
            return  # Tahsilat varken cari değişikliğinin reddi de güvenli davranıştır.
        old_cari.refresh_from_db()
        yeni.refresh_from_db()
        self.assertEqual(old_cari.bakiye, Decimal('0'))
        self.assertEqual(yeni.bakiye, Decimal('900'))

    def period_rows(self):
        return PeriodService.period_details(kurum_id=self.kurum.id, sube_id=self.sube.id,
                    baslangic=self.today, bitis=self.today, mode='beklenen', kaynak='gelir')

    def test_expected_period_includes_vat(self):
        gelir = self.gelir(kdv_orani=20)
        rows = self.period_rows()
        self.assertEqual(next(r for r in rows if r['gelir_id'] == gelir.id)['kalan_tutar'], 1200)

    def test_expected_period_keeps_partially_collected_income(self):
        gelir = self.gelir()
        _, err = self.tahsilat(gelir)
        self.assertIsNone(err, err)
        rows = self.period_rows()
        self.assertTrue(any(r['gelir_id'] == gelir.id for r in rows), 'Kısmi tahsilatta gelir rapordan kayboldu')

    def test_cancelled_offset_restores_available_advance(self):
        cari = self._create_tedarikci()
        _, err = CariOdemeService().serbest_odeme_yap(dict(
            kurum_id=self.kurum.id, sube_id=self.sube.id, cari_hesap_id=cari.id,
            egitim_yili_id=self.ey.id, tutar=Decimal('1000'), odeme_tarihi=self.today,
            mali_hesap_id=self.mali_hesap.id, odeme_yontemi_id=self.odeme_yontemi.id))
        self.assertIsNone(err, err)
        gider, err = GiderService().create(dict(
            kurum_id=self.kurum.id, sube_id=self.sube.id, cari_hesap_id=cari.id,
            gider_kategorisi_id=self.gider_kat.id, brut_tutar=Decimal('1000'), kdv_orani=0,
            fatura_tarihi=self.today, vade_tarihi=self.today, egitim_yili_id=self.ey.id))
        self.assertIsNone(err, err)
        svc = GiderOdemeService()
        data = dict(gider_kaydi_id=gider.id, tutar=Decimal('400'),
                    odeme_tarihi=self.today, bakiyeden_mahsup=True)
        odeme, err = svc.odeme_yap(data)
        self.assertIsNone(err, err)
        _, err = svc.odeme_iptal(odeme.id)
        self.assertIsNone(err, err)
        _, err = svc.odeme_yap({**data, 'tutar': Decimal('1000')})
        self.assertIsNone(err, 'İptal edilen mahsup bakiyeyi geri vermeli: ' + str(err))

    def test_closed_period_rejects_new_collection(self):
        from apps.finans.application.donem_bakiye_service import DonemBakiyeService
        gelir = self.gelir()
        svc = DonemBakiyeService()
        svc.donem_ac(self.kurum.id, self.sube.id, self.ey.id)
        svc.donem_kapat(self.sube.id, self.ey.id)
        _, err = self.tahsilat(gelir)
        self.assertIsNotNone(err, 'Kapalı dönem yeni tahsilatla değiştirildi')

    def test_rollover_does_not_create_extra_cash(self):
        from apps.finans.application.donem_bakiye_service import DonemBakiyeService
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        from apps.egitim_yili.domain.models import EgitimYili
        svc = DonemBakiyeService()
        svc.donem_ac(self.kurum.id, self.sube.id, self.ey.id)
        _, err = self.tahsilat(self.gelir())
        self.assertIsNone(err, err)
        before = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)
        svc.donem_kapat(self.sube.id, self.ey.id)
        yeni = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027)
        svc.donem_devret(self.sube.id, self.ey.id, yeni.id, self.kurum.id)
        self.assertEqual(BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id), before)

    def test_cash_flow_report_includes_free_advance(self):
        from apps.finans.application.finans_v2.rapor_service import FinansV2RaporService
        cari = self._create_tedarikci()
        _, err = CariOdemeService().serbest_odeme_yap(dict(
            kurum_id=self.kurum.id, sube_id=self.sube.id, cari_hesap_id=cari.id,
            egitim_yili_id=self.ey.id, tutar=Decimal('1000'), odeme_tarihi=self.today,
            mali_hesap_id=self.mali_hesap.id, odeme_yontemi_id=self.odeme_yontemi.id))
        self.assertIsNone(err, err)
        rapor = FinansV2RaporService().nakit_akisi(self.kurum.id, self.sube.id, {})
        self.assertEqual(rapor['kpis'][1]['value'], 1000, 'Kasa çıkışı nakit akışından eksik')

    def manual_cheque(self):
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        yontem = OdemeYontemi.objects.create(kurum=self.kurum, ad='Çek', tip='cek')
        result, err = CekSenetService().create_alinan(dict(
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            odeme_yontemi_id=yontem.id, tutar=1000, vade_tarihi=self.today))
        self.assertIsNone(err, err)
        return result['id']

    @override_settings(CEK_SENET_V2_ENABLED=True)
    def test_manual_received_cheque_can_be_collected(self):
        from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
        _, err = CekSenetService().tahsil_et(self.manual_cheque(),
                    tahsilat_mali_hesap_id=self.mali_hesap.id)
        self.assertIsNone(err, err)

    @override_settings(CEK_SENET_V2_ENABLED=True)
    def test_cheque_detail_rejects_other_branch(self):
        from apps.finans.tests.test_sube_isolation import _assign_finans_read_manage
        pk = self.manual_cheque()
        other = Sube.objects.create(kurum=self.kurum, ad='Yetkili şube', kod='AUDIT2')
        _assign_finans_read_manage(self.user)
        client = APIClient()
        client.force_authenticate(user=self.user)
        result = client.get(f'/finans/api/cek-senet/{pk}/',
                    {'kurum_id': self.kurum.id, 'sube_id': other.id},
                    HTTP_X_SUBE_ID=str(other.id))
        self.assertIn(result.status_code, [403, 404], result.data)

    @override_settings(CEK_SENET_V2_ENABLED=True)
    def test_cheque_edit_rejects_other_branch(self):
        from apps.finans.tests.test_sube_isolation import _assign_finans_read_manage
        pk = self.manual_cheque()
        other = Sube.objects.create(kurum=self.kurum, ad='Yetkili şube', kod='AUDIT2')
        _assign_finans_read_manage(self.user)
        client = APIClient()
        client.force_authenticate(user=self.user)
        result = client.patch(f'/finans/api/cek-senet/{pk}/',
                    {'aciklama': 'Başka şubeden değişiklik'}, format='json',
                    HTTP_X_SUBE_ID=str(other.id))
        self.assertIn(result.status_code, [403, 404], result.data)
