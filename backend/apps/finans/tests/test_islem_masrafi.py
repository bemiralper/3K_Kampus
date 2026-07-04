"""
İşlem Masrafı testleri — otomatik gider + bakiye hareketi.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_kategorisi_service import GiderKategorisiService
from apps.finans.application.islem_masrafi_service import IslemMasrafiService
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.kesinti_types import KesintiTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.islem_masrafi import IslemMasrafi, IslemMasrafiKaynakTipi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class IslemMasrafiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Masraf Test', kod='MAS01')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='masraf', password='test')
        self.mali_hesap = MaliHesap.objects.create(
            sube=self.sube, ad='Ziraat TL', tip=MaliHesapTipi.BANKA, banka='ziraat',
        )
        self.odeme_yontemi = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap,
            kurum=self.kurum,
            ad='Havale',
            tip=OdemeYontemiTipi.HAVALE_EFT,
            komisyon_orani=Decimal('0'),
        )
        GiderKategorisiService().ensure_banka_giderleri(self.kurum.id, self.sube.id)
        self.cari = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Test Müşteri',
        )

    def _create_gelir(self, tutar='1000'):
        return GelirKaydi.tum_kayitlar.create(
            kurum=self.kurum,
            sube=self.sube,
            cari_hesap=self.cari,
            odeme_yontemi=self.odeme_yontemi,
            egitim_yili=self.ey,
            fatura_tarihi=timezone.localdate(),
            vade_tarihi=timezone.localdate(),
            brut_tutar=Decimal(tutar),
            kdv_orani=0,
            kdv_tutar=0,
            net_tutar=Decimal(tutar),
            durum='onaylandi',
        )

    def test_gelir_tahsilat_with_masraf_creates_gider(self):
        gelir = self._create_gelir('1000')
        svc = GelirTahsilatService()
        tahsilat, err = svc.tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('1000'),
            'tahsilat_tarihi': timezone.localdate(),
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'kesinti_turu': KesintiTuru.HAVALE_MASRAFI,
            'kesinti_tutar': Decimal('45'),
            'kesinti_aciklama': 'Banka kesintisi',
            'islem_yapan': self.user,
        })
        self.assertIsNone(err)
        self.assertIsNotNone(tahsilat)

        masraf = IslemMasrafiService.get_by_kaynak(
            IslemMasrafiKaynakTipi.GELIR_TAHSILAT, tahsilat.pk,
        )
        self.assertIsNotNone(masraf)
        self.assertEqual(masraf.kesinti_tutar, Decimal('45'))
        self.assertIsNotNone(masraf.gider_kaydi_id)
        self.assertIsNotNone(masraf.gider_odeme_id)

        hareketler = BakiyeHareketi.objects.filter(mali_hesap_id=self.mali_hesap.id)
        self.assertEqual(hareketler.count(), 2)
        giris = sum(h.tutar for h in hareketler if h.yon == 'giris')
        cikis = sum(h.tutar for h in hareketler if h.yon == 'cikis')
        self.assertEqual(giris, 1000)
        self.assertEqual(cikis, 45)

    def test_masraf_iptal_reverses_gider(self):
        gelir = self._create_gelir('500')
        svc = GelirTahsilatService()
        tahsilat, _ = svc.tahsilat_yap({
            'gelir_kaydi_id': gelir.id,
            'tutar': Decimal('500'),
            'tahsilat_tarihi': timezone.localdate(),
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'kesinti_turu': KesintiTuru.POS_KOMISYONU,
            'kesinti_tutar': Decimal('20'),
            'islem_yapan': self.user,
        })
        svc.tahsilat_iptal(tahsilat.id)

        masraf = IslemMasrafi.objects.filter(
            kaynak_tip=IslemMasrafiKaynakTipi.GELIR_TAHSILAT,
            kaynak_id=tahsilat.pk,
        ).first()
        self.assertEqual(masraf.durum, 'iptal')
        self.assertEqual(
            GiderOdeme.objects.filter(gider_kaydi_id=masraf.gider_kaydi_id, durum='iptal').count(),
            1,
        )
