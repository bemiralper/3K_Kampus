"""Öğrenci özel ders dashboard KPI / uyarı."""
from datetime import date, time, timedelta

from django.test import TestCase

from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.ogrenci_ozel_ders_dashboard import build_dashboard
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class OgrenciDashboardTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Dash', kod='ODDASH')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODD')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Akın',
            aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Fizik',
            kod='FIZ-D',
            kisa_ad='Fizik',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Can',
            soyad='Yıldız',
            aktif_mi=True,
        )
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=date.today() - timedelta(days=60),
            bitis_tarihi=date.today() + timedelta(days=60),
            durum=ProgramDurumu.AKTIF,
        )
        self.slot = BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=1,
            baslangic=time(18, 0),
            bitis=time(19, 0),
            sure_dk=60,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )
        BirebirDersOturumu.objects.create(
            program=self.program,
            source_slot=self.slot,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=date.today() - timedelta(days=7),
            start_time=time(18, 0),
            end_time=time(19, 0),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.ISLENDI,
            notes='Limit konusu tamamlandı.',
            is_active=True,
        )
        BirebirDersOturumu.objects.create(
            program=self.program,
            source_slot=self.slot,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=date.today() + timedelta(days=2),
            start_time=time(18, 0),
            end_time=time(19, 0),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.PLANLANDI,
            is_active=True,
        )
        BirebirDersOturumu.objects.create(
            program=self.program,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=date.today() - timedelta(days=3),
            start_time=time(17, 0),
            end_time=time(18, 0),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.TELAFI_EDILECEK,
            is_active=True,
        )

    def test_kpis_and_uyari_telafi(self):
        data = build_dashboard(
            ogrenci_id=self.ogrenci.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertTrue(data['has_data'])
        self.assertEqual(data['kpis']['islenen_oturum'], 1)
        self.assertEqual(data['kpis']['telafi_bekleyen'], 1)
        self.assertEqual(data['kpis']['planlanan_oturum'], 1)
        self.assertGreaterEqual(data['kpis']['toplam_ozel_ders'], 1)
        self.assertTrue(any(u['code'] == 'telafi' for u in data['uyarilar']))
        self.assertEqual(len(data['haftalik_program']), 1)
        self.assertTrue(any(n.get('notes') for n in data['son_notlar']))
        self.assertEqual(len(data['dersler']), 1)
        self.assertEqual(data['dersler'][0]['islenen'], 1)
