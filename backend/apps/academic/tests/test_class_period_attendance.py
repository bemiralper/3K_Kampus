"""Günlük sınıf yoklama — periyot tespiti, kayıt, bildirim önizleme."""
from datetime import date, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.class_period_attendance import (
    ClassAttendanceNotifySource,
    ClassPeriodAttendanceRecord,
    ClassPeriodAttendanceSession,
    ClassPeriodCode,
)
from apps.academic.domain.lesson_attendance import StudentAttendanceStatus
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.academic.services.class_period_attendance_service import (
    classify_period,
    lunch_split_time,
    periods_available_for_date,
)
from apps.communication.application.notification_events import get_event
from apps.communication.domain.enums import RecipientType
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class ClassifyPeriodTest(TestCase):
    def test_lunch_boundary(self):
        self.assertEqual(
            classify_period(time(9, 0), lunch_start=time(12, 20)),
            ClassPeriodCode.MORNING,
        )
        self.assertEqual(
            classify_period(time(13, 0), lunch_start=time(12, 20)),
            ClassPeriodCode.AFTERNOON,
        )
        self.assertEqual(
            classify_period(time(16, 59), lunch_start=time(12, 20)),
            ClassPeriodCode.AFTERNOON,
        )
        self.assertEqual(
            classify_period(time(17, 0), lunch_start=time(12, 20)),
            ClassPeriodCode.EVENING,
        )
        self.assertEqual(
            classify_period(time(18, 30), lunch_start=time(12, 20)),
            ClassPeriodCode.EVENING,
        )

    def test_noon_fallback(self):
        self.assertEqual(classify_period(time(11, 59), lunch_start=None), ClassPeriodCode.MORNING)
        self.assertEqual(classify_period(time(12, 0), lunch_start=None), ClassPeriodCode.AFTERNOON)
        self.assertEqual(classify_period(time(17, 0), lunch_start=None), ClassPeriodCode.EVENING)


class EmptyDayPeriodTest(TestCase):
    """Dersi olmayan günde SQL sızdırmadan bilgilendirme dönmeli."""

    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Empty Kurum', kod='EMP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='EMP-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='emptyuser', password='test')
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_login(self.user)
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
        WeeklyDay.objects.create(
            weekly_cycle=self.cycle,
            day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi',
            order=1,
            is_active=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-B',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='GUZ',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
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
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_no_lessons_returns_info_not_sql(self):
        res = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': '2025-09-01',
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body['sessions'], [])
        self.assertTrue(body.get('yoklama_kapali'))
        self.assertIn('dersi yok', (body.get('info') or '').lower())
        self.assertNotIn('relation', (body.get('info') or '').lower())
        self.assertNotIn('does not exist', str(body).lower())


class ClassPeriodAttendanceApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='CPA Kurum', kod='CPA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='CPA-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='cpauser', password='test')
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_login(self.user)

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
            day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi',
            order=1,
            is_active=True,
        )
        self.slot_am = TimeSlot.objects.create(
            schedule_template=self.template,
            name='1. Ders',
            start_time=time(8, 0),
            end_time=time(8, 40),
            order=1,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        self.slot_lunch = TimeSlot.objects.create(
            schedule_template=self.template,
            name='Öğle',
            start_time=time(12, 10),
            end_time=time(12, 50),
            order=5,
            slot_type=SlotType.LUNCH_BREAK,
            is_active=True,
        )
        self.slot_pm = TimeSlot.objects.create(
            schedule_template=self.template,
            name='6. Ders',
            start_time=time(13, 0),
            end_time=time(13, 40),
            order=6,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        self.assertEqual(lunch_split_time(self.template.id), time(12, 10))

        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9', kod='9', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            name='Güz',
            code='GUZ',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
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
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders,
            weekly_hours=4,
        )
        role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.teacher,
            egitim_yili=self.year,
            rol=role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
            telefon='05551112233',
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            ad='Mehmet',
            soyad='Yılmaz',
            veli_turu='baba',
            telefon='05559998877',
            varsayilan=True,
            sms_bildirimleri=['devamsizlik', 'duyuru'],
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year,
            term=self.term,
            student=self.ogrenci,
            classroom=self.sinif,
            is_active=True,
        )
        self.monday = date(2025, 9, 1)
        for slot in (self.slot_am, self.slot_pm):
            ProgramGridCell.objects.create(
                schedule_template=self.template,
                weekly_cycle=self.cycle,
                schedule_version=self.version,
                weekly_day=self.day,
                timeslot=slot,
                sinif=self.sinif,
                ders=self.ders,
                ogretmen=self.teacher,
                class_lesson_plan=self.plan,
                status=CellStatus.FILLED,
                is_active=True,
            )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_event_catalog_includes_ogrenci(self):
        for key in ('yoklama.gelmedi', 'yoklama.gec', 'sinif.yoklama.gelmedi', 'sinif.yoklama.gec'):
            event = get_event(key)
            self.assertIn(RecipientType.OGRENCI, event.recipients)
            self.assertIn(RecipientType.OGRENCI, event.default_bodies)
        kutuphane = get_event('yoklama.gelmedi')
        sinif = get_event('sinif.yoklama.gelmedi')
        self.assertEqual(kutuphane.group, 'kutuphane')
        self.assertEqual(sinif.group, 'sinif')
        self.assertNotEqual(kutuphane.meta_name_base, sinif.meta_name_base)

    def test_ensure_creates_morning_and_afternoon(self):
        res = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        periods = {p['period'] for p in body['periods']}
        self.assertEqual(periods, {ClassPeriodCode.MORNING, ClassPeriodCode.AFTERNOON})
        self.assertEqual(len(body['sessions']), 2)
        self.assertEqual(
            ClassPeriodAttendanceSession.objects.filter(sinif=self.sinif).count(),
            2,
        )

    def test_second_calendar_does_not_hide_the_other_days(self):
        """Sınıf iki takvimdeyse yoklama, dersin olduğu takvimi kullanır."""
        cycle_b = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=self.template,
            name='Sadece Salı',
            is_active=True,
        )
        tuesday = WeeklyDay.objects.create(
            weekly_cycle=cycle_b,
            day_of_week=DayOfWeek.TUESDAY,
            name='Salı',
            order=2,
            is_active=True,
        )
        later = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=self.template,
            weekly_cycle=cycle_b,
            name='İkinci takvim',
            is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=cycle_b,
            schedule_version=later,
            weekly_day=tuesday,
            timeslot=self.slot_am,
            sinif=self.sinif,
            ders=self.ders,
            ogretmen=self.teacher,
            class_lesson_plan=self.plan,
            status=CellStatus.FILLED,
            is_active=True,
        )
        monday = periods_available_for_date(
            term_id=self.term.id,
            session_date=self.monday,
            classroom_id=self.sinif.id,
        )
        self.assertEqual(
            {row['period'] for row in monday},
            {ClassPeriodCode.MORNING, ClassPeriodCode.AFTERNOON},
        )
        tuesday_rows = periods_available_for_date(
            term_id=self.term.id,
            session_date=date(2025, 9, 2),
            classroom_id=self.sinif.id,
        )
        self.assertEqual(
            {row['period'] for row in tuesday_rows},
            {ClassPeriodCode.MORNING},
        )

    def test_lessons_from_17_open_evening_and_keep_saved_marks(self):
        ProgramGridCell.objects.filter(timeslot=self.slot_pm, sinif=self.sinif).update(is_active=False)
        slot_eve = TimeSlot.objects.create(
            schedule_template=self.template,
            name='Akşam',
            start_time=time(17, 30),
            end_time=time(18, 10),
            order=12,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            schedule_version=self.version,
            weekly_day=self.day,
            timeslot=slot_eve,
            sinif=self.sinif,
            ders=self.ders,
            ogretmen=self.teacher,
            class_lesson_plan=self.plan,
            status=CellStatus.FILLED,
            is_active=True,
        )
        stale = ClassPeriodAttendanceSession.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            session_date=self.monday,
            period=ClassPeriodCode.AFTERNOON,
        )
        rec = ClassPeriodAttendanceRecord.objects.create(
            session=stale,
            student=self.ogrenci,
            status=StudentAttendanceStatus.EXCUSED,
            izinli_mi=True,
        )
        res = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        periods = {p['period'] for p in res.json()['periods']}
        self.assertEqual(periods, {ClassPeriodCode.MORNING, ClassPeriodCode.EVENING})
        labels = {p['period']: p['period_label'] for p in res.json()['periods']}
        self.assertEqual(labels[ClassPeriodCode.EVENING], 'Akşam')
        self.assertEqual(labels[ClassPeriodCode.MORNING], 'Sabah')
        stale.refresh_from_db()
        rec.refresh_from_db()
        self.assertEqual(stale.period, ClassPeriodCode.EVENING)
        self.assertEqual(rec.status, StudentAttendanceStatus.PRESENT)
        self.assertFalse(rec.izinli_mi)

    def test_ensure_without_version_uses_classroom_own_calendar(self):
        """
        Sınıf, dönemin aktif programı dışındaki bir takvimdeyse bile günlük
        yoklama açılmalı: program verilmediğinde sınıfın kendi programı bulunur.
        """
        template2 = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Hafta Sonu Şablonu',
        )
        cycle2 = WeeklyCycle.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            schedule_template=template2,
            name='Hafta Sonu',
            is_active=False,
        )
        day2 = WeeklyDay.objects.create(
            weekly_cycle=cycle2,
            day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi',
            order=1,
            is_active=True,
        )
        slot2 = TimeSlot.objects.create(
            schedule_template=template2,
            name='1. Ders',
            start_time=time(9, 0),
            end_time=time(9, 40),
            order=1,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        version2 = ScheduleVersion.objects.create(
            egitim_yili=self.year,
            term=self.term,
            schedule_template=template2,
            weekly_cycle=cycle2,
            name='Hafta Sonu Programı',
            is_active=False,
        )
        sinif2 = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-C',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=template2,
            weekly_cycle=cycle2,
            schedule_version=version2,
            weekly_day=day2,
            timeslot=slot2,
            sinif=sinif2,
            ders=self.ders,
            ogretmen=self.teacher,
            status=CellStatus.FILLED,
            is_active=True,
        )

        res = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': sinif2.id,
                'date': self.monday.isoformat(),
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(
            {p['period'] for p in body['periods']},
            {ClassPeriodCode.MORNING},
        )
        self.assertEqual(len(body['sessions']), 1)

    def test_save_period_roster_and_notify_preview_default_veli(self):
        ensure = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        ).json()
        morning_id = next(
            s['id'] for s in ensure['sessions'] if s['period'] == ClassPeriodCode.MORNING
        )
        save = self.client.post(
            f'/api/academic/class-period-attendance/{morning_id}/student-attendance/',
            data={
                'records': [
                    {
                        'student_id': self.ogrenci.id,
                        'status': StudentAttendanceStatus.ABSENT,
                        'note': '',
                    },
                ],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(save.status_code, 200, save.content)
        self.assertTrue(
            ClassPeriodAttendanceRecord.objects.filter(
                session_id=morning_id,
                student=self.ogrenci,
                status=StudentAttendanceStatus.ABSENT,
            ).exists(),
        )
        roster_row = next(r for r in save.json()['roster'] if r['student_id'] == self.ogrenci.id)
        self.assertIn('profil_foto', roster_row)
        self.assertIn('canli_ders', roster_row)
        self.assertEqual(roster_row['veli_telefon'], '05559998877')
        self.assertIn('Mehmet', roster_row['veli_ad'])

        preview = self.client.post(
            '/api/academic/class-attendance/notify/preview/',
            data={
                'source_type': ClassAttendanceNotifySource.PERIOD,
                'source_id': morning_id,
                'recipient_types': ['VELI'],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        body = preview.json()
        self.assertGreaterEqual(len(body['recipients']), 1)
        self.assertTrue(all(r['recipient_type'] == 'VELI' for r in body['recipients']))
        self.assertEqual(body['recipients'][0]['status'], StudentAttendanceStatus.ABSENT)

        preview_both = self.client.post(
            '/api/academic/class-attendance/notify/preview/',
            data={
                'source_type': ClassAttendanceNotifySource.PERIOD,
                'source_id': morning_id,
                'recipient_types': ['VELI', 'OGRENCI'],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(preview_both.status_code, 200, preview_both.content)
        types = {r['recipient_type'] for r in preview_both.json()['recipients']}
        self.assertEqual(types, {'VELI', 'OGRENCI'})

    @patch(
        'apps.academic.application.class_attendance_notify_service.dispatch_event',
    )
    def test_notify_send_skips_present(self, mock_dispatch):
        from types import SimpleNamespace

        mock_dispatch.return_value = SimpleNamespace(success=True, message_id=None, errors=[])
        ensure = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        ).json()
        morning_id = next(
            s['id'] for s in ensure['sessions'] if s['period'] == ClassPeriodCode.MORNING
        )
        self.client.post(
            f'/api/academic/class-period-attendance/{morning_id}/student-attendance/',
            data={
                'records': [
                    {
                        'student_id': self.ogrenci.id,
                        'status': StudentAttendanceStatus.PRESENT,
                    },
                ],
            },
            content_type='application/json',
            **self.headers,
        )
        preview = self.client.post(
            '/api/academic/class-attendance/notify/preview/',
            data={
                'source_type': 'PERIOD',
                'source_id': morning_id,
                'recipient_types': ['VELI'],
            },
            content_type='application/json',
            **self.headers,
        ).json()
        self.assertEqual(preview['recipients'], [])
        self.assertEqual(preview['pending_count'], 0)

    def test_late_time_saved_and_used_in_notify_body(self):
        ensure = self.client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        ).json()
        morning_id = next(
            s['id'] for s in ensure['sessions'] if s['period'] == ClassPeriodCode.MORNING
        )
        save = self.client.post(
            f'/api/academic/class-period-attendance/{morning_id}/student-attendance/',
            data={
                'records': [
                    {
                        'student_id': self.ogrenci.id,
                        'status': StudentAttendanceStatus.LATE,
                        'late_time': '08:45',
                    },
                ],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(save.status_code, 200, save.content)
        rec = ClassPeriodAttendanceRecord.objects.get(
            session_id=morning_id, student=self.ogrenci,
        )
        self.assertEqual(rec.status, StudentAttendanceStatus.LATE)
        self.assertEqual(rec.late_time, time(8, 45))
        row = next(r for r in save.json()['roster'] if r['student_id'] == self.ogrenci.id)
        self.assertEqual(row['late_time'], '08:45')

        preview = self.client.post(
            '/api/academic/class-attendance/notify/preview/',
            data={
                'source_type': ClassAttendanceNotifySource.PERIOD,
                'source_id': morning_id,
                'recipient_types': ['VELI'],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        body = preview.json()['recipients'][0]['body']
        self.assertIn('08:45', body)
        self.assertIn('Değerli Velimiz', body)
        now_hm = timezone.localtime().strftime('%H:%M')
        if now_hm != '08:45':
            self.assertNotIn(now_hm, body)

    def _make_coach(self, *, username, student=None):
        from apps.coaching.models import CoachProfile, CoachStudentAssignment

        user = User.objects.create_user(username=username, password='test')
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad=username,
            tc_kimlik_no=f'{90000000000 + user.id}',
            user=user,
            aktif_mi=True,
        )
        profile = CoachProfile.objects.create(
            teacher=personel, capacity=20, is_active=True, is_coach=True,
        )
        if student is not None:
            CoachStudentAssignment.objects.create(
                coach=profile,
                student=student,
                start_date=date(2025, 9, 1),
                is_primary=True,
            )
        return user

    def test_coach_sees_every_active_year_classroom(self):
        other = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.year,
            ad='9-Z',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        coach_user = self._make_coach(username='cpa_coach', student=self.ogrenci)
        client = Client()
        client.force_login(coach_user)

        ctx = client.get(
            '/api/academic/class-period-attendance/coach-context/',
            **self.headers,
        )
        self.assertEqual(ctx.status_code, 200, ctx.content)
        classroom_ids = {c['id'] for c in ctx.json()['classrooms']}
        self.assertIn(self.sinif.id, classroom_ids)
        self.assertIn(other.id, classroom_ids)

        own = client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(own.status_code, 200, own.content)

        opened = client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': other.id,
                'date': self.monday.isoformat(),
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(opened.status_code, 200, opened.content)

    def test_coach_context_hides_other_year_and_marks_taken(self):
        old_year = EgitimYili.objects.create(
            baslangic_yil=2024, bitis_yil=2025, aktif_mi=False,
        )
        old_term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=old_year,
            name='Eski Güz',
            code='OLD',
            start_date=date(2024, 9, 1),
            end_date=date(2025, 1, 31),
            is_active=False,
        )
        old_sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=old_year,
            term=old_term,
            ad='8-K',
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        old_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Eski',
            soyad='Öğrenci',
            aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=old_year,
            term=old_term,
            student=old_student,
            classroom=old_sinif,
            is_active=True,
        )
        coach_user = self._make_coach(username='cpa_year', student=self.ogrenci)
        from apps.coaching.models import CoachProfile, CoachStudentAssignment
        profile = CoachProfile.objects.get(teacher__user=coach_user)
        CoachStudentAssignment.objects.create(
            coach=profile,
            student=old_student,
            start_date=date(2024, 9, 1),
            is_primary=True,
        )
        client = Client()
        client.force_login(coach_user)

        ctx = client.get(
            f'/api/academic/class-period-attendance/coach-context/?date={self.monday.isoformat()}',
            **self.headers,
        )
        self.assertEqual(ctx.status_code, 200, ctx.content)
        body = ctx.json()
        rows = {row['id']: row for row in body['classrooms']}
        self.assertIn(self.sinif.id, rows)
        self.assertNotIn(old_sinif.id, rows)
        self.assertEqual(body.get('date'), self.monday.isoformat())
        current = rows[self.sinif.id]
        self.assertEqual(current['term_id'], self.term.id)
        self.assertEqual(current['ogrenci_sayisi'], 1)
        self.assertEqual(current['attendance_state'], 'pending')

        ensure = client.post(
            '/api/academic/class-period-attendance/',
            data={
                'term_id': self.term.id,
                'classroom_id': self.sinif.id,
                'date': self.monday.isoformat(),
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(ensure.status_code, 200, ensure.content)
        morning = next(s for s in ensure.json()['sessions'] if s['period'] == 'MORNING')
        self.assertFalse(morning.get('taken'))
        save = client.post(
            f'/api/academic/class-period-attendance/{morning["id"]}/student-attendance/',
            data={
                'records': [{
                    'student_id': self.ogrenci.id,
                    'status': StudentAttendanceStatus.PRESENT,
                }],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(save.status_code, 200, save.content)

        after = client.get(
            f'/api/academic/class-period-attendance/coach-context/?date={self.monday.isoformat()}',
            **self.headers,
        )
        self.assertEqual(after.status_code, 200, after.content)
        after_row = next(r for r in after.json()['classrooms'] if r['id'] == self.sinif.id)
        self.assertEqual(after_row['attendance_state'], 'partial')
        morning_period = next(p for p in after_row['periods'] if p['period'] == 'MORNING')
        afternoon_period = next(p for p in after_row['periods'] if p['period'] == 'AFTERNOON')
        self.assertTrue(morning_period['taken'])
        self.assertFalse(afternoon_period['taken'])

        afternoon = next(s for s in ensure.json()['sessions'] if s['period'] == 'AFTERNOON')
        save_pm = client.post(
            f'/api/academic/class-period-attendance/{afternoon["id"]}/student-attendance/',
            data={
                'records': [{
                    'student_id': self.ogrenci.id,
                    'status': StudentAttendanceStatus.PRESENT,
                }],
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(save_pm.status_code, 200, save_pm.content)
        both = client.get(
            f'/api/academic/class-period-attendance/coach-context/?date={self.monday.isoformat()}',
            **self.headers,
        )
        self.assertEqual(both.status_code, 200, both.content)
        both_row = next(r for r in both.json()['classrooms'] if r['id'] == self.sinif.id)
        self.assertEqual(both_row['attendance_state'], 'done')
        self.assertTrue(all(p['taken'] for p in both_row['periods']))

        roster = client.get(
            f'/api/academic/class-period-attendance/coach-day-roster/?date={self.monday.isoformat()}',
            **self.headers,
        )
        self.assertEqual(roster.status_code, 200, roster.content)
        body = roster.json()
        self.assertEqual(body['counts']['present'], 2)
        self.assertEqual(body['counts']['total'], 2)
        names = {row['student_name'] for row in body['rows']}
        self.assertTrue(any('Ayşe' in name for name in names))
        self.assertEqual({row['status'] for row in body['rows']}, {'PRESENT'})
        self.assertEqual({row['period'] for row in body['rows']}, {'MORNING', 'AFTERNOON'})

        exported = client.get(
            f'/api/academic/class-period-attendance/coach-day-roster/export/?date={self.monday.isoformat()}&file_format=xlsx',
            **self.headers,
        )
        self.assertEqual(exported.status_code, 200, exported.content)
        self.assertIn('spreadsheetml', exported.get('Content-Type', ''))
