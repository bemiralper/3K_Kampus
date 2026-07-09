"""Tahsilat iptal testleri."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class TahsilatCancelTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='İptal Kurum', kod='IPT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='IPT')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Öğrenci',
            aktif_mi=True,
        )
        self.mali_hesap = MaliHesap.objects.create(sube=self.sube, ad='Kasa')
        self.odeme_yontemi = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap,
            kurum=self.kurum,
            ad='Nakit',
            tip=OdemeYontemiTipi.NAKIT,
            komisyon_orani=Decimal('0'),
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-IPT-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=5000,
            net_tutar=5000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.taksit = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate(),
            tutar=5000,
            odenen_tutar=0,
            kalan_tutar=5000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        self.service = TahsilatService()
        self.today = timezone.localdate()

    def test_cancel_active_tahsilat_updates_taksit_and_status(self):
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'mali_hesap_id': self.mali_hesap.id,
            'tutar': 5000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)

        cancelled, cancel_err = self.service.cancel(tahsilat.pk, 'Yanlış kayıt', user=None)
        self.assertIsNone(cancel_err)
        self.assertEqual(cancelled.durum, TahsilatDurum.IPTAL_EDILDI)
        self.assertEqual(cancelled.iptal_nedeni, 'Yanlış kayıt')

        self.taksit.refresh_from_db()
        self.assertEqual(self.taksit.odenen_tutar, 0)
        self.assertEqual(self.taksit.kalan_tutar, 5000)
        self.assertEqual(self.taksit.durum, TaksitDurum.BEKLEMEDE)

    def test_cancel_requires_reason(self):
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'mali_hesap_id': self.mali_hesap.id,
            'tutar': 1000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)

        cancelled, cancel_err = self.service.cancel(tahsilat.pk, 'ab', user=None)
        self.assertIsNone(cancelled)
        self.assertIn('error', cancel_err)

    def test_cancel_creates_single_reversal_and_balance_returns_to_zero(self):
        """Tahsilat girişi + iptal çıkışı = net 0; tam olarak bir iptal hareketi."""
        from apps.finans.constants.hareket_types import HareketKaynagi
        from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
        from apps.finans.infrastructure.bakiye_hareketi_repository import (
            BakiyeHareketiRepository,
        )

        bakiye_once = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'mali_hesap_id': self.mali_hesap.id,
            'tutar': 5000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)
        self.assertEqual(
            BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id),
            bakiye_once + 5000,
        )

        cancelled, cancel_err = self.service.cancel(tahsilat.pk, 'Yanlış kayıt', user=None)
        self.assertIsNone(cancel_err)

        # Bakiye başlangıç seviyesine dönmeli (çift düşme olmamalı)
        self.assertEqual(
            BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id),
            bakiye_once,
        )
        # Tam olarak bir iptal hareketi olmalı
        self.assertEqual(
            BakiyeHareketi.objects.filter(
                kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                kaynak_id=tahsilat.pk,
                kaynak_tip='tahsilat',
            ).count(),
            1,
        )

    def test_double_cancel_does_not_debit_twice(self):
        """Aynı tahsilat iki kez iptal edilse bile kasa yalnızca bir kez geri alınmalı."""
        from apps.finans.constants.hareket_types import HareketKaynagi
        from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
        from apps.finans.infrastructure.bakiye_hareketi_repository import (
            BakiyeHareketiRepository,
        )
        from apps.odeme_takip.domain.enums import TahsilatDurum
        from apps.odeme_takip.domain.models import Tahsilat

        bakiye_once = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'mali_hesap_id': self.mali_hesap.id,
            'tutar': 5000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)

        cancelled, cancel_err = self.service.cancel(tahsilat.pk, 'İlk iptal', user=None)
        self.assertIsNone(cancel_err)

        # İkinci iptal denemesi: durum zaten iptal → reddedilir
        _, second_err = self.service.cancel(tahsilat.pk, 'İkinci iptal', user=None)
        self.assertIsNotNone(second_err)

        # Durum bozulmuş gibi zorla aktif yapıp yeniden iptal edilse bile
        # ledger seviyesindeki koruma ikinci çıkışı engellemeli.
        Tahsilat.objects.filter(pk=tahsilat.pk).update(durum=TahsilatDurum.AKTIF)
        self.service.cancel(tahsilat.pk, 'Zorla tekrar iptal', user=None)

        self.assertEqual(
            BakiyeHareketi.objects.filter(
                kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                kaynak_id=tahsilat.pk,
                kaynak_tip='tahsilat',
            ).count(),
            1,
        )
        self.assertEqual(
            BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id),
            bakiye_once,
        )

    def test_cancel_without_prior_bakiye_hareketi_does_not_debit_account(self):
        """Giriş hareketi olmayan tahsilat iptalinde kasa borçlandırılmamalı."""
        from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
        from apps.finans.constants.hareket_types import HareketKaynagi
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        from apps.odeme_takip.domain.models import Tahsilat

        tahsilat = Tahsilat.objects.create(
            sozlesme=self.sozlesme,
            taksit=self.taksit,
            odeme_yontemi=self.odeme_yontemi,
            mali_hesap=self.mali_hesap,
            tutar=250000,
            tahsilat_tarihi=self.today,
            durum='aktif',
            tahsilat_turu='normal',
        )
        bakiye_once = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)

        cancelled, cancel_err = self.service.cancel(tahsilat.pk, 'Yanlış kayıt', user=None)
        self.assertIsNone(cancel_err)
        self.assertEqual(cancelled.durum, 'iptal_edildi')

        bakiye_sonra = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)
        self.assertEqual(bakiye_once, bakiye_sonra)
        self.assertFalse(
            BakiyeHareketi.objects.filter(
                mali_hesap_id=self.mali_hesap.id,
                kaynak=HareketKaynagi.TAHSILAT_IPTAL,
                kaynak_id=tahsilat.pk,
            ).exists()
        )
