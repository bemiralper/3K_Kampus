"""
Overdue domain ve TaksitService testleri (Faz 0).
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.taksit_service import TaksitService
from apps.odeme_takip.domain.enums import SozlesmeDurum, TaksitDurum
from apps.odeme_takip.domain.models import Sozlesme, Taksit
from apps.odeme_takip.domain.overdue import get_overdue_taksit_queryset, gecikme_gunu
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class OverdueLogicTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Overdue Kurum', kod='OVD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='OVD')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-OVD-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=10000,
            net_tutar=10000,
            durum=SozlesmeDurum.AKTIF,
        )

    def test_overdue_requires_kalan_tutar_gt_zero(self):
        """kalan_tutar=0 olan taksit gecikmiş sayılmaz."""
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=10),
            tutar=5000,
            odenen_tutar=5000,
            kalan_tutar=0,
            durum=TaksitDurum.ODENDI,
        )
        qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id)
        self.assertEqual(qs.count(), 0)

    def test_overdue_includes_unpaid_past_due(self):
        taksit = Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=5),
            tutar=3000,
            odenen_tutar=0,
            kalan_tutar=3000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().id, taksit.id)
        self.assertEqual(gecikme_gunu(taksit), 5)

    def test_taksit_service_delegates_to_repository(self):
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=3),
            tutar=2000,
            kalan_tutar=2000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        service = TaksitService()
        result = service.get_vadesi_gecenler(kurum_id=self.kurum.id)
        self.assertEqual(result.count(), 1)

    def test_overdue_scoped_by_sube(self):
        sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='OVD-B')
        ogrenci_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=sube_b,
            ad='Ayşe',
            soyad='Test',
            aktif_mi=True,
        )
        sozlesme_b = Sozlesme.objects.create(
            sozlesme_no='SZ-OVD-B-001',
            ogrenci=ogrenci_b,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=sube_b,
            baslangic_tarihi=timezone.localdate(),
            bitis_tarihi=timezone.localdate() + timedelta(days=365),
            brut_tutar=5000,
            net_tutar=5000,
            durum=SozlesmeDurum.AKTIF,
        )
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=2),
            tutar=1000,
            kalan_tutar=1000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        Taksit.objects.create(
            sozlesme=sozlesme_b,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=2),
            tutar=2000,
            kalan_tutar=2000,
            durum=TaksitDurum.BEKLEMEDE,
        )

        all_qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id)
        self.assertEqual(all_qs.count(), 2)

        sube_a_qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id, sube_id=self.sube.id)
        self.assertEqual(sube_a_qs.count(), 1)
        self.assertEqual(sube_a_qs.first().sozlesme.sube_id, self.sube.id)

        sube_b_qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id, sube_id=sube_b.id)
        self.assertEqual(sube_b_qs.count(), 1)
        self.assertEqual(sube_b_qs.first().sozlesme.sube_id, sube_b.id)

    def test_min_gecikme_gun_filter(self):
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=timezone.localdate() - timedelta(days=5),
            tutar=1000,
            kalan_tutar=1000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=2,
            vade_tarihi=timezone.localdate() - timedelta(days=40),
            tutar=1000,
            kalan_tutar=1000,
            durum=TaksitDurum.BEKLEMEDE,
        )
        qs = get_overdue_taksit_queryset(kurum_id=self.kurum.id, min_gecikme_gun=30)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().taksit_no, 2)
