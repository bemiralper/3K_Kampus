"""Öğretmen atamaları — görevlendirme, PRIMARY sync, şube izolasyonu."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole,
)
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class ClassLessonTeacherAssignmentApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='CLTA Kurum', kod='CLTA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='CLTA-A')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='cltauser', password='test')
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.client.force_login(self.user)

        self.role, _ = Role.objects.get_or_create(
            code='ogretmen',
            defaults={'name': 'Öğretmen', 'is_system_role': True},
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9. Sınıf', kod='9', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT', aktif_mi=True,
        )
        self.ders.sinif_seviyeleri.add(self.seviye)

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
        self.plan = ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders,
            weekly_hours=4,
        )

        self.teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.teacher,
            egitim_yili=self.year,
            rol=self.role,
            gorev_sube=self.sube,
            kurum=self.kurum,
            aktif_mi=True,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_roles_endpoint(self):
        res = self.client.get('/api/academic/class-lesson-teachers/roles/', **self.headers)
        self.assertEqual(res.status_code, 200)
        values = {r['value'] for r in res.json()['roles']}
        self.assertIn('PRIMARY', values)

    def test_create_primary_syncs_plan_ogretmen(self):
        res = self.client.post(
            '/api/academic/class-lesson-teachers/create/',
            data={
                'class_lesson_plan_id': self.plan.id,
                'ogretmen_id': self.teacher.id,
                'role': 'PRIMARY',
                'priority': 1,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.ogretmen_id, self.teacher.id)

    def test_create_rejects_without_gorevlendirme(self):
        other = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mehmet', soyad='Demir', aktif_mi=True,
        )
        res = self.client.post(
            '/api/academic/class-lesson-teachers/create/',
            data={
                'class_lesson_plan_id': self.plan.id,
                'ogretmen_id': other.id,
                'role': 'PRIMARY',
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_create_rejects_when_schedule_locked(self):
        self.term.schedule_locked = True
        self.term.save(update_fields=['schedule_locked'])
        res = self.client.post(
            '/api/academic/class-lesson-teachers/create/',
            data={
                'class_lesson_plan_id': self.plan.id,
                'ogretmen_id': self.teacher.id,
                'role': 'PRIMARY',
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_delete_primary_clears_plan_ogretmen(self):
        assignment = ClassLessonTeacherAssignment.objects.create(
            egitim_yili=self.year,
            class_lesson_plan=self.plan,
            ogretmen=self.teacher,
            role=TeacherRole.PRIMARY,
            priority=1,
        )
        self.plan.ogretmen = self.teacher
        self.plan.save(update_fields=['ogretmen'])

        res = self.client.delete(
            f'/api/academic/class-lesson-teachers/{assignment.id}/delete/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.plan.refresh_from_db()
        self.assertIsNone(self.plan.ogretmen_id)

    def test_list_by_plan(self):
        ClassLessonTeacherAssignment.objects.create(
            egitim_yili=self.year,
            class_lesson_plan=self.plan,
            ogretmen=self.teacher,
            role=TeacherRole.PRIMARY,
            priority=1,
        )
        res = self.client.get(
            f'/api/academic/class-lesson-teachers/?plan_id={self.plan.id}',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 1)
