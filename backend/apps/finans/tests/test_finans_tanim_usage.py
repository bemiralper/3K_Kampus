"""
Finans tanım silme koruması testleri.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.application.financial_account_service import MaliHesapService
from apps.finans.application.payment_method_service import OdemeYontemiService
from apps.finans.application.finans_tanim_usage import (
    get_mali_hesap_delete_block_message,
    get_odeme_yontemi_delete_block_message,
)
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.payment_types import OdemeYontemiTipi


class FinansTanimDeleteProtectionTest(TestCase):
    """Mali hesap ve ödeme yöntemi silme koruması."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Silme Test Kurum', kod='SDK001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.mali_service = MaliHesapService()
        self.odeme_service = OdemeYontemiService()

    def test_mali_hesap_delete_blocked_by_odeme_yontemi(self):
        mali, _ = self.mali_service.create(self.sube.id, {
            'ad': 'Kullanılan Kasa',
            'tip': MaliHesapTipi.KASA,
        })
        self.odeme_service.create(self.kurum.id, {
            'ad': 'Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
            'mali_hesap_id': mali.id,
        })

        message = get_mali_hesap_delete_block_message(mali.id)
        self.assertIsNotNone(message)
        self.assertIn('bu hesaba tanımlı ödeme yöntemi', message)

        deleted, errors = self.mali_service.soft_delete(mali.id)
        self.assertIsNone(deleted)
        self.assertIn('detail', errors)
        self.assertIn('silinemez', errors['detail'])

    def test_odeme_yontemi_delete_blocked_by_gelir_kaydi(self):
        mali, _ = self.mali_service.create(self.sube.id, {
            'ad': 'Havale Hesabı',
            'tip': MaliHesapTipi.BANKA,
            'banka': 'ziraat',
            'iban': 'TR' + '0' * 24,
        })
        odeme, _ = self.odeme_service.create(self.kurum.id, {
            'ad': 'Havale',
            'tip': OdemeYontemiTipi.HAVALE_EFT,
            'mali_hesap_id': mali.id,
        })
        cari = CariHesap.objects.create(kurum=self.kurum, sube=self.sube, unvan='Test Müşteri')
        GelirKaydi.tum_kayitlar.create(
            kurum=self.kurum,
            sube=self.sube,
            cari_hesap=cari,
            odeme_yontemi_id=odeme.id,
            fatura_tarihi=date.today(),
            vade_tarihi=date.today(),
            brut_tutar=Decimal('100.00'),
            net_tutar=Decimal('100.00'),
        )

        message = get_odeme_yontemi_delete_block_message(odeme.id)
        self.assertIsNotNone(message)
        self.assertIn('gelir kaydı', message)

        deleted, errors = self.odeme_service.soft_delete(odeme.id)
        self.assertIsNone(deleted)
        self.assertIn('detail', errors)
        self.assertIn('silinemez', errors['detail'])

    def test_mali_hesap_delete_allowed_when_unused(self):
        mali, _ = self.mali_service.create(self.sube.id, {
            'ad': 'Boş Kasa',
            'tip': MaliHesapTipi.KASA,
        })

        self.assertIsNone(get_mali_hesap_delete_block_message(mali.id))

        deleted, errors = self.mali_service.soft_delete(mali.id)
        self.assertIsNotNone(deleted)
        self.assertIsNone(errors)
        self.assertTrue(deleted.silindi_mi)

    def test_odeme_yontemi_delete_allowed_when_unused(self):
        mali, _ = self.mali_service.create(self.sube.id, {
            'ad': 'Kullanılmayan Kasa',
            'tip': MaliHesapTipi.KASA,
        })
        odeme, _ = self.odeme_service.create(self.kurum.id, {
            'ad': 'Kullanılmayan Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
            'mali_hesap_id': mali.id,
        })

        self.assertIsNone(get_odeme_yontemi_delete_block_message(odeme.id))

        deleted, errors = self.odeme_service.soft_delete(odeme.id)
        self.assertIsNotNone(deleted)
        self.assertIsNone(errors)
        self.assertTrue(deleted.silindi_mi)
