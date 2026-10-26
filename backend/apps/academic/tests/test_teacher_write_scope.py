"""Salt öğretmen başka öğretmenin planına ve oturumuna yazamaz.

sinif.write durur. Yönetici (sinif.manage) yazması sürer.
"""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.lesson_session import LessonSession
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.timeslot import SlotType, TimeSlot
from apps.egitim_tanimlari.models import Ders
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class TeacherAcademicWriteScopeTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Kapsam Kurum', kod='KAPSAM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KAP-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        self.term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            name='Güz', code='KAPGUZ', start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31), is_active=True,
        )
        self.teacher_role = Role.objects.get(code='ogretmen')
        self.manager_role = Role.objects.get(code='egitim_yoneticisi')
        self.teacher_user = User.objects.create_user(username='kapsam.ogretmen', password='Pass1234!')
        self.manager_user = User.objects.create_user(username='kapsam.yonetici', password='Pass1234!')
        UserRole.objects.create(user=self.teacher_user, role=self.teacher_role, kurum=self.kurum)
        UserRole.objects.create(user=self.manager_user, role=self.manager_role, kurum=self.kurum)
        self.teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Öğretmen',
            user=self.teacher_user, aktif_mi=True,
        )
        self.other = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Kemal', soyad='Diğer', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='KAPMAT', aktif_mi=True,
        )
        self.other_ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fizik', kod='KAPFIZ', aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.year, ad='9-A', aktif_mi=True,
        )
        self.own_plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year, term=self.term, sinif=self.sinif, ders=self.ders,
            weekly_hours=4, ogretmen=self.teacher,
        )
        self.other_plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year, term=self.term, sinif=self.sinif, ders=self.other_ders,
            weekly_hours=2, ogretmen=self.other,
        )
        self.template = ScheduleTemplate.objects.create(
            kurum=self.kurum, sube=self.sube, name='Şablon',
        )
        self.slot = TimeSlot.objects.create(
            schedule_template=self.template, name='1. Ders',
            start_time=time(8, 0), end_time=time(8, 40),
            order=1, slot_type=SlotType.LESSON, is_active=True,
        )
        self.other_session = LessonSession.objects.create(
            egitim_yili=self.year, term=self.term, session_date=date(2026, 10, 19),
            timeslot=self.slot, start_time=time(8, 0), end_time=time(8, 40),
            sinif=self.sinif, ders=self.ders, ogretmen=self.other,
            class_lesson_plan=self.other_plan,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_sinif_write_remains_on_the_teacher_role(self):
        self.assertTrue(self.teacher_role.has_permission('sinif.write'))
        self.assertFalse(self.teacher_role.has_permission('sinif.manage'))

    def test_teacher_updates_own_plan_and_not_another(self):
        self.client.force_login(self.teacher_user)
        own = self.client.patch(
            f'/api/academic/class-lesson-plan/{self.own_plan.id}/update/',
            data={'weekly_hours': 5},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(own.status_code, 200, own.content)
        self.own_plan.refresh_from_db()
        self.assertEqual(self.own_plan.weekly_hours, 5)

        foreign = self.client.patch(
            f'/api/academic/class-lesson-plan/{self.other_plan.id}/update/',
            data={'weekly_hours': 9},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(foreign.status_code, 403, foreign.content)
        self.other_plan.refresh_from_db()
        self.assertEqual(self.other_plan.weekly_hours, 2)

        listed = self.client.get('/api/academic/class-lesson-plan/?all=true', **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)

    def test_teacher_cannot_open_branch_writes_or_another_session(self):
        self.client.force_login(self.teacher_user)
        created = self.client.post(
            '/api/academic/class-lesson-plan/create/',
            data={
                'term': self.term.id,
                'sinif': self.sinif.id,
                'ders': self.ders.id,
                'weekly_hours': 2,
                'ogretmen': self.other.id,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(created.status_code, 403, created.content)
        template = self.client.post(
            '/api/academic/schedule-templates/create/',
            data={'name': 'Öğretmen şablonu'},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(template.status_code, 403, template.content)
        action = self.client.post(
            f'/api/academic/lesson-sessions/{self.other_session.id}/cancel/',
            data={},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(action.status_code, 403, action.content)
        self.other_session.refresh_from_db()
        self.assertNotEqual(self.other_session.status, 'CANCELLED')

    def test_manager_still_updates_another_teachers_plan(self):
        self.client.force_login(self.manager_user)
        response = self.client.patch(
            f'/api/academic/class-lesson-plan/{self.other_plan.id}/update/',
            data={'weekly_hours': 6},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.other_plan.refresh_from_db()
        self.assertEqual(self.other_plan.weekly_hours, 6)
