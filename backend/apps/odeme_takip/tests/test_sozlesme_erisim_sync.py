"""Sözleşmeye sonradan eklenen hizmet ve ders erişim kaydı açar."""
import threading
import uuid
from datetime import timedelta

from django.db import connections
from django.test import TestCase, TransactionTestCase
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

    def test_grup_dahil_deneme_sonraki_senkronda_acik_kalir(self):
        """Grup dersine dahil deneme, sözleşme yeniden senkronlanınca pasife düşmez.

        Özel ders sonradan eklenince senkron çalışır. Deneme erişimi ek hizmet
        satırındadır; bu satır korunmazsa öğrenci denemesi pasif görünür.
        """
        deneme = Deneme.objects.create(
            ad='TYT - AYT Deneme Paketi', kod='DNM', kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, brut_fiyat=0,
        )
        grup = GrupDersi.objects.create(
            ad='Sayısal Grup', kod='SAY2', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        grup.dahil_denemeler.add(deneme)
        grup.dahil_ek_hizmetler.add(self.kocluk)
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = grup.id
        self.sozlesme.paket_adi = 'Sayısal Grup'
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Sayısal Grup',
            brut_tutar=240000, net_tutar=240000, kdv_dahil_tutar=240000,
        )

        sync_sozlesme_erisim(self.sozlesme)
        aktif = OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet__deneme_paketi=deneme, aktif_mi=True,
        )
        self.assertEqual(aktif.count(), 1)

        sync_sozlesme_erisim(self.sozlesme)
        self.assertEqual(aktif.count(), 1)
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
            ).exists()
        )

    def test_grup_kalkinca_dahil_deneme_kapanir(self):
        deneme = Deneme.objects.create(
            ad='TYT Deneme 2', kod='DNM2', kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, brut_fiyat=0,
        )
        grup = GrupDersi.objects.create(
            ad='Eski Sayısal', kod='ESK2', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        grup.dahil_denemeler.add(deneme)
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = grup.id
        self.sozlesme.paket_adi = 'Eski Sayısal'
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Eski Sayısal',
            brut_tutar=100000, net_tutar=100000, kdv_dahil_tutar=100000,
        )
        sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet__deneme_paketi=deneme, aktif_mi=True,
            ).exists()
        )

        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'ek_hizmet'
        self.sozlesme.paket_id = None
        self.sozlesme.paket_adi = 'Ek Hizmetler'
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kocluk.id, kalem_adi='Koçluk',
            brut_tutar=400000, net_tutar=400000, kdv_dahil_tutar=400000,
        )
        sync_sozlesme_erisim(self.sozlesme)
        self.assertFalse(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet__deneme_paketi=deneme, aktif_mi=True,
            ).exists()
        )
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
            ).exists()
        )

    def test_kataloga_sonradan_eklenen_deneme_acilmaz(self):
        """Grup tanımına sonra eklenen deneme eski sözleşmeye ve ekrana yazılmaz."""
        from apps.ogrenci_kayit.application.services import attach_grup_dersi_denemeler
        from apps.odeme_takip.application.services.sozlesme_erisim_sync import (
            displayed_deneme_ids_for_package,
        )

        grup = GrupDersi.objects.create(
            ad='Sayısal', kod='SAY3', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        grup.dahil_ek_hizmetler.add(self.kutuphane)
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = grup.id
        self.sozlesme.paket_adi = 'Sayısal'
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id', 'paket_adi'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Sayısal',
            brut_tutar=240000, net_tutar=240000, kdv_dahil_tutar=240000,
        )
        sync_sozlesme_erisim(self.sozlesme)

        deneme = Deneme.objects.create(
            ad='11. Sınıf Deneme', kod='D11', kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, brut_fiyat=0,
        )
        grup.dahil_denemeler.add(deneme)
        attach_grup_dersi_denemeler(
            self.ogrenci, grup, self.ey, self.sozlesme.baslangic_tarihi,
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.ey.id,
        )
        sync_sozlesme_erisim(self.sozlesme)

        self.assertFalse(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet__deneme_paketi=deneme, aktif_mi=True,
            ).exists()
        )
        shown = displayed_deneme_ids_for_package(
            self.ogrenci.id, self.ey.id, 'grup_dersi', grup.id, [deneme.id],
        )
        self.assertEqual(shown, [])

    def test_acik_deneme_sonraki_kayitta_kapanmaz(self):
        """Görüntü denemeyi kaçırdıysa, öğrencide açık satır sonraki kayıtta kapanmaz."""
        grup = GrupDersi.objects.create(
            ad='Sayısal 2', kod='SAY4', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = grup.id
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Sayısal 2',
            brut_tutar=100000, net_tutar=100000, kdv_dahil_tutar=100000,
        )
        sync_sozlesme_erisim(self.sozlesme)

        deneme = Deneme.objects.create(
            ad='Açık Deneme', kod='ACIK', kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, brut_fiyat=0,
        )
        ek = EkHizmet.objects.create(
            ad='Deneme — Açık Deneme', kod='DNM_ACIK', hizmet_turu='deneme',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
            deneme_paketi=deneme, brut_fiyat=0, aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=ek, aktif_mi=True, dahil_mi=True,
            egitim_yili=self.ey, fiyat=0,
            kaynak_paket_turu='grup_dersleri', kaynak_paket_id=grup.id,
            baslangic_tarihi=self.sozlesme.baslangic_tarihi,
        )
        sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(
            OgrenciEkHizmet.objects.filter(
                ogrenci=self.ogrenci, ek_hizmet=ek, aktif_mi=True,
            ).exists()
        )
        self.sozlesme.refresh_from_db()
        spec = (self.sozlesme.erisim_kapsam_anlik or {}).get(f'grup_dersi:{grup.id}') or {}
        self.assertIn(deneme.id, spec.get('deneme') or [])


class KalemCikarErisimKapatirTests(SozlesmeErisimSyncTests):
    """Sözleşmeden kalem çıkarılınca öğrencinin o hizmete erişimi de kapanır.

    Eskiden `kalem_cikar` erişim senkronunu çağırmıyordu; `OgrenciEkHizmet`
    aktif kalıyor, öğrenci listesi filtresi çıkarılmış hizmeti bulmaya devam ediyordu.
    """

    def test_kalem_cikar_erisimi_kapatir(self):
        sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        ).exists())
        kalem = SozlesmeKalemi.objects.get(sozlesme=self.sozlesme, kalem_id=self.kutuphane.id)
        result, error = SozlesmeService().kalem_cikar(kalem.id)
        self.assertIsNone(error, error)
        self.assertFalse(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        ).exists(), 'çıkarılan kalemin erişimi kapanmalı')
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
        ).exists(), 'kalan kalemin erişimi açık kalmalı')


class ErisimYilVeKaynakTests(SozlesmeErisimSyncTests):
    def _diger_yil_sozlesme(self, hizmet):
        diger = EgitimYili.objects.create(baslangic_yil=2024, bitis_yil=2025, aktif_mi=False)
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZL-ERS-2024',
            ogrenci=self.ogrenci,
            egitim_yili=diger,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=self.sozlesme.baslangic_tarihi,
            bitis_tarihi=self.sozlesme.bitis_tarihi,
            paket_turu='ek_hizmet',
            paket_adi='Eski',
            brut_tutar=500000,
            kdv_dahil_tutar=500000,
            net_tutar=500000,
            taksit_sayisi=1,
            durum=SozlesmeDurum.TAMAMLANDI,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=hizmet.id, kalem_adi=hizmet.ad,
            brut_tutar=500000, net_tutar=500000, kdv_dahil_tutar=500000,
        )
        return diger, sozlesme

    def test_baska_yilin_kutuphanesi_bu_yili_acmaz(self):
        from apps.ogrenci.services.hizmet_erisim import ogrenci_ids_with_hizmet_turu

        self.sozlesme.kalemler.filter(kalem_id=self.kutuphane.id).delete()
        diger, eski = self._diger_yil_sozlesme(self.kutuphane)
        sync_sozlesme_erisim(eski)
        sync_sozlesme_erisim(self.sozlesme)
        self.assertIn(
            self.ogrenci.id,
            ogrenci_ids_with_hizmet_turu(
                'kutuphane', kurum_id=self.kurum.id, sube_id=self.sube.id,
                egitim_yili_id=diger.id,
            ),
        )
        self.assertNotIn(
            self.ogrenci.id,
            ogrenci_ids_with_hizmet_turu(
                'kutuphane', kurum_id=self.kurum.id, sube_id=self.sube.id,
                egitim_yili_id=self.ey.id,
            ),
        )

    def test_eski_yil_satiri_guncel_sozlesmeye_tasinir(self):
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
            egitim_yili=EgitimYili.objects.create(baslangic_yil=2023, bitis_yil=2024),
            fiyat=0,
        )
        self.sozlesme.kalemler.exclude(kalem_id=self.kutuphane.id).delete()
        sync_sozlesme_erisim(self.sozlesme)
        row = OgrenciEkHizmet.objects.get(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        )
        self.assertEqual(row.egitim_yili_id, self.ey.id)
        again = sync_sozlesme_erisim(self.sozlesme)
        self.assertEqual(again['realigned_ek_hizmet'], [])
        self.assertEqual(again['created_ek_hizmet'], [])

    def test_iki_sozlesmede_ayni_hizmet_biri_cikinca_kalir(self):
        sync_sozlesme_erisim(self.sozlesme)
        ikinci = Sozlesme.objects.create(
            sozlesme_no='SZL-ERS-002',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=self.sozlesme.baslangic_tarihi,
            bitis_tarihi=self.sozlesme.bitis_tarihi,
            paket_turu='ek_hizmet',
            paket_adi='Ek',
            brut_tutar=500000,
            kdv_dahil_tutar=500000,
            net_tutar=500000,
            taksit_sayisi=1,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=ikinci, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kutuphane.id, kalem_adi='Kütüphane',
            brut_tutar=500000, net_tutar=500000, kdv_dahil_tutar=500000,
        )
        self.sozlesme.kalemler.filter(kalem_id=self.kutuphane.id).delete()
        sync_sozlesme_erisim(self.sozlesme)
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        ).exists())

    def test_iki_yilda_ayni_hizmet_tahminle_tasinmaz(self):
        sync_sozlesme_erisim(self.sozlesme)
        diger, eski = self._diger_yil_sozlesme(self.kutuphane)
        result = sync_sozlesme_erisim(eski)
        self.assertNotIn('Kütüphane', result['closed_ek_hizmet'])
        years = set(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        ).values_list('egitim_yili_id', flat=True))
        self.assertEqual(years, {self.ey.id, diger.id})

    def test_erisim_hatasi_kalem_eklemeyi_geri_alir(self):
        from unittest.mock import patch

        ekstra = EkHizmet.objects.create(
            ad='Etüt', kod='ETU', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, brut_fiyat=1000,
        )
        with patch(
            'apps.odeme_takip.application.services.sozlesme_erisim_sync.sync_sozlesme_erisim',
            side_effect=RuntimeError('erişim yazılamadı'),
        ):
            with self.assertRaises(RuntimeError):
                SozlesmeService().kalem_ekle(self.sozlesme.id, {
                    'kalem_turu': KalemTuru.EK_HIZMET,
                    'kalem_id': ekstra.id,
                    'kalem_adi': 'Etüt',
                    'brut_tutar': 1000,
                    'kdv_orani': 0,
                    'net_tutar': 1000,
                })
        self.assertFalse(SozlesmeKalemi.objects.filter(sozlesme=self.sozlesme, kalem_id=ekstra.id).exists())
        self.assertFalse(OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, ek_hizmet=ekstra).exists())

    def test_katalog_degisince_ayni_kalem_yeni_hak_acmaz(self):
        grup = GrupDersi.objects.create(
            ad='Grup', kod='GRP', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
        )
        grup.dahil_ek_hizmetler.add(self.kutuphane)
        self.sozlesme.kalemler.all().delete()
        self.sozlesme.paket_turu = 'grup_dersi'
        self.sozlesme.paket_id = grup.id
        self.sozlesme.save(update_fields=['paket_turu', 'paket_id'])
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=grup.id, kalem_adi='Grup',
            brut_tutar=1000, net_tutar=1000, kdv_dahil_tutar=1000,
        )
        sync_sozlesme_erisim(self.sozlesme)
        grup.dahil_ek_hizmetler.add(self.kocluk)
        sync_sozlesme_erisim(self.sozlesme)
        self.assertFalse(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
        ).exists())
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
        ).exists())

    def test_not_kaydi_katalogdan_hak_uretmez(self):
        sync_sozlesme_erisim(self.sozlesme)
        self.kutuphane.hizmet_turu = 'kocluk'
        self.kutuphane.save(update_fields=['hizmet_turu'])
        SozlesmeService().update(self.sozlesme.id, {'notlar': 'yalnızca not'})
        self.assertEqual(
            OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, aktif_mi=True).count(),
            2,
        )

    def test_dondurulmus_sozlesme_erisimi_kapatmaz(self):
        sync_sozlesme_erisim(self.sozlesme)
        SozlesmeService().change_status(self.sozlesme.id, SozlesmeDurum.DONDURULMUS)
        self.assertEqual(
            OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, aktif_mi=True).count(),
            2,
        )

    def test_bireysel_satis_sozlesme_senkronunda_kapanmaz(self):
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
            egitim_yili=self.ey, fiyat=100, kaynak_paket_turu='bireysel',
        )
        self.sozlesme.kalemler.filter(kalem_id=self.kutuphane.id).delete()
        sync_sozlesme_erisim(self.sozlesme, refresh_inclusions=False)
        self.assertTrue(OgrenciEkHizmet.objects.filter(
            ogrenci=self.ogrenci, ek_hizmet=self.kutuphane, aktif_mi=True,
            kaynak_paket_turu='bireysel',
        ).exists())


class EsZamanliErisimTests(TransactionTestCase):
    def _fixture_teardown(self):
        # Bu projenin test veritabanı TRUNCATE ... CASCADE olmadan flush olmaz.
        return

    def test_iki_sozlesme_ayni_anda_birlesir(self):
        kod = uuid.uuid4().hex[:8].upper()
        kurum = Kurum.objects.create(ad='Eş', kod=kod)
        sube = Sube.objects.create(kurum=kurum, ad='Merkez', kod=kod)
        ey = EgitimYili.objects.create(baslangic_yil=2098, bitis_yil=2099, aktif_mi=False)
        ogrenci = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Eş', soyad='Zaman', aktif_mi=True,
        )
        kutuphane = EkHizmet.objects.create(
            ad='Kütüphane', kod=f'K{kod[:7]}', hizmet_turu='kutuphane',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        kocluk = EkHizmet.objects.create(
            ad='Koçluk', kod=f'C{kod[:7]}', hizmet_turu='kocluk',
            kurum=kurum, sube=sube, egitim_yili=ey, brut_fiyat=1000,
        )
        today = timezone.localdate()

        def sozlesme(no, hizmet):
            row = Sozlesme.objects.create(
                sozlesme_no=no, ogrenci=ogrenci, egitim_yili=ey,
                kurum=kurum, sube=sube,
                baslangic_tarihi=today, bitis_tarihi=today + timedelta(days=30),
                paket_turu='ek_hizmet', paket_adi='Ek',
                brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000,
                taksit_sayisi=1, durum=SozlesmeDurum.AKTIF,
            )
            SozlesmeKalemi.objects.create(
                sozlesme=row, kalem_turu=KalemTuru.EK_HIZMET,
                kalem_id=hizmet.id, kalem_adi=hizmet.ad,
                brut_tutar=1000, net_tutar=1000, kdv_dahil_tutar=1000,
            )
            return row

        birinci = sozlesme(f'SZL-{kod[:6]}-1', kutuphane)
        ikinci = sozlesme(f'SZL-{kod[:6]}-2', kocluk)
        barrier = threading.Barrier(2)
        errors = []

        def calistir(sozlesme_id):
            try:
                barrier.wait(timeout=5)
                row = Sozlesme.objects.get(pk=sozlesme_id)
                sync_sozlesme_erisim(row, refresh_inclusions=False)
            except Exception as exc:
                errors.append(exc)
            finally:
                connections.close_all()

        threads = [
            threading.Thread(target=calistir, args=(birinci.id,)),
            threading.Thread(target=calistir, args=(ikinci.id,)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        self.assertEqual(errors, [])
        aktif = set(OgrenciEkHizmet.objects.filter(
            ogrenci=ogrenci, aktif_mi=True,
        ).values_list('ek_hizmet_id', flat=True))
        self.assertEqual(aktif, {kutuphane.id, kocluk.id})
        OgrenciEkHizmet.objects.filter(ogrenci=ogrenci).delete()
        SozlesmeKalemi.objects.filter(sozlesme__ogrenci=ogrenci).delete()
        Sozlesme.objects.filter(ogrenci=ogrenci).delete()
        ogrenci.delete()
        kutuphane.delete()
        kocluk.delete()
        sube.delete()
        kurum.delete()
        ey.delete()
