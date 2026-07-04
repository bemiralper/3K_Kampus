"""
Mali Hesap Unit Tests
Service + Repository + Selector katmanlarını test eder.
"""
from decimal import Decimal
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.application.financial_account_service import MaliHesapService
from apps.finans.application.selectors.financial_account_selector import MaliHesapSelector
from apps.finans.infrastructure.financial_account_repository import MaliHesapRepository
from apps.finans.constants.account_types import MaliHesapTipi, BankaKodu


class MaliHesapServiceTest(TestCase):
    """MaliHesapService iş mantığı testleri."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='MH001')
        self.sube = Sube.objects.create(
            kurum=self.kurum,
            ad='Merkez Şube',
            kod='MRK',
        )
        self.service = MaliHesapService()
        self.selector = MaliHesapSelector()

    # ─── CREATE TESTS ────────────────────────────

    def test_create_kasa_success(self):
        """Kasa tipinde hesap oluşturma — IBAN gereksiz."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Ana Kasa',
            'tip': MaliHesapTipi.KASA,
            'baslangic_bakiye': Decimal('0.00'),
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.ad, 'Ana Kasa')
        self.assertEqual(instance.tip, MaliHesapTipi.KASA)

    def test_create_banka_with_iban(self):
        """Banka tipinde hesap — IBAN ve banka seçimi ile başarılı."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Vakıfbank Merkez',
            'tip': MaliHesapTipi.BANKA,
            'banka': 'vakifbank',
            'iban': 'TR123456789012345678901234',
            'baslangic_bakiye': Decimal('10000.00'),
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.iban, 'TR123456789012345678901234')
        self.assertEqual(instance.banka, 'vakifbank')
        self.assertEqual(instance.banka_adi, 'VakıfBank')

    def test_create_banka_without_banka_fails(self):
        """Banka tipinde hesap — banka seçimi olmadan başarısız."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Bankasız Hesap',
            'tip': MaliHesapTipi.BANKA,
            'iban': 'TR123456789012345678901234',
        })
        self.assertIsNone(instance)
        self.assertIn('banka', errors)

    def test_create_pos_with_banka(self):
        """POS hesabı — banka seçimi ile, IBAN olmadan başarılı."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Garanti POS',
            'tip': MaliHesapTipi.POS,
            'banka': 'garanti',
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.banka, 'garanti')
        self.assertEqual(instance.iban, '')

    def test_create_kasa_clears_banka(self):
        """Nakit kasa — banka alanı temizlenir."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Merkez Nakit Kasası',
            'tip': MaliHesapTipi.KASA,
            'banka': 'ziraat',
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.banka, '')
        self.assertEqual(instance.banka_adi, '')

    def test_create_banka_without_iban_ok(self):
        """Banka tipinde hesap — IBAN olmadan da oluşturulabilir."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'IBAN\'sız Banka',
            'tip': MaliHesapTipi.BANKA,
            'banka': 'ziraat',
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)
        self.assertEqual(instance.iban, '')

    def test_create_invalid_iban_format(self):
        """Geçersiz IBAN formatı reddedilmeli."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Kötü IBAN',
            'tip': MaliHesapTipi.BANKA,
            'iban': 'DE123456',  # TR ile başlamıyor
        })
        self.assertIsNone(instance)
        self.assertIn('iban', errors)

    def test_create_empty_ad(self):
        """Boş ad ile oluşturma başarısız olmalı."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': '',
            'tip': MaliHesapTipi.KASA,
        })
        self.assertIsNone(instance)
        self.assertIn('ad', errors)

    def test_create_duplicate_ad(self):
        """Aynı şube + ad ile ikinci kayıt başarısız olmalı."""
        self.service.create(self.sube.id, {
            'ad': 'Tekrar Eden',
            'tip': MaliHesapTipi.KASA,
        })
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Tekrar Eden',
            'tip': MaliHesapTipi.POS,
            'banka': 'garanti',
        })
        self.assertIsNone(instance)
        self.assertIn('ad', errors)

    def test_create_pos_without_iban(self):
        """POS tipi — IBAN zorunlu değil, banka seçimi zorunlu."""
        instance, errors = self.service.create(self.sube.id, {
            'ad': 'Garanti POS',
            'tip': MaliHesapTipi.POS,
            'banka': 'garanti',
        })
        self.assertIsNotNone(instance)
        self.assertIsNone(errors)

    # ─── UPDATE TESTS ────────────────────────────

    def test_update_success(self):
        """Başarılı güncelleme."""
        instance, _ = self.service.create(self.sube.id, {
            'ad': 'Eski Ad',
            'tip': MaliHesapTipi.KASA,
        })
        updated, errors = self.service.update(instance.id, {
            'ad': 'Yeni Ad',
            'baslangic_bakiye': Decimal('5000.00'),
        })
        self.assertIsNotNone(updated)
        self.assertIsNone(errors)
        self.assertEqual(updated.ad, 'Yeni Ad')

    def test_update_tip_to_banka_without_iban_ok(self):
        """Tip banka'ya değiştirilirken IBAN zorunlu değil."""
        instance, _ = self.service.create(self.sube.id, {
            'ad': 'Kasa → Banka',
            'tip': MaliHesapTipi.KASA,
        })
        updated, errors = self.service.update(instance.id, {
            'tip': MaliHesapTipi.BANKA,
            'banka': 'ziraat',
        })
        self.assertIsNotNone(updated)
        self.assertIsNone(errors)
        self.assertEqual(updated.tip, MaliHesapTipi.BANKA)
        self.assertEqual(updated.iban, '')

    def test_update_not_found(self):
        """Olmayan kayıt güncellenememeli."""
        instance, errors = self.service.update(99999, {'ad': 'Test'})
        self.assertIsNone(instance)
        self.assertIn('detail', errors)

    # ─── SOFT DELETE TESTS ───────────────────────

    def test_soft_delete(self):
        """Soft delete sonrası kayıt default queryset'te görünmemeli."""
        instance, _ = self.service.create(self.sube.id, {
            'ad': 'Silinecek Hesap',
            'tip': MaliHesapTipi.KASA,
        })
        deleted, errors = self.service.soft_delete(instance.id)
        self.assertIsNotNone(deleted)
        self.assertTrue(deleted.silindi_mi)
        self.assertFalse(deleted.aktif_mi)

        # Default manager ile görünmemeli
        self.assertIsNone(self.selector.get_by_id(instance.id))

        # All objects ile görünmeli
        repo = MaliHesapRepository()
        self.assertIsNotNone(repo.get_by_id_with_deleted(instance.id))

    def test_soft_delete_allows_same_name(self):
        """Soft delete sonrası aynı adla yeni kayıt oluşturulabilmeli."""
        instance, _ = self.service.create(self.sube.id, {
            'ad': 'Tekrar Kullan',
            'tip': MaliHesapTipi.KASA,
        })
        self.service.soft_delete(instance.id)

        new_instance, errors = self.service.create(self.sube.id, {
            'ad': 'Tekrar Kullan',
            'tip': MaliHesapTipi.POS,
            'banka': 'akbank',
        })
        self.assertIsNotNone(new_instance)
        self.assertIsNone(errors)

    # ─── ACTIVATE / DEACTIVATE TESTS ─────────────

    def test_activate_deactivate(self):
        """Aktif/pasif toggle testi."""
        instance, _ = self.service.create(self.sube.id, {
            'ad': 'Toggle Test',
            'tip': MaliHesapTipi.KASA,
        })
        self.assertTrue(instance.aktif_mi)

        deactivated, _ = self.service.deactivate(instance.id)
        self.assertFalse(deactivated.aktif_mi)

        activated, _ = self.service.activate(instance.id)
        self.assertTrue(activated.aktif_mi)


class MaliHesapSelectorTest(TestCase):
    """MaliHesapSelector sorgu testleri."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Selector Kurum', kod='SELM01')
        self.sube = Sube.objects.create(
            kurum=self.kurum,
            ad='Test Şube',
            kod='TST',
        )
        self.service = MaliHesapService()
        self.selector = MaliHesapSelector()

        self.service.create(self.sube.id, {
            'ad': 'Kasa', 'tip': MaliHesapTipi.KASA, 'siralama': 1,
        })
        self.service.create(self.sube.id, {
            'ad': 'Banka', 'tip': MaliHesapTipi.BANKA,
            'banka': 'ziraat',
            'iban': 'TR123456789012345678901234', 'siralama': 2,
        })
        self.service.create(self.sube.id, {
            'ad': 'Pasif Hesap', 'tip': MaliHesapTipi.KASA,
            'aktif_mi': False, 'siralama': 3,
        })

    def test_get_all_by_sube(self):
        """Tüm kayıtları getirir (pasif dahil, silinmiş hariç)."""
        result = self.selector.get_all_by_sube(self.sube.id)
        self.assertEqual(result.count(), 3)

    def test_get_active_by_sube(self):
        """Sadece aktif kayıtları getirir."""
        result = self.selector.get_active_by_sube(self.sube.id)
        self.assertEqual(result.count(), 2)

    def test_get_by_tip(self):
        """Tipe göre filtreler."""
        result = self.selector.get_by_tip(self.sube.id, MaliHesapTipi.BANKA)
        self.assertEqual(result.count(), 1)
        self.assertEqual(result.first().ad, 'Banka')

    def test_get_by_kurum(self):
        """Kurum bazında tüm şubelerdeki hesapları getirir."""
        result = self.selector.get_by_kurum(self.kurum.id)
        self.assertEqual(result.count(), 3)

    def test_get_dropdown_list(self):
        """Dropdown listesi sadece aktif kayıtları döndürür."""
        result = list(self.selector.get_dropdown_list(self.sube.id))
        self.assertEqual(len(result), 2)
        self.assertIn('id', result[0])
        self.assertIn('ad', result[0])
        self.assertIn('tip', result[0])


class MaliHesapConstantsTest(TestCase):
    """Sabit değer testleri."""

    def test_choices_valid(self):
        """CHOICES listesi geçerli olmalı."""
        values = MaliHesapTipi.get_values()
        self.assertIn('kasa', values)
        self.assertIn('banka', values)
        self.assertIn('pos', values)
        self.assertIn('sanal_pos', values)
        self.assertIn('e_cuzdan', values)
        self.assertIn('diger', values)

    def test_banka_zorunlu(self):
        self.assertTrue(MaliHesapTipi.banka_zorunlu_mu('banka'))
        self.assertTrue(MaliHesapTipi.banka_zorunlu_mu('pos'))
        self.assertFalse(MaliHesapTipi.banka_zorunlu_mu('kasa'))
        self.assertFalse(MaliHesapTipi.banka_zorunlu_mu('sanal_pos'))

    def test_banka_kodu_labels(self):
        self.assertEqual(BankaKodu.get_label('vakifbank'), 'VakıfBank')
        self.assertEqual(BankaKodu.resolve_from_label('Garanti BBVA'), 'garanti')

    def test_banka_detay_tipleri(self):
        self.assertTrue(MaliHesapTipi.banka_detay_mi('banka'))
        self.assertFalse(MaliHesapTipi.banka_detay_mi('kasa'))
        self.assertFalse(MaliHesapTipi.banka_detay_mi('pos'))
