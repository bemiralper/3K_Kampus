from apps.finans.application.odeme_yontemi_plan_helpers import (
    canonical_tips_for_mali_hesap,
    dedupe_odeme_yontemleri_for_plan,
    ensure_kurum_plan_odeme_yontemleri,
    filter_odeme_yontemleri_for_mali_hesap,
)
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from django.test import TestCase


class OdemeYontemiPlanHelpersTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Plan Test', kod='PLAN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.mali_a = MaliHesap.objects.create(
            sube=self.sube, ad='Banka A', tip='banka', aktif_mi=True,
        )
        self.mali_b = MaliHesap.objects.create(
            sube=self.sube, ad='Banka B', tip='banka', aktif_mi=True,
        )
        self.kasa = MaliHesap.objects.create(
            sube=self.sube, ad='Nakit Kasa', tip='kasa', aktif_mi=True,
        )
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=self.mali_a, ad='Havele', tip=OdemeYontemiTipi.HAVALE_EFT,
        )
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=self.mali_b, ad='Havale', tip=OdemeYontemiTipi.HAVALE_EFT,
        )
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=self.mali_a, ad='Pos A', tip=OdemeYontemiTipi.POS,
        )
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=self.mali_b, ad='Pos B', tip=OdemeYontemiTipi.POS,
        )

    def test_dedupe_standard_tips_once(self):
        ensure_kurum_plan_odeme_yontemleri(self.kurum.id)
        qs = OdemeYontemi.objects.filter(kurum=self.kurum, aktif_mi=True, silindi_mi=False)
        items = dedupe_odeme_yontemleri_for_plan(qs)
        tips = [i['tip'] for i in items if i['tip'] in (OdemeYontemiTipi.HAVALE_EFT, OdemeYontemiTipi.POS)]
        self.assertEqual(tips.count(OdemeYontemiTipi.HAVALE_EFT), 1)
        self.assertEqual(tips.count(OdemeYontemiTipi.POS), 1)
        havale = next(i for i in items if i['tip'] == OdemeYontemiTipi.HAVALE_EFT)
        self.assertEqual(havale['ad'], 'Havale / EFT')
        self.assertIsNone(
            OdemeYontemi.objects.get(id=havale['id']).mali_hesap_id,
        )

    def test_ensure_creates_kurum_level_records(self):
        canonical = ensure_kurum_plan_odeme_yontemleri(self.kurum.id)
        self.assertIn(OdemeYontemiTipi.NAKIT, canonical)
        self.assertIn(OdemeYontemiTipi.HAVALE_EFT, canonical)
        oy = OdemeYontemi.objects.get(id=canonical[OdemeYontemiTipi.NAKIT])
        self.assertIsNone(oy.mali_hesap_id)

    def test_filter_excludes_kurum_plan_canonicals_for_kasa(self):
        """Kasa seçilince yalnızca hesaba bağlı yöntemler; kurum plan Nakit gelmez."""
        ensure_kurum_plan_odeme_yontemleri(self.kurum.id)
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=self.kasa, ad='Kasa Nakit', tip=OdemeYontemiTipi.NAKIT,
        )
        qs = OdemeYontemi.objects.filter(kurum=self.kurum, aktif_mi=True, silindi_mi=False)
        filtered = filter_odeme_yontemleri_for_mali_hesap(
            qs, self.kasa.id, kurum_id=self.kurum.id,
        )
        # Hesaba bağlı nakit var
        self.assertTrue(filtered.filter(mali_hesap_id=self.kasa.id, tip=OdemeYontemiTipi.NAKIT).exists())
        # Kurum plan nakit (mali_hesap=null) listede yok
        self.assertFalse(
            filtered.filter(mali_hesap__isnull=True, tip=OdemeYontemiTipi.NAKIT).exists()
        )

    def test_filter_excludes_kurum_plan_canonicals_for_banka(self):
        """Banka seçilince yalnızca o hesaba bağlı yöntemler; plan Havale/POS gelmez."""
        ensure_kurum_plan_odeme_yontemleri(self.kurum.id)
        qs = OdemeYontemi.objects.filter(kurum=self.kurum, aktif_mi=True, silindi_mi=False)
        filtered = filter_odeme_yontemleri_for_mali_hesap(
            qs, self.mali_a.id, kurum_id=self.kurum.id,
        )
        self.assertTrue(filtered.filter(mali_hesap_id=self.mali_a.id).exists())
        self.assertFalse(
            filtered.filter(mali_hesap__isnull=True, tip=OdemeYontemiTipi.HAVALE_EFT).exists()
        )
        self.assertFalse(
            filtered.filter(mali_hesap__isnull=True, tip=OdemeYontemiTipi.POS).exists()
        )
        # Başka bankaya bağlı yöntemler gelmez
        self.assertFalse(filtered.filter(mali_hesap_id=self.mali_b.id).exists())

    def test_filter_includes_kurum_cek_senet(self):
        ensure_kurum_plan_odeme_yontemleri(self.kurum.id)
        OdemeYontemi.objects.create(
            kurum=self.kurum, mali_hesap=None, ad='Müşteri Çeki', tip=OdemeYontemiTipi.CEK,
        )
        qs = OdemeYontemi.objects.filter(kurum=self.kurum, aktif_mi=True, silindi_mi=False)
        filtered = filter_odeme_yontemleri_for_mali_hesap(
            qs, self.mali_a.id, kurum_id=self.kurum.id,
        )
        self.assertTrue(
            filtered.filter(mali_hesap__isnull=True, tip=OdemeYontemiTipi.CEK).exists()
        )

    def test_canonical_tips_for_kasa_and_banka(self):
        self.assertEqual(
            canonical_tips_for_mali_hesap(self.kasa),
            (OdemeYontemiTipi.NAKIT,),
        )
        self.assertIn(
            OdemeYontemiTipi.HAVALE_EFT,
            canonical_tips_for_mali_hesap(self.mali_a),
        )
