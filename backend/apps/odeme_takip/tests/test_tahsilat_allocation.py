"""
Tahsilat dağıtım testleri — kısmi/geçmiş taksit önceliği.
"""
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
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Sozlesme, Taksit, TahsilatDagitim
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class TahsilatAllocationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Tahsilat Kurum', kod='TAH')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TAH')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
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
            sozlesme_no='SZ-TAH-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=15000,
            net_tutar=15000,
            durum=SozlesmeDurum.AKTIF,
        )
        self.service = TahsilatService()
        self.today = timezone.localdate()

    def _create_taksit(self, taksit_no, tutar, *, vade_offset_days=0, odenen=0):
        kalan = tutar - odenen
        if odenen <= 0:
            durum = TaksitDurum.BEKLEMEDE
        elif kalan <= 0:
            durum = TaksitDurum.ODENDI
        else:
            durum = TaksitDurum.KISMI_ODENDI
        return Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=taksit_no,
            vade_tarihi=self.today + timedelta(days=vade_offset_days),
            tutar=tutar,
            odenen_tutar=odenen,
            kalan_tutar=kalan,
            durum=durum,
        )

    def _collect(self, tutar, *, taksit_id=None):
        return self.service.create({
            'sozlesme_id': self.sozlesme.id,
            'taksit_id': taksit_id,
            'odeme_yontemi_id': self.odeme_yontemi.id,
            'tutar': tutar,
            'tahsilat_tarihi': self.today.isoformat(),
        })

    def test_partial_earlier_taksit_filled_before_selected_later(self):
        """Kısmi ödenmiş eski taksit, UI'da seçilen sonraki taksitten önce kapatılır."""
        taksit1 = self._create_taksit(1, 5000, vade_offset_days=-10)
        taksit2 = self._create_taksit(2, 5000, vade_offset_days=30)

        tahsilat1, err1 = self._collect(2000, taksit_id=taksit1.id)
        self.assertIsNone(err1)
        taksit1.refresh_from_db()
        self.assertEqual(taksit1.durum, TaksitDurum.KISMI_ODENDI)
        self.assertEqual(taksit1.kalan_tutar, 3000)

        tahsilat2, err2 = self._collect(5000, taksit_id=taksit2.id)
        self.assertIsNone(err2)

        taksit1.refresh_from_db()
        taksit2.refresh_from_db()
        self.assertEqual(taksit1.durum, TaksitDurum.ODENDI)
        self.assertEqual(taksit1.kalan_tutar, 0)
        self.assertEqual(taksit2.durum, TaksitDurum.KISMI_ODENDI)
        self.assertEqual(taksit2.odenen_tutar, 2000)
        self.assertEqual(taksit2.kalan_tutar, 3000)

        dagitimlar = TahsilatDagitim.objects.filter(tahsilat=tahsilat2).order_by('taksit__taksit_no')
        self.assertEqual(dagitimlar.count(), 2)
        self.assertEqual(dagitimlar[0].taksit_id, taksit1.id)
        self.assertEqual(dagitimlar[0].tutar, 3000)
        self.assertEqual(dagitimlar[1].taksit_id, taksit2.id)
        self.assertEqual(dagitimlar[1].tutar, 2000)

    def test_overdue_taksit_before_future_selected(self):
        """Vadesi geçmiş taksit, gelecek vadeli seçili taksitten önce ödenir."""
        overdue = self._create_taksit(1, 4000, vade_offset_days=-5)
        future = self._create_taksit(2, 4000, vade_offset_days=20)

        tahsilat, errors = self._collect(4000, taksit_id=future.id)
        self.assertIsNone(errors)

        overdue.refresh_from_db()
        future.refresh_from_db()
        self.assertEqual(overdue.durum, TaksitDurum.ODENDI)
        self.assertEqual(future.durum, TaksitDurum.BEKLEMEDE)
        self.assertEqual(future.kalan_tutar, 4000)

        dag = TahsilatDagitim.objects.get(tahsilat=tahsilat)
        self.assertEqual(dag.taksit_id, overdue.id)

    def test_waterfall_without_taksit_id(self):
        """Taksit seçilmeden ödeme de aynı öncelik sırasını izler."""
        t1 = self._create_taksit(1, 3000, vade_offset_days=-3)
        t2 = self._create_taksit(2, 3000, vade_offset_days=10)

        tahsilat, errors = self._collect(4500)
        self.assertIsNone(errors)

        t1.refresh_from_db()
        t2.refresh_from_db()
        self.assertEqual(t1.durum, TaksitDurum.ODENDI)
        self.assertEqual(t2.durum, TaksitDurum.KISMI_ODENDI)
        self.assertEqual(t2.odenen_tutar, 1500)

        dagitimlar = list(TahsilatDagitim.objects.filter(tahsilat=tahsilat).order_by('taksit__taksit_no'))
        self.assertEqual([d.tutar for d in dagitimlar], [3000, 1500])

    def test_overpayment_becomes_emanet(self):
        """Tüm taksitler kapandıktan sonra kalan tutar emanet olur."""
        self._create_taksit(1, 2000, vade_offset_days=-1)

        tahsilat, errors = self._collect(3500)
        self.assertIsNone(errors)
        tahsilat.refresh_from_db()
        self.assertEqual(tahsilat.tahsilat_turu, TahsilatTuru.EMANET)
