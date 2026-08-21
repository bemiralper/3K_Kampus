"""Kalem ekle/çıkar: fiyat geri dönüşü ve özel ders program senkronu."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.egitim_paketleri.models import OzelDers
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi, Taksit
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi
from apps.ozel_ders.domain.models import BirebirOgrenciProgrami, ProgramDurumu
from apps.sube.domain.models import Sube


class KalemOzelDersTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kalem Kurum', kod='KLM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KLM')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zehra',
            soyad='Borulu',
            aktif_mi=True,
        )
        self.ozel = OzelDers.objects.create(
            ad='Matematik Birebir',
            kod='MATBB',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            brut_fiyat=20000,
        )
        today = timezone.localdate()
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-KLM-001',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today,
            bitis_tarihi=today + timedelta(days=365),
            ilk_odeme_tarihi=today,
            paket_turu='grup_dersi',
            paket_id=1,
            paket_adi='Grup Paket',
            brut_tutar=100000,
            kdv_dahil_tutar=100000,
            toplam_indirim_tutari=10000,
            net_tutar=90000,
            taksit_sayisi=1,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=1,
            kalem_adi='Grup Paket',
            brut_tutar=100000,
            kdv_orani=10,
            kdv_tutari=9091,
            kdv_dahil_tutar=100000,
            indirim_orani=10,
            indirim_tutari=10000,
            net_tutar=90000,
        )
        Taksit.objects.create(
            sozlesme=self.sozlesme,
            taksit_no=1,
            vade_tarihi=today,
            tutar=90000,
            odenen_tutar=0,
            kalan_tutar=90000,
        )
        self.service = SozlesmeService()

    def test_add_then_remove_ozel_ders_restores_net(self):
        original_net = self.sozlesme.net_tutar
        original_brut = self.sozlesme.brut_tutar
        original_indirim = self.sozlesme.toplam_indirim_tutari

        kalem, err = self.service.kalem_ekle(self.sozlesme.id, {
            'kalem_turu': 'ozel_ders',
            'kalem_id': self.ozel.id,
            'kalem_adi': self.ozel.ad,
            'brut_tutar': 20000,
            'kdv_orani': 10,
            'indirim_orani': 0,
            'net_tutar': 20000,
        })
        self.assertIsNone(err)
        self.sozlesme.refresh_from_db()
        self.assertEqual(self.sozlesme.net_tutar, original_net + 20000)

        result, err = self.service.kalem_cikar(kalem.id)
        self.assertIsNone(err)
        self.assertTrue(result['removed'])
        self.sozlesme.refresh_from_db()
        self.assertEqual(self.sozlesme.net_tutar, original_net)
        self.assertEqual(self.sozlesme.brut_tutar, original_brut)
        self.assertEqual(self.sozlesme.toplam_indirim_tutari, original_indirim)
        self.assertEqual(SozlesmeKalemi.objects.filter(sozlesme=self.sozlesme).count(), 1)

    def test_kalem_ekle_creates_birebir_program(self):
        kalem, err = self.service.kalem_ekle(self.sozlesme.id, {
            'kalem_turu': 'ozel_ders',
            'kalem_id': self.ozel.id,
            'kalem_adi': self.ozel.ad,
            'brut_tutar': 20000,
            'kdv_orani': 10,
            'net_tutar': 20000,
        })
        self.assertIsNone(err)
        program = BirebirOgrenciProgrami.objects.get(
            ogrenci=self.ogrenci,
            ozel_ders_paket=self.ozel,
        )
        self.assertEqual(program.durum, ProgramDurumu.AKTIF)
        self.assertTrue(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci,
                paket_turu='ozel_ders',
                paket_id=self.ozel.id,
                aktif_mi=True,
            ).exists()
        )

        self.service.kalem_cikar(kalem.id)
        program.refresh_from_db()
        self.assertEqual(program.durum, ProgramDurumu.PASIF)
        self.assertFalse(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci,
                paket_turu='ozel_ders',
                paket_id=self.ozel.id,
                aktif_mi=True,
            ).exists()
        )
