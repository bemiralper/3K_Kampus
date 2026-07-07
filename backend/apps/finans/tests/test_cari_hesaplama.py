"""
Cari hesap bakiye ve işlem türü hesaplama testleri.

Muhasebe modeli:
  Müşteri — satış (borç), tahsilat/iade (alacak), bakiye = borç − alacak
  Tedarikçi — alış (alacak), ödeme (borç), bakiye = borç − alacak
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.cari_balance import aggregate_list_totals, net_bakiye
from apps.finans.application.cari_hesap_service import CariHesapService
from apps.finans.application.gelir_service import GelirService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.selectors.cari_hesap_selector import CariHesapSelector
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.infrastructure.cari_hareket_repository import CariHareketRepository
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class CariHesaplamaTestBase(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Cari Test Kurum', kod='CARIT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CAR-M')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='caritest', password='test')
        self.mali_hesap = MaliHesap.objects.create(
            sube=self.sube, ad='Kasa', tip=MaliHesapTipi.KASA,
        )
        self.odeme_yontemi = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap,
            kurum=self.kurum,
            ad='Nakit',
            tip=OdemeYontemiTipi.NAKIT,
            komisyon_orani=Decimal('0'),
        )
        self.gelir_kat = GelirKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Satış',
        )
        self.gider_kat = GiderKategorisi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mal Alım',
        )
        self.today = timezone.localdate()

    def _create_musteri(self, unvan='Test Müşteri'):
        svc = CariHesapService()
        hesap, err = svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'unvan': unvan,
            'hesap_turu': CariHesapTuru.MUSTERI,
        })
        self.assertIsNone(err, err)
        return hesap

    def _create_tedarikci(self, unvan='Test Tedarikçi'):
        svc = CariHesapService()
        hesap, err = svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'unvan': unvan,
            'hesap_turu': CariHesapTuru.TEDARIKCI,
        })
        self.assertIsNone(err, err)
        return hesap

    def _refresh_cari(self, cari_id):
        return CariHesap.objects.get(pk=cari_id)

    def _assert_bakiye(self, cari, *, bakiye, borc=None, alacak=None):
        """Net bakiye ve hareket–hesap tutarlılığını doğrular."""
        cari.refresh_from_db()
        self.assertEqual(float(cari.bakiye), float(bakiye))
        totals = CariHareketRepository.toplam_borc_alacak(cari.pk)
        self.assertEqual(float(totals['toplam_borc']), float(cari.toplam_borc))
        self.assertEqual(float(totals['toplam_alacak']), float(cari.toplam_alacak))
        self.assertEqual(
            float(cari.toplam_borc) - float(cari.toplam_alacak),
            float(bakiye),
        )
        if borc is not None:
            self.assertEqual(float(cari.toplam_borc), float(borc))
        if alacak is not None:
            self.assertEqual(float(cari.toplam_alacak), float(alacak))


class MusteriCariHesaplamaTest(CariHesaplamaTestBase):
    def test_musteri_satis_tahsilat_iade_lifecycle(self):
        """Satış → tahsilat → tahsilat iptali → gelir iptali (iade) bakiye doğruluğu."""
        cari = self._create_musteri()
        gelir_svc = GelirService()

        gelir, err = gelir_svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': cari.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('10000'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=10000, borc=10000, alacak=0)

        tahsilat_svc = GelirTahsilatService()
        tahsilat, err = tahsilat_svc.tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('3000'),
            'tahsilat_tarihi': self.today,
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=7000, borc=10000, alacak=3000)

        _, err = tahsilat_svc.tahsilat_iptal(tahsilat.id)
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=10000)

        _, err = gelir_svc.iptal_et(gelir.id)
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=0)

    def test_musteri_islem_turu_totals(self):
        cari = self._create_musteri()
        gelir_svc = GelirService()
        gelir, _ = gelir_svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': cari.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('5000'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('2000'),
            'tahsilat_tarihi': self.today,
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'islem_yapan': self.user,
        })

        totals = CariHesapSelector()._islem_totals_map([cari.id])[cari.id]
        self.assertEqual(totals['satis'], 5000.0)
        self.assertEqual(totals['tahsilat'], 2000.0)
        self.assertEqual(totals['alis'], 0.0)
        self.assertEqual(totals['odeme'], 0.0)


class TedarikciCariHesaplamaTest(CariHesaplamaTestBase):
    def test_tedarikci_alis_odeme_iade_lifecycle(self):
        """Alış → ödeme → gider iptali bakiye doğruluğu."""
        cari = self._create_tedarikci()
        gider_svc = GiderService()

        gider, err = gider_svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': cari.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('8000'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=-8000, borc=0, alacak=8000)

        odeme_svc = GiderOdemeService()
        _, err = odeme_svc.odeme_yap({
            'gider_kaydi_id': gider.id,
            'tutar': Decimal('3000'),
            'odeme_tarihi': self.today,
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=-5000, borc=3000, alacak=8000)

        _, err = gider_svc.iptal_et(gider.id)
        self.assertIsNotNone(err)

        odeme = gider.odemeler.first()
        _, err = odeme_svc.odeme_iptal(odeme.id)
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=-8000)

        _, err = gider_svc.iptal_et(gider.id)
        self.assertIsNone(err, err)
        self._assert_bakiye(cari, bakiye=0)

    def test_tedarikci_islem_turu_totals(self):
        cari = self._create_tedarikci()
        gider_svc = GiderService()
        gider, _ = gider_svc.create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': cari.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('4000'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        GiderOdemeService().odeme_yap({
            'gider_kaydi_id': gider.id,
            'tutar': Decimal('1500'),
            'odeme_tarihi': self.today,
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'islem_yapan': self.user,
        })

        totals = CariHesapSelector()._islem_totals_map([cari.id])[cari.id]
        self.assertEqual(totals['alis'], 4000.0)
        self.assertEqual(totals['odeme'], 1500.0)
        self.assertEqual(totals['satis'], 0.0)


class CariListeToplamTest(CariHesaplamaTestBase):
    def test_aggregate_list_totals_respects_filtered_rows(self):
        musteri = self._create_musteri('M1')
        tedarikci = self._create_tedarikci('T1')
        GelirService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': musteri.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('1000'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        GiderService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': tedarikci.id,
            'gider_kategorisi_id': self.gider_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('500'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })

        musteri.refresh_from_db()
        tedarikci.refresh_from_db()
        rows = [
            {
                'toplam_borc': float(musteri.toplam_borc),
                'toplam_alacak': float(musteri.toplam_alacak),
                'bakiye_durumu': musteri.bakiye_durumu,
                'toplam_satis': 1000,
                'toplam_alis': 0,
                'toplam_tahsilat': 0,
                'toplam_odeme': 0,
                'toplam_iade': 0,
                'toplam_mahsup': 0,
            },
        ]
        ozet = aggregate_list_totals(rows)
        self.assertEqual(ozet['toplam_cari'], 1)
        self.assertEqual(ozet['toplam_borc'], 1000.0)
        self.assertEqual(ozet['toplam_satis'], 1000.0)
        self.assertEqual(ozet['toplam_alis'], 0.0)
        self.assertNotEqual(ozet['toplam_borc'], float(tedarikci.toplam_borc))


class GunSonuCariUyumTest(CariHesaplamaTestBase):
    """Gün sonu / dönem toplamları cari tahsilatı çift saymamalı."""

    def _gelir_ile_tahsilat(self, brut='1000', tahsilat='400'):
        gelir, err = GelirService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': self._create_musteri().id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal(brut),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        self.assertIsNone(err, err)
        tahsilat_obj, err = GelirTahsilatService().tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal(tahsilat),
            'tahsilat_tarihi': self.today,
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'islem_yapan': self.user,
        })
        self.assertIsNone(err, err)
        return gelir, tahsilat_obj

    def test_gelir_tahsilat_gun_sonu_tek_sayilir(self):
        """GelirTahsilat + otomatik CariHareket(TAHSILAT) çift sayılmamalı."""
        from apps.finans.application.gun_sonu_finans_helpers import bugun_alinan_toplam

        self._gelir_ile_tahsilat(brut='1000', tahsilat='400')
        toplam = bugun_alinan_toplam(self.kurum.id, self.today, self.sube.id)
        self.assertEqual(toplam, 400)

    def test_gelir_tahsilat_iptali_gun_sonuna_yansimaz(self):
        from apps.finans.application.gun_sonu_finans_helpers import bugun_alinan_toplam

        _, tahsilat_obj = self._gelir_ile_tahsilat(brut='1000', tahsilat='400')
        GelirTahsilatService().tahsilat_iptal(tahsilat_obj.id)
        toplam = bugun_alinan_toplam(self.kurum.id, self.today, self.sube.id)
        self.assertEqual(toplam, 0)

    def test_period_summary_cari_bagimsiz_bos(self):
        """Dönem özeti cari kovası GelirTahsilat kaynaklı hareketleri saymamalı."""
        from apps.finans.application.period.period_service import PeriodService

        self._gelir_ile_tahsilat(brut='1000', tahsilat='400')
        data = PeriodService.period_summary(
            kurum_id=self.kurum.id,
            baslangic=self.today,
            bitis=self.today,
            sube_id=self.sube.id,
            mode='alinan',
        )
        kaynaklar = data['ozet']['kaynak_kirilimi']
        cari_row = next((k for k in kaynaklar if k.get('kaynak') == 'cari'), None)
        if cari_row is not None:
            self.assertEqual(int(cari_row.get('toplam') or 0), 0)
        self.assertEqual(int(data['ozet']['toplam_tutar']), 400)


class CariSilmeTest(CariHesaplamaTestBase):
    def test_cari_silme_bakiye_varken_engellenir(self):
        cari = self._create_musteri()
        GelirService().create({
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'cari_hesap_id': cari.id,
            'gelir_kategorisi_id': self.gelir_kat.id,
            'fatura_tarihi': self.today,
            'vade_tarihi': self.today,
            'brut_tutar': Decimal('100'),
            'kdv_orani': 0,
            'olusturan': self.user,
        })
        _, err = CariHesapService().soft_delete(cari.id)
        self.assertIsNotNone(err)

    def test_sifir_bakiyeli_cari_silme(self):
        cari = self._create_musteri()
        _, err = CariHesapService().soft_delete(cari.id)
        self.assertIsNone(err, err)
