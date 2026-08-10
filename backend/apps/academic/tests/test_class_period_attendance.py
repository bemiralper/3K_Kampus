"""Günlük sınıf yoklama — periyot tespiti, kayıt, bildirim önizleme."""
from datetime import date, time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

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

    def test_noon_fallback(self):
        self.assertEqual(classify_period(time(11, 59), lunch_start=None), ClassPeriodCode.MORNING)
        self.assertEqual(classify_period(time(12, 0), lunch_start=None), ClassPeriodCode.AFTERNOON)


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
        for key in ('yoklama.gelmedi', 'yoklama.gec'):
            event = get_event(key)
            self.assertIn(RecipientType.OGRENCI, event.recipients)
            self.assertIn(RecipientType.OGRENCI, event.default_bodies)

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
