from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import AssignmentLesson, ManualAssignment
from apps.coaching.study_program.models import ProgramBlock, ProgramDay, WeeklyProgram
from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

HOMEWORK_POOL_URL = '/api/coaching/study-program/programs/homework-pool/'


class HomeworkPoolUnplannedFilterTest(TestCase):
    """homework-pool is_planned ve status=unplanned filtre davranışı."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Program Kurum', kod='SPK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_pool',
            email='coach_pool@test.com',
            password='testpass123',
        )
        self.ders_mat = Ders.objects.create(ad='Matematik', kod='MAT')
        self.ders_fiz = Ders.objects.create(ad='Fizik', kod='FIZ')
        self.due_date = timezone.now() + timedelta(days=7)

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)

        week_start = date.today()
        week_end = week_start + timedelta(days=6)
        self.program = WeeklyProgram.objects.create(
            student=self.student,
            coach=self.coach,
            week_start=week_start,
            week_end=week_end,
        )
        self.program_day = ProgramDay.objects.create(
            program=self.program,
            day_date=week_start,
            weekday=0,
        )

    def _pool_url(self, **params):
        query = '&'.join(f'{k}={v}' for k, v in params.items())
        return f'{HOMEWORK_POOL_URL}?{query}'

    def _create_multi_lesson_assignment(self):
        assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Çok Dersli Ödev',
            status='ASSIGNED',
            due_date=self.due_date,
            is_active=True,
        )
        lesson_mat = AssignmentLesson.objects.create(
            assignment=assignment,
            lesson=self.ders_mat,
            order=0,
        )
        lesson_fiz = AssignmentLesson.objects.create(
            assignment=assignment,
            lesson=self.ders_fiz,
            order=1,
        )
        return assignment, lesson_mat, lesson_fiz

    def _create_no_lesson_assignment(self):
        return ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Derssiz Ödev',
            status='ASSIGNED',
            due_date=self.due_date,
            is_active=True,
        )

    def test_multi_lesson_only_planned_lesson_marked(self):
        assignment, lesson_mat, lesson_fiz = self._create_multi_lesson_assignment()
        ProgramBlock.objects.create(
            day=self.program_day,
            source_assignment=assignment,
            source_lesson=lesson_mat,
            title=assignment.title,
        )

        response = self.client.get(self._pool_url(
            student_id=self.student.id,
            program_id=self.program.id,
        ))

        self.assertEqual(response.status_code, 200)
        by_lesson = {item['lesson_id']: item for item in response.data}
        self.assertTrue(by_lesson[lesson_mat.id]['is_planned'])
        self.assertFalse(by_lesson[lesson_fiz.id]['is_planned'])

    def test_unplanned_filter_excludes_planned_items(self):
        assignment, lesson_mat, lesson_fiz = self._create_multi_lesson_assignment()
        ProgramBlock.objects.create(
            day=self.program_day,
            source_assignment=assignment,
            source_lesson=lesson_mat,
            title=assignment.title,
        )

        response = self.client.get(self._pool_url(
            student_id=self.student.id,
            program_id=self.program.id,
            status='unplanned',
        ))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['lesson_id'], lesson_fiz.id)
        self.assertFalse(response.data[0]['is_planned'])

    def test_no_lesson_assignment_uses_assignment_none_pair(self):
        assignment = self._create_no_lesson_assignment()

        response = self.client.get(self._pool_url(
            student_id=self.student.id,
            program_id=self.program.id,
        ))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertFalse(response.data[0]['is_planned'])

        ProgramBlock.objects.create(
            day=self.program_day,
            source_assignment=assignment,
            source_lesson=None,
            title=assignment.title,
        )

        response = self.client.get(self._pool_url(
            student_id=self.student.id,
            program_id=self.program.id,
        ))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]['is_planned'])

        response = self.client.get(self._pool_url(
            student_id=self.student.id,
            program_id=self.program.id,
            status='unplanned',
        ))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)
