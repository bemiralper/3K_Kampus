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
    ProgramDurumu,
)
from apps.ozel_ders.services.materialize_service import (
    materialize_active_programs,
    materialize_program,
)
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class MaterializeActiveProgramsTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='OD Mat', kod='ODMAT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ODM')
        self.ey = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Yılmaz', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ-M', kisa_ad='Fiz',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Kaya', aktif_mi=True,
        )
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            ogrenci=self.ogrenci,
            baslangic_tarihi=date(2026, 8, 10),
            durum=ProgramDurumu.AKTIF,
        )
        # 2026-08-11 = Salı
        BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=2,
            baslangic=time(13, 0),
            bitis=time(13, 50),
            sure_dk=50,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )

    def test_creates_sessions_for_range_and_is_idempotent(self):
        first = materialize_active_programs(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-16',
        )
        self.assertEqual(first['created'], 1)
        self.assertEqual(BirebirDersOturumu.objects.filter(is_active=True).count(), 1)
        oturum = BirebirDersOturumu.objects.get()
        self.assertEqual(oturum.session_date, date(2026, 8, 11))
        self.assertEqual(oturum.ders_id, self.ders.id)

        second = materialize_active_programs(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-16',
        )
        self.assertEqual(second['created'], 0)
        self.assertEqual(BirebirDersOturumu.objects.filter(is_active=True).count(), 1)

    def test_slot_date_window_three_weeks(self):
        slot = self.program.slots.get()
        slot.baslangic_tarihi = date(2026, 8, 10)
        slot.bitis_tarihi = date(2026, 8, 31)
        slot.save(update_fields=['baslangic_tarihi', 'bitis_tarihi'])

        result = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-12-31',
        )
        self.assertEqual(result['created'], 3)
        dates = list(
            BirebirDersOturumu.objects.filter(is_active=True)
            .order_by('session_date')
            .values_list('session_date', flat=True)
        )
        self.assertEqual(dates, [date(2026, 8, 11), date(2026, 8, 18), date(2026, 8, 25)])

    def test_hour_quota_stops_at_five_hours(self):
        slot = self.program.slots.get()
        slot.hedef_dakika = 300
        slot.save(update_fields=['hedef_dakika'])

        result = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-10-31',
        )
        self.assertEqual(result['created'], 6)
        self.assertGreaterEqual(result['skipped_quota'], 1)
        self.assertEqual(BirebirDersOturumu.objects.filter(is_active=True).count(), 6)

    def test_cancelled_session_does_not_consume_quota(self):
        from apps.ozel_ders.domain.models import OturumDurumu

        slot = self.program.slots.get()
        slot.hedef_dakika = 100
        slot.save(update_fields=['hedef_dakika'])

        first = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-16',
        )
        self.assertEqual(first['created'], 1)
        oturum = BirebirDersOturumu.objects.get()
        oturum.durum = OturumDurumu.IPTAL
        oturum.save(update_fields=['durum'])

        second = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-31',
        )
        self.assertEqual(second['created'], 2)
        self.assertEqual(
            BirebirDersOturumu.objects.filter(is_active=True, durum=OturumDurumu.PLANLANDI).count(),
            2,
        )

    def test_inactive_planlandi_session_is_reactivated(self):
        first = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-16',
        )
        self.assertEqual(first['created'], 1)
        oturum = BirebirDersOturumu.objects.get()
        oturum.is_active = False
        oturum.save(update_fields=['is_active'])

        second = materialize_program(
            self.program.id,
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            start_date='2026-08-10',
            end_date='2026-08-16',
        )
        self.assertEqual(second['created'], 1)
        oturum.refresh_from_db()
        self.assertTrue(oturum.is_active)
        self.assertEqual(BirebirDersOturumu.objects.filter(is_active=True).count(), 1)
