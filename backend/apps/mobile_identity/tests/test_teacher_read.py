import json
from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.lesson_session import LessonSession, SessionKind, SessionStatus
from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole,
)
from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.domain.program_grid_cell import CellStatus, ProgramGridCell
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.schedule_version import ScheduleVersion
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import DayOfWeek, WeeklyDay
from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.mobile_identity.models import IslenenKonu
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.ozel_ders.domain.models import BirebirHaftalikSlot, BirebirOgrenciProgrami, ProgramDurumu
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()
FIXED_NOW = datetime(2026, 10, 19, 7, 30, tzinfo=ZoneInfo('Europe/Istanbul'))


class TeacherReadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Okuma Kurum', kod='OKUMA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='OKU-A')
        self.other_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='OKU-B')
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.user = User.objects.create_user(username='okuma.ogretmen', password='Pass1234!')
        self.personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Öğretmen',
            user=self.user, aktif_mi=True,
        )
        self.other = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kemal', soyad='Diğer', aktif_mi=True,
        )
        self.assignment = PersonelGorevlendirme.objects.create(
            personel=self.personel, egitim_yili=self.year, rol=self.role,
            gorev_sube=self.sube, kurum=self.kurum, aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Güz', code='OKUGUZ', start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31), is_active=True,
        )
        self.later = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Bahar', code='OKUBAH', start_date=date(2027, 2, 1),
            end_date=date(2027, 6, 15), is_active=True, order_no=2,
        )
        self.foreign_term = Term.objects.create(
            kurum=self.kurum, sube=self.other_sube, egitim_yili=self.year,
            name='Diğer Güz', code='OKUDIG', start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31), is_active=True,
        )
        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.cycle = WeeklyCycle.objects.create(
            kurum=self.kurum, sube=self.sube, schedule_template=self.template,
            name='Takvim', is_active=True,
        )
        self.day = WeeklyDay.objects.create(
            weekly_cycle=self.cycle, day_of_week=DayOfWeek.MONDAY,
            name='Pazartesi', order=1, is_active=True,
        )
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template, name='1. Ders',
            start_time=time(8, 0), end_time=time(8, 40),
            order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        self.later_slot = TimeSlot.objects.create(
            schedule_template=self.template, name='2. Ders',
            start_time=time(14, 0), end_time=time(14, 40),
            order=2, slot_type=SlotType.LESSON, is_active=True,
        )
        self.version = ScheduleVersion.objects.create(
            egitim_yili=self.year, term=self.term, schedule_template=self.template,
            weekly_cycle=self.cycle, name='Aktif', is_active=True, is_locked=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MATOKU', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, ad='12-A', aktif_mi=True,
        )
        self.other_sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, ad='12-B', aktif_mi=True,
        )
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year, term=self.term, sinif=self.sinif, ders=self.ders,
            weekly_hours=4, ogretmen=self.personel,
        )
        self.other_plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year, term=self.term, sinif=self.other_sinif, ders=self.ders,
            weekly_hours=2, ogretmen=self.other,
        )
        self.group = ClassroomGroup.objects.create(classroom=self.sinif, name='A grubu', is_active=True)
        ProgramGridCell.objects.create(
            schedule_template=self.template, weekly_cycle=self.cycle,
            schedule_version=self.version, weekly_day=self.day, timeslot=self.slot,
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            class_lesson_plan=self.plan, status=CellStatus.FILLED, is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template, weekly_cycle=self.cycle,
            schedule_version=self.version, weekly_day=self.day, timeslot=self.later_slot,
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            class_lesson_plan=self.plan, status=CellStatus.FILLED, is_active=True,
        )
        ProgramGridCell.objects.create(
            schedule_template=self.template, weekly_cycle=self.cycle,
            schedule_version=self.version, weekly_day=self.day, timeslot=self.slot,
            sinif=self.other_sinif, ders=self.ders, ogretmen=self.other,
            class_lesson_plan=self.other_plan, status=CellStatus.FILLED, is_active=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Deniz', soyad='Yılmaz',
            tc_kimlik_no='10000000146', telefon='5550000000', email='deniz@ornek.test',
            adres='Gizli adres', veli_ad_soyad='Veli Gizli', veli_telefon='5551111111',
        )
        self.other_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Kaya',
        )
        self.private_student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Demir',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student, kurum=self.kurum, sube=self.sube,
            egitim_yili=self.year, okul_no='1042', aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year, term=self.term, student=self.student,
            classroom=self.sinif, group=self.group, is_active=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.year, term=self.term, student=self.other_student,
            classroom=self.other_sinif, is_active=True,
        )
        program = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, term=self.term,
            ogrenci=self.private_student, baslangic_tarihi=date(2026, 9, 1),
            durum=ProgramDurumu.AKTIF,
        )
        BirebirHaftalikSlot.objects.create(
            program=program, gun=1, baslangic=time(16, 0), bitis=time(16, 40),
            ders=self.ders, ogretmen=self.personel, aktif=True,
        )
        token = self.client.post(
            '/api/mobile/auth/token/',
            data=json.dumps({
                'username': 'okuma.ogretmen',
                'password': 'Pass1234!',
                'device_id': 'okuma-telefon',
            }),
            content_type='application/json',
        )
        self.assertEqual(token.status_code, 200, token.content)
        self.headers = {
            'HTTP_AUTHORIZATION': f"Bearer {token.json()['access']}",
            'HTTP_X_PORTAL': 'teacher',
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def _get(self, path):
        with patch('apps.mobile_identity.teacher_read._now', return_value=FIXED_NOW):
            return self.client.get(path, **self.headers)

    def test_profile_returns_only_the_signed_in_teacher(self):
        self.personel.tc_kimlik_no = '12345678901'
        self.personel.telefon = '2120000000'
        self.personel.cep_telefon = '5552223344'
        self.personel.email = 'ayse@ornek.test'
        self.personel.adres = 'Okul sokak'
        self.personel.il = 'İstanbul'
        self.personel.ilce = 'Kadıköy'
        self.personel.dogum_tarihi = date(1990, 5, 2)
        self.personel.cinsiyet = 'K'
        self.personel.notlar = 'İç not görünmez'
        self.personel.save()
        response = self._get('/api/teacher/profile/')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['ad'], 'Ayşe')
        self.assertEqual(body['soyad'], 'Öğretmen')
        self.assertEqual(body['tc_kimlik_no'], '12345678901')
        self.assertEqual(body['cep_telefon'], '5552223344')
        self.assertEqual(body['adres'], 'Okul sokak')
        self.assertEqual(body['ilce'], 'Kadıköy')
        self.assertEqual(body['dogum_tarihi'], '1990-05-02')
        self.assertEqual(body['cinsiyet'], 'Kadın')
        self.assertEqual(body['rol'], 'Öğretmen')
        self.assertIsNone(body['fotograf'])
        raw = json.dumps(body, ensure_ascii=False)
        self.assertNotIn('Kemal', raw)
        self.assertNotIn('Gizli adres', raw)
        self.assertNotIn('İç not görünmez', raw)
        self.assertNotIn('notlar', body)

    def test_terms_mark_the_term_that_contains_today(self):
        response = self._get('/api/teacher/terms/')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['timezone'], 'Europe/Istanbul')
        current = [row for row in body['results'] if row['is_current']]
        self.assertEqual([row['id'] for row in current], [self.term.id])
        self.assertNotIn(self.foreign_term.id, [row['id'] for row in body['results']])

    def test_schedule_is_self_scoped_and_keeps_wall_clock(self):
        response = self._get(
            f'/api/teacher/schedule/?term_id={self.term.id}&teacher_id={self.other.id}',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertNotIn('is_locked', json.dumps(body))
        self.assertNotIn('versions', body)
        classrooms = {
            cell['classroom']['name']
            for cell in body['cells']
            if cell['kind'] == 'class' and cell.get('classroom')
        }
        self.assertEqual(classrooms, {'12-A'})
        self.assertTrue(all(cell['start'].endswith('+03:00') for cell in body['cells']))
        self.assertTrue(any(cell['start'] == '08:00:00+03:00' for cell in body['cells']))

    def test_home_leads_with_the_next_lesson(self):
        response = self._get(f'/api/teacher/home/?term_id={self.term.id}')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['date'], '2026-10-19')
        self.assertEqual(body['weekday'], 0)
        self.assertEqual(body['next']['start'], '08:00:00+03:00')
        self.assertEqual(body['next']['lesson']['name'], 'Matematik')
        self.assertEqual(body['next']['classroom']['name'], '12-A')
        self.assertGreaterEqual(len(body['today']), 2)
        self.assertEqual(body['counts']['private'], 1)

    def test_classes_include_assistant_role_and_hide_other_plans(self):
        ClassLessonTeacherAssignment.objects.create(
            egitim_yili=self.year,
            class_lesson_plan=self.other_plan,
            ogretmen=self.personel,
            role=TeacherRole.SECONDARY,
            is_active=True,
        )
        response = self._get(f'/api/teacher/classes/?term_id={self.term.id}')
        self.assertEqual(response.status_code, 200)
        rows = {row['id']: row for row in response.json()['results']}
        self.assertEqual(rows[self.plan.id]['rol'], 'PRIMARY')
        self.assertEqual(rows[self.plan.id]['groups'], [{'id': self.group.id, 'name': 'A grubu'}])
        self.assertEqual(rows[self.other_plan.id]['rol'], 'SECONDARY')
        self.assertNotIn('credit', json.dumps(response.json()))

    def test_students_search_okul_no_and_hide_other_class(self):
        found = self._get(f'/api/teacher/students/?term_id={self.term.id}&q=1042')
        self.assertEqual(found.status_code, 200)
        body = found.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['ad'], 'Deniz')
        self.assertEqual(body['results'][0]['okul_no'], '1042')
        self.assertEqual(body['results'][0]['group_ad'], 'A grubu')
        hidden = self._get(f'/api/teacher/students/?term_id={self.term.id}&q=Mehmet')
        self.assertEqual(hidden.json()['count'], 0)
        foreign = self._get(
            f'/api/teacher/students/?term_id={self.term.id}&plan_id={self.other_plan.id}',
        )
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(foreign.json()['code'], 'not_found')

    def test_student_card_is_basic_and_other_student_is_hidden(self):
        response = self._get(
            f'/api/teacher/students/{self.student.id}/?term_id={self.term.id}&plan_id={self.plan.id}',
        )
        self.assertEqual(response.status_code, 200)
        raw = response.content.decode()
        self.assertNotIn('10000000146', raw)
        self.assertNotIn('5550000000', raw)
        self.assertNotIn('deniz@ornek.test', raw)
        self.assertNotIn('Gizli adres', raw)
        self.assertNotIn('Veli Gizli', raw)
        self.assertEqual(response.json()['dersler'][0]['ders'], 'Matematik')
        missing = self._get(
            f'/api/teacher/students/{self.other_student.id}/?term_id={self.term.id}&plan_id={self.plan.id}',
        )
        self.assertEqual(missing.status_code, 404)

    def test_private_students_are_only_this_teachers(self):
        response = self._get(f'/api/teacher/private-students/?term_id={self.term.id}')
        self.assertEqual(response.status_code, 200)
        rows = response.json()['results']
        self.assertEqual([row['ad'] for row in rows], ['Ece'])
        self.assertEqual(rows[0]['dersler'], ['Matematik'])
        self.assertNotIn('premium', json.dumps(response.json()))

    def test_removed_assignment_closes_the_read_api(self):
        self.assignment.aktif_mi = False
        self.assignment.save(update_fields=['aktif_mi'])
        response = self._get(f'/api/teacher/classes/?term_id={self.term.id}')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'teacher_not_assigned')

    def test_other_branch_term_is_not_found(self):
        response = self._get(f'/api/teacher/home/?term_id={self.foreign_term.id}')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'not_found')

    def test_schedule_shows_this_weeks_real_sessions(self):
        monday = ProgramGridCell.objects.get(
            ogretmen=self.personel, timeslot=self.slot, class_lesson_plan=self.plan,
        )
        LessonSession.objects.create(
            egitim_yili=self.year, term=self.term, schedule_version=self.version,
            source_grid_cell=monday, class_lesson_plan=self.plan,
            session_date=date(2026, 10, 19), timeslot=self.slot,
            start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            status=SessionStatus.CANCELLED, session_kind=SessionKind.REGULAR,
        )
        LessonSession.objects.create(
            egitim_yili=self.year, term=self.term,
            class_lesson_plan=self.plan, session_date=date(2026, 10, 21),
            timeslot=self.slot, start_time=time(15, 0), end_time=time(15, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            status=SessionStatus.SCHEDULED, session_kind=SessionKind.MAKEUP,
        )
        LessonSession.objects.create(
            egitim_yili=self.year, term=self.term, schedule_version=self.version,
            class_lesson_plan=self.other_plan, session_date=date(2026, 10, 19),
            timeslot=self.slot, start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.other_sinif, ders=self.ders, ogretmen=self.other,
            status=SessionStatus.CANCELLED,
        )
        LessonSession.objects.create(
            egitim_yili=self.year, term=self.term, class_lesson_plan=self.plan,
            session_date=date(2026, 10, 26), timeslot=self.slot,
            start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            status=SessionStatus.CANCELLED, is_active=True,
        )
        LessonSession.objects.create(
            egitim_yili=self.year, term=self.foreign_term, class_lesson_plan=self.plan,
            session_date=date(2026, 10, 19), timeslot=self.slot,
            start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.personel,
            status=SessionStatus.CANCELLED,
        )
        response = self._get(f'/api/teacher/schedule/?term_id={self.term.id}')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['week'], {'start': '2026-10-19', 'end': '2026-10-25'})
        morning = next(
            cell for cell in body['cells']
            if cell['start'] == '08:00:00+03:00' and cell['classroom'] and cell['classroom']['name'] == '12-A'
        )
        self.assertEqual(morning['session']['status'], 'CANCELLED')
        self.assertEqual(morning['session']['status_label'], 'İptal')
        self.assertEqual(morning['session']['date'], '2026-10-19')
        later = next(cell for cell in body['cells'] if cell['start'] == '14:00:00+03:00')
        self.assertIsNone(later['session'])
        makeup = next(cell for cell in body['cells'] if cell['start'] == '15:00:00+03:00')
        self.assertEqual(makeup['day_id'], 2)
        self.assertEqual(makeup['session']['kind'], 'MAKEUP')
        self.assertEqual(makeup['session']['kind_label'], 'Telafi')
        self.assertEqual(makeup['classroom']['name'], '12-A')
        self.assertFalse(any(
            cell.get('classroom') and cell['classroom']['name'] == '12-B' and cell.get('session')
            for cell in body['cells']
        ))
        self.assertFalse(any(cell.get('session') and cell['session']['date'] == '2026-10-26' for cell in body['cells']))

    def test_schedule_marks_this_weeks_topic_on_the_matching_lesson(self):
        monday = ProgramGridCell.objects.get(
            ogretmen=self.personel, timeslot=self.slot, class_lesson_plan=self.plan,
        )
        IslenenKonu.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, term=self.term,
            class_lesson_plan=self.plan, ogretmen=self.personel,
            session_date=date(2026, 10, 19), program_grid_cell=monday,
            note='Türev', created_by=self.user,
        )
        IslenenKonu.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, term=self.term,
            class_lesson_plan=self.plan, ogretmen=self.other,
            session_date=date(2026, 10, 19), program_grid_cell=monday,
            note='Başkasının notu', created_by=self.user,
        )
        IslenenKonu.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, term=self.term,
            class_lesson_plan=self.plan, ogretmen=self.personel,
            session_date=date(2026, 10, 26), program_grid_cell=monday,
            note='Gelecek hafta', created_by=self.user,
        )
        response = self._get(f'/api/teacher/schedule/?term_id={self.term.id}')
        body = response.json()
        morning = next(
            cell for cell in body['cells']
            if cell['start'] == '08:00:00+03:00' and cell['classroom'] and cell['classroom']['name'] == '12-A'
        )
        self.assertEqual(morning['topic'], {'name': 'Türev'})
        later = next(cell for cell in body['cells'] if cell['start'] == '14:00:00+03:00')
        self.assertIsNone(later['topic'])
        self.assertNotIn('Başkasının notu', response.content.decode())
        self.assertNotIn('Gelecek hafta', response.content.decode())

    def test_homework_route_stays_closed(self):
        response = self.client.get(
            f'/api/teacher/students/{self.student.id}/homework/?term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(response.status_code, 404)

    def _site_headers(self):
        return {
            'HTTP_X_PORTAL': 'teacher',
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_website_session_reads_home_without_a_mobile_token(self):
        self.client.force_login(self.user)
        response = self.client.get(
            f'/api/teacher/home/?term_id={self.term.id}',
            **self._site_headers(),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn('today', response.json())
        context = self.client.get('/api/teacher/context/', **self._site_headers())
        self.assertEqual(context.status_code, 200, context.content)
        self.assertTrue(any(row['id'] == self.sube.id for row in context.json()['subeler']))

    def test_website_session_without_portal_header_is_rejected(self):
        self.client.force_login(self.user)
        headers = self._site_headers()
        headers.pop('HTTP_X_PORTAL')
        response = self.client.get(f'/api/teacher/home/?term_id={self.term.id}', **headers)
        self.assertEqual(response.status_code, 403, response.content)

    def test_website_session_write_without_csrf_is_rejected(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        response = client.post(
            '/api/teacher/boards/',
            data=json.dumps({'code': 'AAAAAAAA'}),
            content_type='application/json',
            **self._site_headers(),
        )
        self.assertEqual(response.status_code, 403, response.content)

    def test_anonymous_website_call_is_rejected(self):
        response = Client().get('/api/teacher/home/?term_id=1', **self._site_headers())
        self.assertEqual(response.status_code, 401, response.content)
