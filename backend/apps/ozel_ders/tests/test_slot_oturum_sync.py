"""Şablon değişince gelecek planlı oturumlar hizalanır; geçmiş/hakediş dokunulmaz."""
from datetime import timedelta, time
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirHakedis,
    BirebirOgrenciProgrami,
    HakedisDurumu,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)
from apps.ozel_ders.services.slot_service import delete_slot, update_slot
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class SlotOturumSyncTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Sync', kod='ODSYNC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODSM')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Yılmaz', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ-S', kisa_ad='Fiz',
        )
        self.ders2 = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kimya', kod='KIM-S', kisa_ad='Kim',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Kaya', aktif_mi=True,
        )
        self.ogretmen2 = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Nur', aktif_mi=True,
        )
        self.today = timezone.localdate()
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=self.today - timedelta(days=28),
            bitis_tarihi=self.today + timedelta(days=28),
            durum=ProgramDurumu.AKTIF,
        )
        self.gun = self.today.isoweekday()
        self.slot = BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=self.gun,
            baslangic=time(13, 0),
            bitis=time(13, 50),
            sure_dk=50,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )

    def _oturum(self, day, *, durum=OturumDurumu.PLANLANDI, **kwargs):
        defaults = dict(
            program=self.program,
            source_slot=self.slot,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=day,
            start_time=time(13, 0),
            end_time=time(13, 50),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=durum,
            is_active=True,
        )
        defaults.update(kwargs)
        return BirebirDersOturumu.objects.create(**defaults)

    def _next_weekday(self, weekday: int, *, after=None):
        cur = (after or self.today) + timedelta(days=1)
        while cur.isoweekday() != weekday:
            cur += timedelta(days=1)
        return cur

    def test_saat_degisince_gelecek_planli_guncellenir_gecmis_kalir(self):
        past = self._oturum(self.today - timedelta(days=7), durum=OturumDurumu.ISLENDI)
        future = self._oturum(self._next_weekday(self.gun))

        with patch('apps.ozel_ders.services.materialize_service.materialize_program', return_value={'created': 0}):
            update_slot(
                self.slot.id,
                {'baslangic': '14:00', 'bitis': '14:50'},
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )

        past.refresh_from_db()
        future.refresh_from_db()
        self.assertEqual(past.start_time, time(13, 0))
        self.assertEqual(past.durum, OturumDurumu.ISLENDI)
        self.assertTrue(past.is_active)
        self.assertEqual(future.start_time, time(14, 0))
        self.assertEqual(future.end_time, time(14, 50))
        self.assertEqual(future.durum, OturumDurumu.PLANLANDI)

    def test_ogretmen_degisince_islendi_dokunulmaz(self):
        marked = self._oturum(self._next_weekday(self.gun), durum=OturumDurumu.ISLENDI)
        planned = self._oturum(self._next_weekday(self.gun, after=marked.session_date))

        with patch('apps.ozel_ders.services.materialize_service.materialize_program', return_value={'created': 0}):
            update_slot(
                self.slot.id,
                {'ogretmen_id': self.ogretmen2.id, 'ders_id': self.ders2.id},
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )

        marked.refresh_from_db()
        planned.refresh_from_db()
        self.assertEqual(marked.ogretmen_id, self.ogretmen.id)
        self.assertEqual(marked.ders_id, self.ders.id)
        self.assertEqual(planned.ogretmen_id, self.ogretmen2.id)
        self.assertEqual(planned.ders_id, self.ders2.id)

    def test_gun_degisince_gelecek_eski_gun_kapanir(self):
        future = self._oturum(self._next_weekday(self.gun))
        new_gun = (self.gun % 7) + 1

        update_slot(
            self.slot.id,
            {'gun': new_gun},
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )

        future.refresh_from_db()
        self.assertFalse(future.is_active)
        self.assertEqual(future.start_time, time(13, 0))
        new_day = self._next_weekday(new_gun)
        self.assertTrue(
            BirebirDersOturumu.objects.filter(
                source_slot=self.slot,
                session_date=new_day,
                is_active=True,
                durum=OturumDurumu.PLANLANDI,
            ).exists()
        )

    def test_slot_pasif_gelecek_planliyi_kapatir_gecmisi_birakir(self):
        past = self._oturum(self.today - timedelta(days=7), durum=OturumDurumu.ISLENDI)
        future = self._oturum(self._next_weekday(self.gun))

        delete_slot(self.slot.id, kurum_id=self.kurum.id, sube_id=self.sube.id)

        past.refresh_from_db()
        future.refresh_from_db()
        self.assertTrue(past.is_active)
        self.assertFalse(future.is_active)

    def test_kilitli_hakedis_dokunulmaz(self):
        future = self._oturum(self._next_weekday(self.gun))
        BirebirHakedis.objects.create(
            oturum=future,
            ogretmen=self.ogretmen,
            ders=self.ders,
            tarih=future.session_date,
            sure_dk=50,
            birim_ucret=100,
            tutar=100,
            durum=HakedisDurumu.ONAYLANDI,
        )

        with patch('apps.ozel_ders.services.materialize_service.materialize_program', return_value={'created': 0}):
            update_slot(
                self.slot.id,
                {'baslangic': '16:00', 'bitis': '16:50'},
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )

        future.refresh_from_db()
        self.assertEqual(future.start_time, time(13, 0))
        self.assertTrue(future.is_active)
