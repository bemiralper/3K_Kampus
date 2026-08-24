"""Ders Operasyonları — materialize, yoklama, ücret, revizyon."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.lesson_attendance import LessonAttendanceRecord, StudentAttendanceStatus
from apps.academic.domain.lesson_session import LessonSession, SessionKind
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_change_log import ScheduleChangeLog
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class LessonOperationsApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='LO Kurum', kod='LOK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='LOK-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='louser', password='test')
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
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template,
            name='1. Ders',
            start_time=time(8, 0),
            end_time=time(8, 40),
            order=1,
            slot_type=SlotType.LESSON,
            is_active=True,
        )

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
            name='Taslak',
            is_active=True,
        )
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders,
            weekly_hours=2,
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
        self.plan.ogretmen = self.teacher
        self.plan.save(update_fields=['ogretmen'])

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

        # 2025-09-01 Pazartesi
        self.monday = date(2025, 9, 1)
        self.cell = ProgramGridCell.objects.create(
            schedule_template=self.template,
            weekly_cycle=self.cycle,
            schedule_version=self.version,
            weekly_day=self.day,
            timeslot=self.slot,
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

    def test_meta_includes_teachers_and_dersler(self):
        res = self.client.get('/api/academic/lesson-operations/meta/', **self.headers)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(any(t['id'] == self.teacher.id for t in body['teachers']))
        self.assertTrue(any(d['id'] == self.ders.id for d in body['dersler']))

    def test_materialize_idempotent(self):
        payload = {
            'term_id': self.term.id,
            'date': self.monday.isoformat(),
            'version_id': self.version.id,
        }
        first = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data=payload,
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(first.status_code, (200, 201), first.content)
        body1 = first.json()
        self.assertEqual(body1['created_count'], 1)
        self.assertEqual(LessonSession.objects.filter(is_active=True).count(), 1)

        second = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data=payload,
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(second.status_code, 200, second.content)
        body2 = second.json()
        self.assertEqual(body2['created_count'], 0)
        self.assertEqual(body2['existing_count'], 1)
        self.assertEqual(LessonSession.objects.filter(is_active=True).count(), 1)
        self.assertTrue(ScheduleChangeLog.objects.exists())

    def test_session_lifecycle_and_teacher_attendance(self):
        mat = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data={
                'term_id': self.term.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        sid = mat.json()['sessions'][0]['id']

        start = self.client.post(
            f'/api/academic/lesson-sessions/{sid}/start/',
            data={},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(start.status_code, 200, start.content)
        self.assertEqual(start.json()['status'], 'IN_PROGRESS')

        complete = self.client.post(
            f'/api/academic/lesson-sessions/{sid}/complete/',
            data={},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(complete.status_code, 200, complete.content)
        self.assertEqual(complete.json()['status'], 'COMPLETED')

        pay = self.client.get(
            f'/api/academic/lesson-pay/summary/?term_id={self.term.id}'
            f'&date_from={self.monday.isoformat()}&date_to={self.monday.isoformat()}',
            **self.headers,
        )
        self.assertEqual(pay.status_code, 200, pay.content)
        self.assertEqual(pay.json()['totals']['session_count'], 1)

    def test_student_attendance_roster(self):
        mat = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data={
                'term_id': self.term.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        sid = mat.json()['sessions'][0]['id']

        roster = self.client.get(
            f'/api/academic/lesson-sessions/{sid}/student-attendance/',
            **self.headers,
        )
        self.assertEqual(roster.status_code, 200, roster.content)
        rows = roster.json()['roster']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['student_id'], self.ogrenci.id)

        save = self.client.post(
            f'/api/academic/lesson-sessions/{sid}/student-attendance/',
            data={
                'records': [
                    {
                        'student_id': self.ogrenci.id,
                        'status': StudentAttendanceStatus.ABSENT,
                        'note': 'İzinli değil',
                    }
                ]
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(save.status_code, 200, save.content)
        self.assertEqual(save.json()['saved'], 1)
        rec = LessonAttendanceRecord.objects.get(session_id=sid, student=self.ogrenci)
        self.assertEqual(rec.status, StudentAttendanceStatus.ABSENT)

    def test_create_extra_and_private(self):
        extra = self.client.post(
            '/api/academic/lesson-sessions/create/',
            data={
                'term_id': self.term.id,
                'schedule_version_id': self.version.id,
                'session_date': self.monday.isoformat(),
                'timeslot_id': self.slot.id,
                'ders_id': self.ders.id,
                'ogretmen_id': self.teacher.id,
                'sinif_id': self.sinif.id,
                'session_kind': SessionKind.EXTRA,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(extra.status_code, 201, extra.content)
        self.assertEqual(extra.json()['session_kind'], 'EXTRA')

        # Aynı slot/öğretmen çakışmasın diye farklı saat
        slot2 = TimeSlot.objects.create(
            schedule_template=self.template,
            name='2. Ders',
            start_time=time(9, 0),
            end_time=time(9, 40),
            order=2,
            slot_type=SlotType.LESSON,
            is_active=True,
        )
        private = self.client.post(
            '/api/academic/lesson-sessions/create/',
            data={
                'term_id': self.term.id,
                'session_date': self.monday.isoformat(),
                'timeslot_id': slot2.id,
                'ders_id': self.ders.id,
                'ogretmen_id': self.teacher.id,
                'private_student_id': self.ogrenci.id,
                'session_kind': SessionKind.PRIVATE,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(private.status_code, 201, private.content)
        self.assertEqual(private.json()['session_kind'], 'PRIVATE')
        self.assertEqual(private.json()['private_student']['id'], self.ogrenci.id)

    def _second_calendar(self):
        """İkinci bir çalışma takvimi + programı + dolu hücresi kurar."""
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
            start_time=time(14, 0),
            end_time=time(14, 40),
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
            ad='9-B',
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
        return version2, sinif2

    def test_materialize_without_version_covers_all_calendars(self):
        """Program verilmezse dönemin tüm çalışma takvimleri üretime dahil olur."""
        version2, sinif2 = self._second_calendar()

        res = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data={'term_id': self.term.id, 'date': self.monday.isoformat()},
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        body = res.json()
        self.assertEqual(body['created_count'], 2)
        self.assertEqual({v['id'] for v in body['versions']}, {self.version.id, version2.id})
        self.assertEqual(
            set(
                LessonSession.objects.filter(is_active=True).values_list('sinif_id', flat=True)
            ),
            {self.sinif.id, sinif2.id},
        )

    def test_materialize_can_target_single_calendar(self):
        """weekly_cycle_id verilirse yalnızca o takvimin programı işlenir."""
        _, sinif2 = self._second_calendar()

        res = self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data={
                'term_id': self.term.id,
                'date': self.monday.isoformat(),
                'weekly_cycle_id': self.cycle.id,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        self.assertEqual(res.json()['created_count'], 1)
        self.assertFalse(
            LessonSession.objects.filter(is_active=True, sinif_id=sinif2.id).exists(),
        )

    def test_revisions_list(self):
        self.client.post(
            '/api/academic/lesson-sessions/materialize/',
            data={
                'term_id': self.term.id,
                'date': self.monday.isoformat(),
                'version_id': self.version.id,
            },
            content_type='application/json',
            **self.headers,
        )
        res = self.client.get(
            f'/api/academic/schedule/revisions/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertGreaterEqual(res.json()['count'], 1)
