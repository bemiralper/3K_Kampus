"""Öğrenci listesi filtre/serileştirme yardımcıları."""
from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from apps.egitim_paketleri.models import Deneme, EkHizmet, GrupDersi, OzelDers
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import KalemTuru, PaketTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciEkHizmet, OgrenciKayit, OgrenciVeli
from apps.ogrenci.interfaces.list_helpers import (
    build_kayit_queryset,
    build_ogrenci_kalemler_map,
    resolve_kalem_filter_turu,
    resolve_sinif_seviyesi_ad,
    serialize_kayit_row,
    serialize_veli_fields,
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

    def test_sozlesme_degisince_eski_paket_listede_kalmaz(self):
        yeni = GrupDersi.objects.create(
            ad='Yeni Sayısal', kod='GYS',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=yeni.id,
            kalem_adi='Eski Grup Adı',
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='grup_dersi',
            paket_id=self.grup.id,
            paket_adi=self.grup.ad,
            aktif_mi=True,
        )
        turler = self._turler()
        self.assertIn(('grup_dersi', 'Yeni Sayısal'), turler)
        self.assertNotIn(('grup_dersi', '12 TYT Grup'), turler)
        self.assertNotIn(('grup_dersi', 'Eski Grup Adı'), turler)

    def test_enrollment_adi_katalogdan_okunur(self):
        self.sozlesme.delete()
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='grup_dersi',
            paket_id=self.grup.id,
            paket_adi='Kayıt anındaki ad',
            aktif_mi=True,
        )
        self.grup.ad = 'Güncel Grup Adı'
        self.grup.save(update_fields=['ad'])
        self.assertIn(('grup_dersi', 'Güncel Grup Adı'), self._turler())
        self.assertNotIn(('grup_dersi', 'Kayıt anındaki ad'), self._turler())

    def test_aktif_kutuphane_filtrede_ve_listede_gorunur(self):
        SozlesmeKalemi.objects.create(
            sozlesme=self.sozlesme,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.grup.id,
            kalem_adi=self.grup.ad,
        )
        kutuphane = EkHizmet.objects.create(
            ad='Kütüphane',
            kod='KUT',
            hizmet_turu='kutuphane',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci,
            ek_hizmet=kutuphane,
            aktif_mi=True,
            egitim_yili=self.yil,
        )
        self.assertIn(('ek_hizmet', 'Kütüphane'), self._turler())
        filtered = build_ogrenci_kalemler_map(
            [self.kayit],
            filter_kalemler=[('ek_hizmet', kutuphane.id)],
        ).get(self.kayit.id, [])
        self.assertEqual(
            [(e['kalem_turu'], e['kalem_adi']) for e in filtered],
            [('ek_hizmet', 'Kütüphane')],
        )

    def test_deneme_ek_hizmet_filtresi_deneme_adini_bos_birakmaz(self):
        eh = EkHizmet.objects.create(
            ad=f'Deneme — {self.deneme.ad}',
            kod='DNM_FLT',
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
        filtered = build_ogrenci_kalemler_map(
            [self.kayit],
            filter_kalemler=[('ek_hizmet', eh.id)],
        ).get(self.kayit.id, [])
        self.assertIn(('deneme', 'TYT Deneme Paketi'), {
            (e['kalem_turu'], e['kalem_adi']) for e in filtered
        })

    def test_enrollment_grup_dersi_appears_without_sozlesme(self):
        self.sozlesme.delete()
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='grup_dersi',
            paket_id=self.grup.id,
            paket_adi=self.grup.ad,
            aktif_mi=True,
            dahil_mi=True,
        )
        self.assertIn(('grup_dersi', '12 TYT Grup'), self._turler())


def _list_params(**overrides):
    params = {
        'q': '',
        'all_years': False,
        'durum': 'aktif',
        'sinif_seviyesi_ids': [],
        'giris_turu': None,
        'kayit_turu': None,
        'cinsiyet': None,
        'paket_id': None,
        'paket_turu': None,
        'kalemler': [],
        'sinif_ids': [],
        'school_ids': [],
        'alan_ids': [],
        'coach_ids': [],
        'kayit_tarihi_bas': None,
        'kayit_tarihi_bit': None,
        'sort': 'created_at_desc',
        'page': 1,
        'page_size': 25,
    }
    params.update(overrides)
    return params


class BuildKayitQuerysetEnrollmentTest(TestCase):
    """Kayıtlı ama sözleşmesi aktif olmayan öğrenci paket filtresinde kalsın."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Liste Kurum', kod='LST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='LST-M')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Kayit', aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            aktif_mi=True,
        )
        self.grup = GrupDersi.objects.create(
            ad='11 TYT Grup', kod='G11',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.ctx = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.yil.id,
        }

    def _ids(self, **overrides):
        qs, _ = build_kayit_queryset(self.ctx, _list_params(**overrides))
        return set(qs.values_list('ogrenci_id', flat=True))

    def test_kayit_only_student_visible_without_kalem_filter(self):
        self.assertIn(self.ogrenci.id, self._ids())

    def test_kayit_package_without_sozlesme_matches_kalem_filter(self):
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='grup_dersi',
            paket_id=self.grup.id,
            paket_adi=self.grup.ad,
            aktif_mi=True,
            dahil_mi=True,
        )
        ids = self._ids(kalemler=[('grup_dersi', self.grup.id)])
        self.assertIn(self.ogrenci.id, ids)

    def test_dondurulmus_sozlesme_matches_kalem_filter(self):
        soz = Sozlesme.objects.create(
            sozlesme_no='SZ-LST-DND',
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
            durum=SozlesmeDurum.DONDURULMUS,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=soz,
            kalem_turu=KalemTuru.PAKET,
            kalem_id=self.grup.id,
            kalem_adi=self.grup.ad,
        )
        ids = self._ids(kalemler=[('grup_dersi', self.grup.id)])
        self.assertIn(self.ogrenci.id, ids)

    def _aktif_sozlesme_with(self, paket):
        soz = Sozlesme.objects.create(
            sozlesme_no='SZ-LST-DEG',
            ogrenci=self.ogrenci,
            ogrenci_kayit=self.kayit,
            egitim_yili=self.yil,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 30),
            paket_turu=PaketTuru.GRUP_DERSI,
            paket_id=paket.id,
            paket_adi=paket.ad,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=soz, kalem_turu=KalemTuru.PAKET, kalem_id=paket.id, kalem_adi=paket.ad,
        )
        return soz

    def test_sozlesme_degisince_eski_paket_filtrede_cikmaz_ve_hizmet_bos_kalmaz(self):
        """Kayıt anındaki paket (eski) kapanmamış olsa bile: eski paket filtresi
        öğrenciyi getirmez; yeni paket filtresinde öğrenci gelir ve Hizmet dolu olur."""
        yeni = GrupDersi.objects.create(
            ad='12 AYT Grup', kod='G12',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        # Kayıt sihirbazının yazdığı eski paket erişimi — senkron çalışmamış, hâlâ aktif
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci, paket_turu='grup_dersi', paket_id=self.grup.id,
            paket_adi=self.grup.ad, aktif_mi=True,
        )
        self._aktif_sozlesme_with(yeni)

        eski_ids = self._ids(kalemler=[('grup_dersi', self.grup.id)])
        self.assertNotIn(self.ogrenci.id, eski_ids, 'eski paket filtresinde öğrenci gelmemeli')

        qs, _ = build_kayit_queryset(self.ctx, _list_params(kalemler=[('grup_dersi', yeni.id)]))
        kayitlar = list(qs)
        self.assertEqual([k.ogrenci_id for k in kayitlar], [self.ogrenci.id])
        kalemler = build_ogrenci_kalemler_map(kayitlar, filter_kalemler=[('grup_dersi', yeni.id)])
        self.assertEqual([e['kalem_adi'] for e in kalemler[self.kayit.id]], ['12 AYT Grup'])

    def test_filtre_ile_gosterilen_hizmet_her_zaman_dolu(self):
        """Filtre sonucundaki her kayıt için Hizmet sütunu boş olamaz."""
        yeni = GrupDersi.objects.create(
            ad='9 Hazırlık', kod='G9', kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci, paket_turu='grup_dersi', paket_id=self.grup.id,
            paket_adi=self.grup.ad, aktif_mi=True,
        )
        self._aktif_sozlesme_with(yeni)
        for spec in (('grup_dersi', self.grup.id), ('grup_dersi', yeni.id)):
            qs, _ = build_kayit_queryset(self.ctx, _list_params(kalemler=[spec]))
            kayitlar = list(qs)
            kalemler = build_ogrenci_kalemler_map(kayitlar, filter_kalemler=[spec])
            for k in kayitlar:
                self.assertTrue(kalemler.get(k.id), f'{spec}: Hizmet sütunu boş')


class SerializeVeliFieldsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Veli Kurum', kod='VLK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='VLK-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Yılmaz', aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            aktif_mi=True,
        )

    def test_joins_all_guardians_for_list_and_export(self):
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Yılmaz',
            telefon='05321112233',
            varsayilan=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='baba',
            ad='Mehmet',
            soyad='Yılmaz',
            telefon='05334445566',
            varsayilan=False,
        )
        fields = serialize_veli_fields(self.ogrenci)
        self.assertIn('Ayşe Yılmaz', fields['veli_ad_soyad'])
        self.assertIn('Mehmet Yılmaz', fields['veli_ad_soyad'])
        self.assertIn('05321112233', fields['veli_telefon'])
        self.assertIn('05334445566', fields['veli_telefon'])
        self.assertEqual(len(fields['veliler']), 2)

        row = serialize_kayit_row(self.kayit)
        self.assertIn('Mehmet Yılmaz', row['veli_ad_soyad'])
        self.assertEqual(len(row['veliler']), 2)
