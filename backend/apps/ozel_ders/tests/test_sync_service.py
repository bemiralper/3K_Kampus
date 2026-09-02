from datetime import date

from django.test import TestCase

from apps.egitim_paketleri.models import OzelDers, PremiumPaket
from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciKayit
from apps.ozel_ders.domain.models import (
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    PremiumPaketDersKota,
)
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.ozel_ders.services.sync_service import (
    ensure_program_for_package,
    ensure_program_from_sozlesme,
    resolve_paket_dersleri,
    sync_sube_programs,
)
from apps.sube.domain.models import Sube


class SyncServiceTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Sync Kurum', kod='ODSYNC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODS')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.ders1 = Ders.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Fizik-1',
            kod='FIZ1',
            kisa_ad='Fizik',
        )
        self.ders2 = Ders.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Matematik',
            kod='MAT',
            kisa_ad='',
        )
        self.ozel_paket = OzelDers.objects.create(
            ad='Birebir Paket',
            kod='BB1',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            brut_fiyat=1000,
        )
        self.ozel_paket.dersler.add(self.ders1, self.ders2)

        self.premium = PremiumPaket.objects.create(
            ad='Premium BB',
            kod='PR1',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            brut_fiyat=2000,
        )
        PremiumPaketDersKota.objects.create(
            premium_paket=self.premium,
            ders=self.ders1,
            haftalik_adet=2,
            varsayilan_sure_dk=50,
        )

    def test_ozel_ders_creates_program_without_slots(self):
        program, action = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id,
            baslangic=date(2025, 9, 1),
        )
        self.assertEqual(action, 'created')
        self.assertIsNotNone(program)
        self.assertEqual(program.ozel_ders_paket_id, self.ozel_paket.id)
        self.assertEqual(BirebirHaftalikSlot.objects.filter(program=program).count(), 0)

        dersler = resolve_paket_dersleri(program)
        ids = {d['id'] for d in dersler}
        self.assertEqual(ids, {self.ders1.id, self.ders2.id})
        fizik = next(d for d in dersler if d['id'] == self.ders1.id)
        self.assertEqual(fizik['kisa_ad'], 'Fizik')

    def test_ensure_idempotent_no_duplicate(self):
        p1, a1 = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id,
        )
        p2, a2 = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id,
        )
        self.assertEqual(a1, 'created')
        self.assertEqual(a2, 'skipped')
        self.assertEqual(p1.id, p2.id)
        self.assertEqual(
            BirebirOgrenciProgrami.objects.filter(
                ogrenci=self.ogrenci,
                ozel_ders_paket=self.ozel_paket,
            ).count(),
            1,
        )

    def test_premium_creates_program_with_kota_dersleri(self):
        program, action = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='premium',
            paket_id=self.premium.id,
        )
        self.assertEqual(action, 'created')
        self.assertEqual(program.premium_paket_id, self.premium.id)
        self.assertEqual(BirebirHaftalikSlot.objects.filter(program=program).count(), 0)

        dersler = resolve_paket_dersleri(program)
        self.assertEqual(len(dersler), 1)
        self.assertEqual(dersler[0]['haftalik_adet'], 2)
        self.assertEqual(dersler[0]['varsayilan_sure_dk'], 50)

    def test_resolve_paket_dersleri_infers_from_paket_adi(self):
        paket = OzelDers.objects.create(
            ad='Matematik Özel Ders',
            kod='MATOZ',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            brut_fiyat=1000,
        )
        program, action = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='ozel_ders',
            paket_id=paket.id,
        )
        self.assertEqual(action, 'created')
        dersler = resolve_paket_dersleri(program)
        self.assertEqual(len(dersler), 1)
        self.assertEqual(dersler[0]['id'], self.ders2.id)
        self.assertEqual(dersler[0]['ad'], 'Matematik')

    def test_non_syncable_paket_noop(self):
        program, action = ensure_program_for_package(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
            paket_turu='grup_dersi',
            paket_id=1,
        )
        self.assertIsNone(program)
        self.assertEqual(action, 'noop')

    def test_sync_sube_programs_from_enrollment(self):
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.ogrenci,
            paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id,
            paket_adi=self.ozel_paket.ad,
            aktif_mi=True,
            baslangic_tarihi=date(2025, 9, 1),
        )
        summary = sync_sube_programs(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
        )
        self.assertEqual(summary['created'], 1)
        self.assertEqual(
            BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci).count(),
            1,
        )
        summary2 = sync_sube_programs(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
        )
        self.assertEqual(summary2['skipped'], 1)
        self.assertEqual(summary2['created'], 0)

    def test_sozlesme_kalem_creates_program(self):
        sozlesme = Sozlesme.objects.create(
            sozlesme_no='SZ-OD-KALEM',
            ogrenci=self.ogrenci,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 15),
            paket_turu='grup_dersi',
            paket_id=99,
            paket_adi='Grup',
            brut_tutar=1000,
            net_tutar=1000,
            durum=SozlesmeDurum.AKTIF,
        )
        SozlesmeKalemi.objects.create(
            sozlesme=sozlesme,
            kalem_turu=KalemTuru.OZEL_DERS,
            kalem_id=self.ozel_paket.id,
            kalem_adi=self.ozel_paket.ad,
            brut_tutar=1000,
            net_tutar=1000,
        )
        program, action = ensure_program_from_sozlesme(sozlesme)
        self.assertEqual(action, 'created')
        self.assertEqual(program.ozel_ders_paket_id, self.ozel_paket.id)
        self.assertTrue(
            OgrenciEgitimPaketi.objects.filter(
                ogrenci=self.ogrenci,
                paket_turu='ozel_ders',
                paket_id=self.ozel_paket.id,
                aktif_mi=True,
            ).exists()
        )

    def test_sync_includes_student_by_kayit_sube(self):
        other = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='ODD')
        transferred = Ogrenci.objects.create(
            kurum=self.kurum, sube=other, ad='Zeynep', soyad='Kaya', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=transferred,
            egitim_yili=self.ey,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        OgrenciEgitimPaketi.objects.create(
            ogrenci=transferred,
            paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id,
            paket_adi=self.ozel_paket.ad,
            aktif_mi=True,
        )
        summary = sync_sube_programs(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            egitim_yili_id=self.ey.id,
        )
        self.assertGreaterEqual(summary['created'], 1)
        self.assertTrue(
            BirebirOgrenciProgrami.objects.filter(
                ogrenci=transferred, sube=self.sube, egitim_yili=self.ey,
            ).exists()
        )
