"""Öğrenci listesi filtre/serileştirme yardımcıları."""
from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi, OzelDers
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import KalemTuru, PaketTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciEkHizmet, OgrenciKayit
from apps.ogrenci.interfaces.list_helpers import (
    build_ogrenci_kalemler_map,
    resolve_kalem_filter_turu,
    resolve_sinif_seviyesi_ad,
)
from apps.sube.domain.models import Sube


class ResolveSinifSeviyesiAdTest(SimpleTestCase):
    def test_prefers_sinif_seviyesi_on_class(self):
        kayit = SimpleNamespace(
            sinif=SimpleNamespace(sinif_seviyesi=SimpleNamespace(ad='12. Sınıf')),
            sinif_seviyesi=SimpleNamespace(ad='11. Sınıf'),
        )
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '12. Sınıf')

    def test_falls_back_to_kayit_sinif_seviyesi(self):
        kayit = SimpleNamespace(
            sinif=None,
            sinif_seviyesi=SimpleNamespace(ad='11. Sınıf'),
        )
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '11. Sınıf')

    def test_returns_empty_when_missing(self):
        kayit = SimpleNamespace(sinif=None, sinif_seviyesi=None)
        self.assertEqual(resolve_sinif_seviyesi_ad(kayit), '')


class BuildOgrenciKalemlerMapTest(TestCase):
    """Sözleşmede kalem_turu=paket olan özel ders / deneme dışa aktarmada görünsün."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kalem Kurum', kod='KLM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KLM-M')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Elif', soyad='Kalem', aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            aktif_mi=True,
        )
        self.grup = GrupDersi.objects.create(
            ad='12 TYT Grup', kod='G12',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.ozel = OzelDers.objects.create(
            ad='Matematik Özel', kod='OZ1',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.deneme = Deneme.objects.create(
            ad='TYT Deneme Paketi', kod='DN1',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-KLM-001',
            ogrenci=self.ogrenci,
            ogrenci_kayit=self.kayit,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 30),
            paket_turu=PaketTuru.GRUP_DERSI,
            paket_id=self.grup.id,
            paket_adi=self.grup.ad,
            durum=SozlesmeDurum.AKTIF,
        )

    def _turler(self, kayit=None):
        kayit = kayit or self.kayit
        entries = build_ogrenci_kalemler_map([kayit]).get(kayit.id, [])
        return {(e['kalem_turu'], e['kalem_adi']) for e in entries}

    def test_extra_paket_kalemler_include_ozel_ders_and_deneme(self):
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.grup.id,
            kalem_adi=self.grup.ad,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.ozel.id,
            kalem_adi=self.ozel.ad,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.deneme.id,
            kalem_adi=self.deneme.ad,
        )

        turler = self._turler()
        self.assertIn(('grup_dersi', '12 TYT Grup'), turler)
        self.assertIn(('ozel_ders', 'Matematik Özel'), turler)
        self.assertIn(('deneme', 'TYT Deneme Paketi'), turler)

    def test_resolve_extra_paket_kalem_without_main_match(self):
        kalem = SimpleNamespace(
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.ozel.id,
            kalem_adi=self.ozel.ad,
        )
        self.assertEqual(
            resolve_kalem_filter_turu(kalem, self.sozlesme),
            'ozel_ders',
        )

    def test_deneme_wrapped_as_ek_hizmet_exports_as_deneme(self):
        eh = EkHizmet.objects.create(
            ad=f'Deneme — {self.deneme.ad}',
            kod='DNM_DN1',
            hizmet_turu='kocluk',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            deneme_paketi=self.deneme,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=eh.id,
            kalem_adi=eh.ad,
        )
        turler = self._turler()
        self.assertIn(('deneme', 'TYT Deneme Paketi'), turler)

    def test_enrollment_ozel_ders_and_included_deneme_appear(self):
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='ozel_ders',
            paket_id=self.ozel.id,
            paket_adi=self.ozel.ad,
            aktif_mi=True,
        )
        eh = EkHizmet.objects.create(
            ad=f'Deneme — {self.deneme.ad}',
            kod='DNM_INC',
            hizmet_turu='kocluk',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            deneme_paketi=self.deneme,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci,
            ek_hizmet=eh,
            aktif_mi=True,
            dahil_mi=True,
            egitim_yili=self.yil,
        )
        turler = self._turler()
        self.assertIn(('ozel_ders', 'Matematik Özel'), turler)
        self.assertIn(('deneme', 'TYT Deneme Paketi'), turler)
