"""Tatil günü etkilenen özel dersler + çevre tatil."""
from datetime import date, time

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
from apps.ozel_ders.services.conflict_service import is_holiday
from apps.ozel_ders.services.tatil_etkilenen_service import (
    list_affected_for_date,
    set_cevre_tatil,
)
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube
from apps.takvim.application.integration_service import KaynakModul
from apps.takvim.domain.enums import EventCategory
from apps.takvim.domain.models import EventType


class TatilEtkilenenTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Etkilenen', kod='ODETK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ETK')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Demir',
            aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Matematik',
            kod='MAT-E',
            kisa_ad='Mat',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='Kaya',
            aktif_mi=True,
        )
        EventType.objects.create(
            kurum_id=self.kurum.id,
            ad='Tatil / İzin',
            kategori=EventCategory.TATIL,
            renk='#6B7280',
            ikon='🏖️',
            varsayilan_sure_dk=480,
            is_system=True,
            is_active=True,
        )
        # 2026-01-05 = Monday
        self.monday = date(2026, 1, 5)
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=date(2025, 9, 1),
            bitis_tarihi=date(2026, 6, 15),
            durum=ProgramDurumu.AKTIF,
        )
        self.slot = BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=1,  # Monday
            baslangic=time(18, 0),
            bitis=time(19, 0),
            sure_dk=60,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )

    def test_planned_slot_counts_on_weekday(self):
        data = list_affected_for_date(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            day=self.monday,
        )
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['items'][0]['kind'], 'planned')
        self.assertEqual(data['items'][0]['slot_id'], self.slot.id)
        self.assertEqual(data['items'][0]['ogrenci_id'], self.ogrenci.id)

    def test_program_outside_window_excluded(self):
        self.program.bitis_tarihi = date(2025, 12, 1)
        self.program.save(update_fields=['bitis_tarihi'])
        data = list_affected_for_date(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            day=self.monday,
        )
        self.assertEqual(data['count'], 0)

    def test_oturum_merges_with_slot(self):
        oturum = BirebirDersOturumu.objects.create(
            program=self.program,
            source_slot=self.slot,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=self.monday,
            start_time=time(18, 0),
            end_time=time(19, 0),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.IPTAL,
            is_active=True,
        )
        data = list_affected_for_date(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            day=self.monday,
        )
        self.assertEqual(data['count'], 1)
        item = data['items'][0]
        self.assertEqual(item['kind'], 'oturum')
        self.assertEqual(item['oturum_id'], oturum.id)
        self.assertEqual(item['durum'], OturumDurumu.IPTAL)

    def test_cevre_sets_is_holiday(self):
        # Tuesday after Monday
        tuesday = date(2026, 1, 6)
        self.assertFalse(is_holiday(self.kurum.id, self.sube.id, tuesday))

        set_cevre_tatil(
            kurum_id=self.kurum.id,
            base_date=self.monday,
            side='next',
            aktif=True,
            user_id=1,
        )
        self.assertTrue(is_holiday(self.kurum.id, self.sube.id, tuesday))

        set_cevre_tatil(
            kurum_id=self.kurum.id,
            base_date=self.monday,
            side='next',
            aktif=False,
            user_id=1,
        )
        self.assertFalse(is_holiday(self.kurum.id, self.sube.id, tuesday))
