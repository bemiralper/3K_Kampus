"""Sözleşmeye sonradan eklenen hizmet ve ders erişim kaydı açar."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.sozlesme_erisim_sync import sync_sozlesme_erisim
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciEkHizmet
from apps.sube.domain.models import Sube


class SozlesmeErisimSyncTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Erişim Kurum', kod='ERS')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ERS')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Aleyna', soyad='Topal', aktif_mi=True,
        )
        self.kutuphane = EkHizmet.objects.create(
            ad='Kütüphane', kod='KUT', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, brut_fiyat=500000,
        )
        self.kocluk = EkHizmet.objects.create(
            ad='Koçluk', kod='KOC', hizmet_turu='kocluk',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, brut_fiyat=400000,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZL-ERS-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=300),
            paket_turu='ek_hizmet',
            paket_adi='Ek Hizmetler',
            brut_tutar=900000,
            kdv_dahil_tutar=900000,
            net_tutar=900000,
            taksit_sayisi=1,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kocluk.id, kalem_adi='Koçluk',
            brut_tutar=400000, net_tutar=400000, kdv_dahil_tutar=400000,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kutuphane.id, kalem_adi='Kütüphane',
            brut_tutar=500000, net_tutar=500000, kdv_dahil_tutar=500000,
        )

    def test_aktif_sozlesme_eksik_ek_hizmeti_acar(self):
        result = sync_sozlesme_erisim(self.sozlesme)
        self.assertCountEqual(result['created_ek_hizmet'], ['Koçluk', 'Kütüphane'])
        self.assertEqual(
            OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, aktif_mi=True).count(),
            2,
        )
        again = sync_sozlesme_erisim(self.sozlesme)
        self.assertEqual(again['created_ek_hizmet'], [])
        self.assertEqual(
            OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, aktif_mi=True).count(),
            2,
        )

    def test_taslak_erisim_acmaz(self):
        self.sozlesme.durum = SozlesmeDurum.TASLAK
        self.sozlesme.save(update_fields=['durum'])
        result = sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(result['skipped'])
        self.assertFalse(OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci).exists())

    def test_taslak_aktif_olunca_erisim_acilir(self):
        self.sozlesme.durum = SozlesmeDurum.TASLAK
        self.sozlesme.save(update_fields=['durum'])
        SozlesmeService().change_status(self.sozlesme.id, SozlesmeDurum.AKTIF)
        ids = set(
            OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, aktif_mi=True)
            .values_list('ek_hizmet_id', flat=True)
        )
        self.assertEqual(ids, {self.kocluk.id, self.kutuphane.id})

    def test_sonradan_eklenen_grup_dersi_ve_dahil_hizmet(self):
        grup = GrupDersi.objects.create(
            ad='Sayısal Grup', kod='SAY', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        grup.dahil_ek_hizmetler.add(self.kutuphane)
        self.sozlesme.kalemler.all().delete()
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Sayısal Grup',
            brut_tutar=100000, net_tutar=100000, kdv_dahil_tutar=100000,
        )
        result = sync_sozlesme_erisim(self.sozlesme)
        self.assertIn('Sayısal Grup', result['created_paket'])
        self.assertIn('Kütüphane', result['created_ek_hizmet'])
        self.assertTrue(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci, paket_turu='grup_dersi', paket_id=grup.id, aktif_mi=True,
            ).exists()
        )
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True, dahil_mi=True,
            ).exists()
        )

    def test_grup_degisince_eski_paket_erisimi_kapanir(self):
        eski = GrupDersi.objects.create(
            ad='Eski Grup', kod='ESK', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci, paket_turu='grup_dersi', paket_id=eski.id,
            paket_adi='Eski Grup', aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
            egitim_yili=self.ey, fiyat=0,
        )
        yeni = GrupDersi.objects.create(
            ad='Yeni Grup', kod='YNI', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        yeni.dahil_ek_hizmetler.add(self.kutuphane)
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = yeni.id
        self.sozlesme.paket_adi = 'Yeni Grup'
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=yeni.id, kalem_adi='Yeni Grup',
            brut_tutar=100000, net_tutar=100000, kdv_dahil_tutar=100000,
        )
        sync_sozlesme_erisim(self.sozlesme)
        self.assertFalse(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci, paket_id=eski.id, aktif_mi=True,
            ).exists()
        )
        self.assertTrue(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci, paket_id=yeni.id, aktif_mi=True,
            ).exists()
        )
        self.assertFalse(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
            ).exists()
        )
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
            ).exists()
        )

    def test_sonradan_eklenen_deneme_paketi(self):
        deneme = Deneme.objects.create(
            ad='TYT Deneme', kod='TYT', kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, brut_fiyat=300000,
        )
        self.sozlesme.kalemler.all().delete()
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.DENEME,
            kalem_id=deneme.id, kalem_adi='TYT Deneme',
            brut_tutar=300000, net_tutar=300000, kdv_dahil_tutar=300000,
        )
        sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci, paket_turu='deneme', paket_id=deneme.id, aktif_mi=True,
            ).exists()
        )
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet__deneme_paketi=deneme, aktif_mi=True,
            ).exists()
        )
