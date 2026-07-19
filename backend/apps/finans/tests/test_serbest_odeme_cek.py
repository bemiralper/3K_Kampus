"""
Serbest ödeme + çek/senet entegrasyonu testleri.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum, CekSenetYon
from apps.sube.domain.models import Sube

User = get_user_model()


@override_settings(CEK_SENET_V2_ENABLED=True)
class SerbestOdemeCekTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='SO Cek Kurum', kod='SOCEK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SOCEK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='socek', password='test')
        self.mali_hesap = MaliHesap.objects.create(sube=self.sube, ad='Banka')
        self.nakit = OdemeYontemi.objects.create(
            mali_hesap=self.mali_hesap, kurum=self.kurum, ad='Nakit', tip=OdemeYontemiTipi.NAKIT,
        )
        self.cek_yontemi = OdemeYontemi.objects.create(
            kurum=self.kurum, ad='Çek', tip=OdemeYontemiTipi.CEK, mali_hesap=None,
        )
        self.cari = CariHesap.objects.create(
            kurum=self.kurum, sube=self.sube, unvan='Tedarikçi SO', hesap_turu='tedarikci',
        )
        self.svc = CariOdemeService()
        self.vade = timezone.localdate() + timedelta(days=45)

    def _cek_payload(self, **extra):
        data = {
            'cari_hesap_id': self.cari.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'tutar': Decimal('1500'),
            'odeme_tarihi': timezone.localdate(),
            'odeme_yontemi_id': self.cek_yontemi.id,
            'vade_tarihi': self.vade,
            'cek_senet_no': 'CHK-SO-001',
            'banka_adi': 'Test Bankası',
            'aciklama': 'Serbest çek ödemesi',
            'islem_yapan': self.user,
            'egitim_yili_id': self.ey.id,
        }
        data.update(extra)
        return data

    def test_cek_serbest_odeme_creates_portfoy_without_kasa(self):
        onceki_bakiye = self.cari.bakiye
        result, err = self.svc.serbest_odeme_yap(self._cek_payload())
        self.assertIsNone(err, err)
        self.assertIsNotNone(result.get('cek_senet_id'))
        self.assertIsNone(result.get('bakiye_hareketi_id'))

        detay = CekSenetDetay.objects.get(pk=result['cek_senet_id'])
        self.assertEqual(detay.yon, CekSenetYon.VERILEN)
        self.assertEqual(detay.durum, CekSenetDurum.BEKLIYOR)
        self.assertEqual(detay.cari_hesap_id, self.cari.id)
        self.assertEqual(detay.tutar, 1500)
        self.assertEqual(detay.cek_senet_no, 'CHK-SO-001')
        self.assertEqual(detay.cari_hareket_id, result['cari_hareket_id'])

        self.assertFalse(
            BakiyeHareketi.objects.filter(mali_hesap=self.mali_hesap).exists(),
            'Çek serbest ödemede anında kasa çıkışı olmamalı',
        )

        self.cari.refresh_from_db()
        # BORÇ yönü cari bakiyeyi artırır (tedarikçiye ödeme / avans)
        self.assertNotEqual(self.cari.bakiye, onceki_bakiye)

        hareket = CariHareket.objects.get(pk=result['cari_hareket_id'])
        self.assertEqual(hareket.kaynak_tip, 'SerbestOdeme')
        self.assertEqual(hareket.kaynak_id, detay.pk)

    def test_cek_requires_vade(self):
        payload = self._cek_payload()
        payload.pop('vade_tarihi')
        result, err = self.svc.serbest_odeme_yap(payload)
        self.assertIsNone(result)
        self.assertIn('vade_tarihi', err)

    def test_cek_odendi_creates_kasa_cikis(self):
        result, err = self.svc.serbest_odeme_yap(
            self._cek_payload(mali_hesap_id=self.mali_hesap.id),
        )
        self.assertIsNone(err, err)
        cek_id = result['cek_senet_id']

        cek_svc = CekSenetService()
        cek_svc.transition(cek_id, CekSenetDurum.HAZIRLANDI, {})
        cek_svc.transition(cek_id, CekSenetDurum.VERILDI, {})

        ode_result, ode_err = cek_svc.ode(
            cek_id,
            odeme_mali_hesap_id=self.mali_hesap.id,
            odeme_tarihi=timezone.localdate(),
            user=self.user,
        )
        self.assertIsNone(ode_err, ode_err)
        self.assertEqual(ode_result['durum'], CekSenetDurum.ODENDI)

        self.assertTrue(
            BakiyeHareketi.objects.filter(
                mali_hesap=self.mali_hesap,
                kaynak_id=cek_id,
            ).exists(),
        )
        # Çift cari hareket olmamalı (yalnızca serbest ödeme anındaki)
        self.assertEqual(
            CariHareket.objects.filter(
                cari_hesap=self.cari, kaynak_tip='SerbestOdeme',
            ).count(),
            1,
        )

    def test_cek_serbest_odeme_iptal(self):
        result, err = self.svc.serbest_odeme_yap(self._cek_payload())
        self.assertIsNone(err, err)
        cari_hareket_id = result['cari_hareket_id']
        cek_id = result['cek_senet_id']

        iptal, iptal_err = self.svc.serbest_odeme_iptal(cari_hareket_id)
        self.assertIsNone(iptal_err, iptal_err)

        detay = CekSenetDetay.objects.get(pk=cek_id)
        self.assertEqual(detay.durum, CekSenetDurum.IPTAL)
        self.assertTrue(
            CariHareket.objects.filter(
                kaynak_tip='SerbestOdemeIptal', kaynak_id=cari_hareket_id,
            ).exists(),
        )
        self.assertFalse(
            BakiyeHareketi.objects.filter(mali_hesap=self.mali_hesap).exists(),
        )

    def test_nakit_serbest_odeme_still_creates_kasa(self):
        result, err = self.svc.serbest_odeme_yap({
            'cari_hesap_id': self.cari.id,
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'tutar': Decimal('500'),
            'odeme_tarihi': timezone.localdate(),
            'mali_hesap_id': self.mali_hesap.id,
            'odeme_yontemi_id': self.nakit.id,
            'islem_yapan': self.user,
            'egitim_yili_id': self.ey.id,
        })
        self.assertIsNone(err, err)
        self.assertIsNotNone(result.get('bakiye_hareketi_id'))
        self.assertIsNone(result.get('cek_senet_id'))
        self.assertEqual(CekSenetDetay.objects.count(), 0)
        self.assertTrue(
            BakiyeHareketi.objects.filter(pk=result['bakiye_hareketi_id']).exists(),
        )
