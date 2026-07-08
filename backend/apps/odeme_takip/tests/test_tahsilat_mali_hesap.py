"""Tahsilat → mali hesap bakiye hareketi testleri."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class TahsilatMaliHesapTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Mali Kurum', kod='MLH')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MLH')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Öğrenci',
            aktif_mi=True,
        )
        self.mali_hesap = MaliHesap.objects.create(sube=self.sube, ad='Vakıfbank')
        self.plan_yontemi = OdemeYontemi.objects.create(
            mali_hesap=None,
            kurum=self.kurum,
            ad='Havale / EFT',
            tip=OdemeYontemiTipi.HAVALE_EFT,
            komisyon_orani=Decimal('0'),
        )
        self.bagli_yontemi = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap,
            kurum=self.kurum,
            ad='Vakıfbank Havale',
            tip=OdemeYontemiTipi.HAVALE_EFT,
            komisyon_orani=Decimal('0'),
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-MLH-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=45000,
            net_tutar=45000,
            durum=SozlesmeDurum.AKTIF,
            mali_hesap=self.mali_hesap,
        )
        self.taksit = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate(),
            tutar=45000,
            odenen_tutar=0,
            kalan_tutar=45000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        self.service = TahsilatService()
        self.today = timezone.localdate()

    def test_tahsilat_without_mali_hesap_rejected(self):
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-MLH-003',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=1000,
            net_tutar=1000,
            durum=SozlesmeDurum.AKTIF,
        )
        taksit = Taksit.objects.create(
            sozlesme=sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate(),
            tutar=1000,
            odenen_tutar=0,
            kalan_tutar=1000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        tahsilat, err = self.service.create({
            'sozlesme_id': sozlesme.id,
            'taksit_id': taksit.id,
            'odeme_yontemi_id': self.plan_yontemi.id,
            'tutar': 1000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(tahsilat)
        self.assertIn('mali_hesap_id', err)

    def test_tahsilat_with_explicit_mali_hesap_creates_bakiye_hareketi(self):
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.plan_yontemi.id,
            'mali_hesap_id': self.mali_hesap.id,
            'tutar': 45000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)
        self.assertEqual(tahsilat.mali_hesap_id, self.mali_hesap.id)
        self.assertIsNotNone(tahsilat.bakiye_hareketi_id)

        bakiye = BakiyeHareketiRepository.son_bakiye(self.mali_hesap.id)
        self.assertEqual(bakiye, 45000)
        self.assertTrue(
            BakiyeHareketi.objects.filter(
                mali_hesap_id=self.mali_hesap.id,
                kaynak_id=tahsilat.id,
            ).exists()
        )

    def test_tahsilat_falls_back_to_sozlesme_mali_hesap(self):
        tahsilat, err = self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': self.taksit.id,
            'odeme_yontemi_id': self.plan_yontemi.id,
            'tutar': 10000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)
        self.assertEqual(tahsilat.mali_hesap_id, self.mali_hesap.id)
        self.assertIsNotNone(tahsilat.bakiye_hareketi_id)

    def test_tahsilat_uses_odeme_yontemi_mali_hesap(self):
        sozlesme2 = Sozlesme.objects.create(
            sozlesme_no='SZ-MLH-002',
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
        taksit2 = Taksit.objects.create(
            sozlesme=sozlesme2,
            taksit_no=1,
            vade_tarihi=timezone.localdate(),
            tutar=5000,
            odenen_tutar=0,
            kalan_tutar=5000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        tahsilat, err = self.service.create({
            'sozlesme_id': sozlesme2.id,
            'taksit_id': taksit2.id,
            'odeme_yontemi_id': self.bagli_yontemi.id,
            'tutar': 5000,
            'tahsilat_tarihi': self.today.isoformat(),
        })
        self.assertIsNone(err)
        self.assertEqual(tahsilat.mali_hesap_id, self.mali_hesap.id)
        self.assertIsNotNone(tahsilat.bakiye_hareketi_id)
