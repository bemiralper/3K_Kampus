"""
Ödeme Yöntemi Unit Tests
Service + Repository + Selector katmanlarını test eder.

Not: Her ödeme yöntemi artık bir Mali Hesaba (mali_hesap_id) bağlıdır;
uniqueness kontrolü kurum bazlı değil, mali hesap bazlıdır.
"""
from decimal import Decimal
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.application.payment_method_service import OdemeYontemiService
from apps.finans.application.selectors.payment_method_selector import OdemeYontemiSelector
from apps.finans.infrastructure.payment_method_repository import OdemeYontemiRepository
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.constants.account_types import MaliHesapTipi


class OdemeYontemiServiceTest(TestCase):
    """OdemeYontemiService iş mantığı testleri."""

    def setUp(self):
        self.kurum = Kurum.objects.create(
            ad='Test Kurum',
            kod='TEST001',
        )
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TST')
        self.mali_hesap = MaliHesap.objects.create(
            sube=self.sube, ad='Merkez Kasa', tip=MaliHesapTipi.KASA,
        )
        self.mali_hesap2 = MaliHesap.objects.create(
            sube=self.sube, ad='Ziraat Hesabı', tip=MaliHesapTipi.BANKA,
            iban='TR' + '0' * 24,
        )
        self.service = OdemeYontemiService()
        self.selector = OdemeYontemiSelector()

    # ─── CREATE TESTS ────────────────────────────

    def test_create_success(self):
        """Başarılı oluşturma."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Nakit Ödeme',
            'tip': OdemeYontemiTipi.NAKIT,
            'komisyon_orani': Decimal('0.00'),
            'valor_gun': 0,
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.ad, 'Nakit Ödeme')
        self.assertEqual(instance.tip, OdemeYontemiTipi.NAKIT)
        self.assertEqual(instance.kurum_id, self.kurum.id)
        self.assertEqual(instance.mali_hesap_id, self.mali_hesap.id)

    def test_create_with_all_fields(self):
        """Tüm alanlarla oluşturma."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap2.id,
            'ad': 'Ziraat POS',
            'tip': OdemeYontemiTipi.POS,
            'komisyon_orani': Decimal('1.50'),
            'valor_gun': 2,
            'siralama': 5,
            'aktif_mi': True,
            'aciklama': 'Ziraat Bankası POS cihazı',
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.komisyon_orani, Decimal('1.50'))
        self.assertEqual(instance.valor_gun, 2)
        self.assertEqual(instance.siralama, 5)

    def test_create_null_komisyon_and_valor(self):
        """Frontend boş alanları null gönderdiğinde 0 olarak kaydedilmeli."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Havale',
            'tip': OdemeYontemiTipi.HAVALE_EFT,
            'komisyon_orani': None,
            'valor_gun': None,
            'aktif_mi': True,
            'aciklama': None,
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.komisyon_orani, Decimal('0'))
        self.assertEqual(instance.valor_gun, 0)

    def test_create_empty_ad(self):
        """Boş ad ile oluşturma başarısız olmalı."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': '',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        self.assertIsNone(instance)
        self.assertIn('ad', errors)

    def test_create_missing_mali_hesap(self):
        """Mali hesap belirtilmeden oluşturma başarısız olmalı."""
        instance, errors = self.service.create(self.kurum.id, {
            'ad': 'Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        self.assertIsNone(instance)
        self.assertIn('mali_hesap_id', errors)

    def test_create_duplicate_ad_same_mali_hesap(self):
        """Aynı mali hesap + ad ile ikinci kayıt başarısız olmalı."""
        self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        self.assertIsNone(instance)
        self.assertIn('ad', errors)

    def test_create_same_ad_different_mali_hesap_allowed(self):
        """Farklı mali hesaplarda aynı isim kullanılabilmeli."""
        first, errors1 = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Kredi Kartı',
            'tip': OdemeYontemiTipi.POS,
        })
        second, errors2 = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap2.id,
            'ad': 'Kredi Kartı',
            'tip': OdemeYontemiTipi.POS,
        })
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertIsNone(errors1)
        self.assertIsNone(errors2)

    def test_create_invalid_tip(self):
        """Geçersiz tip ile oluşturma başarısız olmalı."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Test',
            'tip': 'invalid_tip',
        })
        self.assertIsNone(instance)
        self.assertIn('tip', errors)

    def test_create_negative_komisyon(self):
        """Negatif komisyon oranı reddedilmeli."""
        instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Test',
            'tip': OdemeYontemiTipi.NAKIT,
            'komisyon_orani': -5,
        })
        self.assertIsNone(instance)
        self.assertIn('komisyon_orani', errors)

    # ─── UPDATE TESTS ────────────────────────────

    def test_update_success(self):
        """Başarılı güncelleme."""
        instance, _ = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Nakit',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        updated, errors = self.service.update(instance.id, {
            'ad': 'Nakit (Güncellendi)',
            'komisyon_orani': Decimal('0.50'),
        })
        self.assertIsNotNone(updated)
        self.assertIsNone(errors)
        self.assertEqual(updated.ad, 'Nakit (Güncellendi)')

    def test_update_not_found(self):
        """Olmayan kayıt güncellenememeli."""
        instance, errors = self.service.update(99999, {'ad': 'Test'})
        self.assertIsNone(instance)
        self.assertIn('detail', errors)

    # ─── SOFT DELETE TESTS ───────────────────────

    def test_soft_delete(self):
        """Soft delete sonrası kayıt default queryset'te görünmemeli."""
        instance, _ = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Silinecek',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        deleted, errors = self.service.soft_delete(instance.id)
        self.assertIsNotNone(deleted)
        self.assertTrue(deleted.silindi_mi)
        self.assertFalse(deleted.aktif_mi)

        # Default manager ile görünmemeli
        self.assertIsNone(self.selector.get_by_id(instance.id))

        # All objects ile görünmeli
        repo = OdemeYontemiRepository()
        self.assertIsNotNone(repo.get_by_id_with_deleted(instance.id))

    def test_soft_delete_allows_same_name(self):
        """Soft delete sonrası aynı adla yeni kayıt oluşturulabilmeli."""
        instance, _ = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Tekrar Kullan',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        self.service.soft_delete(instance.id)

        # Aynı ad ile yeni kayıt
        new_instance, errors = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Tekrar Kullan',
            'tip': OdemeYontemiTipi.POS,
        })
        self.assertIsNotNone(new_instance)
        self.assertIsNone(errors)

    # ─── ACTIVATE / DEACTIVATE TESTS ─────────────

    def test_activate_deactivate(self):
        """Aktif/pasif toggle testi."""
        instance, _ = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Toggle Test',
            'tip': OdemeYontemiTipi.NAKIT,
        })
        self.assertTrue(instance.aktif_mi)

        deactivated, _ = self.service.deactivate(instance.id)
        self.assertFalse(deactivated.aktif_mi)

        activated, _ = self.service.activate(instance.id)
        self.assertTrue(activated.aktif_mi)


class OdemeYontemiSelectorTest(TestCase):
    """OdemeYontemiSelector sorgu testleri."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Selector Kurum', kod='SEL001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SEL')
        self.mali_hesap = MaliHesap.objects.create(
            sube=self.sube, ad='Merkez Kasa', tip=MaliHesapTipi.KASA,
        )
        self.service = OdemeYontemiService()
        self.selector = OdemeYontemiSelector()

        # Test verileri
        self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Nakit', 'tip': OdemeYontemiTipi.NAKIT, 'siralama': 1,
        })
        self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'POS', 'tip': OdemeYontemiTipi.POS, 'siralama': 2,
        })
        instance, _ = self.service.create(self.kurum.id, {
            'mali_hesap_id': self.mali_hesap.id,
            'ad': 'Pasif Yöntem', 'tip': OdemeYontemiTipi.NAKIT,
            'aktif_mi': False, 'siralama': 3,
        })

    def test_get_all_by_kurum(self):
        """Tüm kayıtları getirir (pasif dahil, silinmiş hariç)."""
        result = self.selector.get_all_by_kurum(self.kurum.id)
        self.assertEqual(result.count(), 3)

    def test_get_active_by_kurum(self):
        """Sadece aktif kayıtları getirir."""
        result = self.selector.get_active_by_kurum(self.kurum.id)
        self.assertEqual(result.count(), 2)

    def test_get_by_tip(self):
        """Tipe göre filtreler."""
        result = self.selector.get_by_tip(self.kurum.id, OdemeYontemiTipi.POS)
        self.assertEqual(result.count(), 1)
        self.assertEqual(result.first().ad, 'POS')

    def test_get_by_mali_hesap(self):
        """Mali hesaba göre filtreler — cascade akışının temeli."""
        result = self.selector.get_by_mali_hesap(self.mali_hesap.id)
        self.assertEqual(result.count(), 2)  # sadece aktif olanlar

    def test_get_dropdown_list(self):
        """Dropdown listesi sadece aktif kayıtları döndürür."""
        result = list(self.selector.get_dropdown_list(self.kurum.id))
        self.assertEqual(len(result), 2)
        self.assertIn('id', result[0])
        self.assertIn('ad', result[0])
        self.assertIn('tip', result[0])
        self.assertIn('mali_hesap_id', result[0])

    def test_get_dropdown_list_filtered_by_mali_hesap(self):
        """mali_hesap_id verilince sadece o hesaba ait yöntemler döner."""
        diger_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer Şube', kod='SEL2')
        diger_hesap = MaliHesap.objects.create(sube=diger_sube, ad='Diğer Kasa', tip=MaliHesapTipi.KASA)
        self.service.create(self.kurum.id, {
            'mali_hesap_id': diger_hesap.id,
            'ad': 'Diğer Nakit', 'tip': OdemeYontemiTipi.NAKIT,
        })

        result = list(self.selector.get_dropdown_list(self.kurum.id, mali_hesap_id=self.mali_hesap.id))
        self.assertEqual(len(result), 2)
        for item in result:
            self.assertEqual(item['mali_hesap_id'], self.mali_hesap.id)


class OdemeYontemiConstantsTest(TestCase):
    """Sabit değer testleri."""

    def test_choices_valid(self):
        """CHOICES listesi geçerli olmalı."""
        values = OdemeYontemiTipi.get_values()
        self.assertIn('nakit', values)
        self.assertIn('pos', values)
        self.assertIn('havale_eft', values)
        self.assertIn('online', values)

    def test_get_label(self):
        """Label doğru dönmeli."""
        self.assertEqual(OdemeYontemiTipi.get_label('nakit'), 'Nakit')
        self.assertEqual(OdemeYontemiTipi.get_label('pos'), 'POS Cihazı')
