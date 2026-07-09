"""
Hesap Transferi (virman) servisi testleri — özellikle transfer İPTALİ.

İptal, iki hesaba da ters BakiyeHareketi yazar (kaynak GİRİŞ, hedef ÇIKIŞ),
atomiktir ve çift-iptale karşı korumalıdır.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.hesap_transferi_service import HesapTransferiService
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.finans.domain.financial_account import MaliHesap
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class HesapTransferiIptalTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Transfer Test', kod='TRF01')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='trf', password='test')
        self.kasa = MaliHesap.objects.create(sube=self.sube, ad='Kasa', tip=MaliHesapTipi.KASA)
        self.banka = MaliHesap.objects.create(
            sube=self.sube, ad='Ziraat', tip=MaliHesapTipi.BANKA, banka='ziraat',
        )
        self.repo = BakiyeHareketiRepository()
        self.service = HesapTransferiService()

    def _transfer(self, tutar=1000):
        return self.service.transfer_yap({
            'kaynak_hesap_id': self.kasa.id,
            'hedef_hesap_id': self.banka.id,
            'tutar': tutar,
            'transfer_tarihi': timezone.localdate(),
            'egitim_yili_id': self.ey.id,
            'aciklama': 'Test transfer',
        }, user=self.user, kurum_id=self.kurum.id, sube_id=self.sube.id)

    def test_transfer_moves_balance_between_accounts(self):
        transfer, err = self._transfer(1000)
        self.assertIsNone(err)
        self.assertIsNotNone(transfer)
        self.assertEqual(self.repo.son_bakiye(self.kasa.id), -1000)
        self.assertEqual(self.repo.son_bakiye(self.banka.id), 1000)

    def test_iptal_reverses_both_accounts_to_zero(self):
        transfer, err = self._transfer(1000)
        self.assertIsNone(err)

        iptal, err = self.service.iptal(
            transfer.id, neden='Yanlış işlem', user=self.user,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        self.assertIsNone(err)
        self.assertTrue(iptal.iptal_edildi)
        # İptal sonrası her iki hesap da başlangıç durumuna döner
        self.assertEqual(self.repo.son_bakiye(self.kasa.id), 0)
        self.assertEqual(self.repo.son_bakiye(self.banka.id), 0)

    def test_double_iptal_does_not_debit_twice(self):
        transfer, _ = self._transfer(1000)
        self.service.iptal(
            transfer.id, neden='ilk iptal', user=self.user,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        # İkinci iptal denemesi hata döner ve bakiyeyi bir daha oynatmaz
        _, err = self.service.iptal(
            transfer.id, neden='ikinci iptal', user=self.user,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        self.assertIsNotNone(err)
        self.assertEqual(self.repo.son_bakiye(self.kasa.id), 0)
        self.assertEqual(self.repo.son_bakiye(self.banka.id), 0)

    def test_iptal_cross_tenant_blocked(self):
        transfer, _ = self._transfer(500)
        baska_kurum = Kurum.objects.create(ad='Baska', kod='BSK01')
        _, err = self.service.iptal(
            transfer.id, neden='deneme', user=self.user,
            kurum_id=baska_kurum.id, sube_id=None,
        )
        self.assertIsNotNone(err)
        # Bakiye değişmemeli
        self.assertEqual(self.repo.son_bakiye(self.kasa.id), -500)
        self.assertEqual(self.repo.son_bakiye(self.banka.id), 500)
