from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class MarkAllNotDoneValidationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='MND')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_mnd',
            email='coach_mnd@test.com',
            password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)

        self.assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Test Ödev',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        self.lesson = AssignmentLesson.objects.create(
            assignment=self.assignment,
            order=0,
        )
        self.task = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev A',
            question_count=20,
            page_count=10,
            order=0,
            status=AssignmentTask.TaskStatus.COMPLETED,
            completed_at=timezone.now(),
        )

    def _mark_all_not_done(self, assignment_id, **payload):
        return self.client.post(
            f'/api/coaching/manual-assignments/assignments/{assignment_id}/mark_all_not_done/',
            payload,
            format='json',
        )

    def test_mark_all_not_done_valid_reason_succeeds(self):
        response = self._mark_all_not_done(
            self.assignment.id,
            reason='NOT_BROUGHT',
            note='Ödev getirilmedi',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.non_submission_reason, 'NOT_BROUGHT')
        self.assertEqual(self.assignment.non_submission_note, 'Ödev getirilmedi')
        self.assertEqual(self.assignment.status, ManualAssignment.Status.COMPLETED)
        self.assertEqual(self.assignment.completion_percent, 0)

        self.task.refresh_from_db()
        self.assertEqual(self.task.completion_status, 'NOT_DONE')
        self.assertEqual(self.task.status, AssignmentTask.TaskStatus.NOT_DONE)
        self.assertIsNone(self.task.completed_at)
        self.assertEqual(self.task.task_completion_percent, 0)

    def test_mark_all_not_done_invalid_reason_returns_400(self):
        response = self._mark_all_not_done(
            self.assignment.id,
            reason='STUDENT_ABSENT',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])
        self.assertIn('Geçersiz ödev getirilmeme sebebi', response.json()['error'])
        self.assertIn('NOT_BROUGHT', response.json()['error'])

        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.non_submission_reason, '')
        self.assertEqual(self.assignment.status, ManualAssignment.Status.ASSIGNED)

        self.task.refresh_from_db()
        self.assertEqual(self.task.status, AssignmentTask.TaskStatus.COMPLETED)
        self.assertIsNotNone(self.task.completed_at)

    def test_mark_all_not_done_default_reason_other(self):
        response = self._mark_all_not_done(self.assignment.id)

        self.assertEqual(response.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.non_submission_reason, 'OTHER')

        response_empty = self._mark_all_not_done(
            self.assignment.id,
            reason='',
        )
        self.assertEqual(response_empty.status_code, 200)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.non_submission_reason, 'OTHER')
