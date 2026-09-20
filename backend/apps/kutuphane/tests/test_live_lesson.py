"""Kütüphane yoklamasında o anki birebir / grup ders uyarısı."""
from datetime import date, datetime, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import WeeklyDay
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.live_lesson import live_lessons_for_students
from apps.kutuphane.domain.models import AttendanceRecord, AttendanceSession, AttendanceStatus, Library
from apps.kutuphane.views import _serialize_attendance_records
from apps.ogrenci.domain.models import Ogrenci
from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirOgrenciProgrami,
    OturumDurumu,
    ProgramDurumu,
)
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class LiveLessonLookupTest(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.now = timezone.make_aware(datetime.combine(self.today, time(16, 30)))
        self.kurum = Kurum.objects.create(ad='Canlı Ders', kod='CLD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CLD-M')
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Demir', aktif_mi=True,
        )
        self.diger = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kaan', soyad='Yıldız', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='FIZ-L', kisa_ad='Fiz',
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Yıldız', aktif_mi=True,
        )
        self.program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ogrenci=self.ogrenci,
            baslangic_tarihi=self.today.replace(day=1) if self.today.day > 1 else self.today,
            durum=ProgramDurumu.AKTIF,
        )

    def _lookup(self, **kwargs):
        params = {
            'ogrenci_ids': [self.ogrenci.id, self.diger.id],
            'on_date': self.today,
            'now': self.now,
            'at_time': time(16, 30),
        }
        params.update(kwargs)
        return live_lessons_for_students(**params)

    def _oturum(self, **kwargs):
        data = {
            'program': self.program,
            'kurum': self.kurum,
            'sube': self.sube,
            'egitim_yili': self.year,
            'ogrenci': self.ogrenci,
            'ders': self.ders,
            'ogretmen': self.ogretmen,
            'session_date': self.today,
            'start_time': time(16, 0),
            'end_time': time(17, 0),
            'durum': OturumDurumu.PLANLANDI,
        }
        data.update(kwargs)
        return BirebirDersOturumu.objects.create(**data)

    def test_birebir_oturum_overlap(self):
        self._oturum()
        found = self._lookup()
        self.assertIn(self.ogrenci.id, found)
        self.assertNotIn(self.diger.id, found)
        row = found[self.ogrenci.id]
        self.assertTrue(row['derste'])
        self.assertEqual(row['ders_turu'], 'BIREBIR')
        self.assertEqual(row['ders_adi'], 'Fiz')
        self.assertIn('16:00', row['saat'])
        self.assertIn('Can', row['ogretmen_adi'])

    def test_cancelled_oturum_hidden(self):
        self._oturum(durum=OturumDurumu.IPTAL)
        self.assertEqual(self._lookup(), {})

    def test_weekly_slot_fallback(self):
        BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=self.today.isoweekday(),
            baslangic=time(16, 0),
            bitis=time(17, 0),
            sure_dk=60,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )
        found = self._lookup()
        self.assertEqual(found[self.ogrenci.id]['ders_turu'], 'BIREBIR')
        self.assertEqual(found[self.ogrenci.id]['ders_adi'], 'Fiz')

    def test_cancelled_oturum_blocks_slot(self):
        BirebirHaftalikSlot.objects.create(
            program=self.program,
            gun=self.today.isoweekday(),
            baslangic=time(16, 0),
            bitis=time(17, 0),
            sure_dk=60,
            ders=self.ders,
            ogretmen=self.ogretmen,
            aktif=True,
        )
        self._oturum(durum=OturumDurumu.OGRENCI_GELMEDI)
        self.assertEqual(self._lookup(), {})

    def test_outside_window_hidden(self):
        self._oturum()
        self.assertEqual(self._lookup(at_time=time(15, 0)), {})

    def test_other_day_has_no_session(self):
        self._oturum()
        self.assertEqual(self._lookup(on_date=self.today.replace(year=self.today.year - 1)), {})


class LiveLessonGroupAndApiTest(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.now = timezone.make_aware(datetime.combine(self.today, time(8, 20)))
        self.kurum = Kurum.objects.create(ad='Grup Ders', kod='GLD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GLD-M')
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='GUZ-L',
            start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31),
            is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9L', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT-L', aktif_mi=True,
        )
        self.ogretmen = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=self.term,
            student=self.ogrenci,
            classroom=self.sinif,
            is_active=True,
        )
        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.cycle = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=self.template,
            name='Takvim',
            is_active=True,
        )
        self.day = WeeklyDay.objects.create(
            weekly_cycle=self.cycle,
            day_of_week=self.today.weekday(),
            name='Bugün',
            order=1,
            is_active=True,
        )
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template,
            name='1. Ders',
            start_time=time(8, 0),
            end_time=time(8, 40),
            order=1,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        self.version = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            name='Aktif',
            is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            schedule_version=self.version,
            weekly_day=self.day,
            timeslot=self.slot,
            sinif=self.sinif,
            ders=self.ders,
            ogretmen=self.ogretmen,
            status=CellStatus.FILLED,
            is_active=True,
        )
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon', kod='GL-1', kapasite=10,
        )
        self.session = AttendanceSession.objects.create(
            library=self.library,
            tarih=self.today,
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=self.session,
            ogrenci_id=self.ogrenci.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        self.user = User.objects.create_superuser(username='gld_admin', password='testpass123')
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_group_lesson_from_grid(self):
        found = live_lessons_for_students(
            [self.ogrenci.id],
            on_date=self.today,
            now=self.now,
            at_time=time(8, 20),
        )
        self.assertEqual(found[self.ogrenci.id]['ders_turu'], 'GRUP')
        self.assertEqual(found[self.ogrenci.id]['ders_adi'], 'Matematik')
        self.assertEqual(found[self.ogrenci.id]['yer'], '9-A')

    def test_exclude_own_class_from_group_warning(self):
        found = live_lessons_for_students(
            [self.ogrenci.id],
            on_date=self.today,
            now=self.now,
            at_time=time(8, 20),
            exclude_sinif_ids=[self.sinif.id],
        )
        self.assertEqual(found, {})

    def test_birebir_overrides_group(self):
        program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ogrenci=self.ogrenci,
            baslangic_tarihi=self.today,
            durum=ProgramDurumu.AKTIF,
        )
        BirebirDersOturumu.objects.create(
            program=program,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            session_date=self.today,
            start_time=time(8, 0),
            end_time=time(8, 40),
            durum=OturumDurumu.PLANLANDI,
        )
        found = live_lessons_for_students(
            [self.ogrenci.id],
            on_date=self.today,
            now=self.now,
            at_time=time(8, 20),
        )
        self.assertEqual(found[self.ogrenci.id]['ders_turu'], 'BIREBIR')

    def test_serialize_and_api_include_canli_ders(self):
        records = list(AttendanceRecord.objects.filter(attendance_session=self.session))
        payload = _serialize_attendance_records(records, now=self.now)
        self.assertTrue(payload[0]['canli_ders']['derste'])
        self.assertEqual(payload[0]['canli_ders']['ders_turu'], 'GRUP')

        self.client.force_login(self.user)
        with patch('apps.kutuphane.application.live_lesson.timezone.localtime', return_value=self.now):
            with patch('apps.kutuphane.application.live_lesson.timezone.localdate', return_value=self.today):
                res = self.client.get(
                    f'/kutuphane/api/salon/{self.library.id}/yoklama/{self.session.id}/kayit/',
                    **self.headers,
                )
        self.assertEqual(res.status_code, 200)
        row = res.json()['data'][0]
        self.assertTrue(row['canli_ders']['derste'])
        self.assertEqual(row['canli_ders']['ders_turu'], 'GRUP')
        self.assertEqual(row['canli_ders']['ders_adi'], 'Matematik')
