from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.lock_utils import (
    CONTROL_LOCK_MESSAGE,
    can_override_assignment_control_lock,
    is_assignment_control_locked,
)
from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class AssignmentControlLockTest(TestCase):
    def setUp(self):
        kurum = Kurum.objects.create(ad='K', kod='K')
        sube = Sube.objects.create(kurum=kurum, ad='S', kod='S')
        self.student = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.coach = User.objects.create_user(
            username='coach', email='coach@test.com', password='testpass123',
        )
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.credentials(HTTP_X_KURUM_ID=str(kurum.id), HTTP_X_SUBE_ID=str(sube.id))

        self.assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Kilit Test',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() - timezone.timedelta(days=2),
            completion_percent=100,
        )
        self.lesson = AssignmentLesson.objects.create(assignment=self.assignment, order=0)
        self.task = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev',
            order=0,
            completion_status='DONE',
            task_completion_percent=100,
            evaluated_at=timezone.now(),
        )

    def test_locked_after_control_day_passed(self):
        self.assertTrue(is_assignment_control_locked(self.assignment))

    def test_not_locked_on_control_day(self):
        self.assignment.due_date = timezone.now()
        self.assignment.save(update_fields=['due_date', 'updated_at'])
        self.assertFalse(is_assignment_control_locked(self.assignment))

    def test_not_locked_without_evaluation(self):
        self.task.completion_status = 'PENDING'
        self.task.evaluated_at = None
        self.task.save()
        self.assertFalse(is_assignment_control_locked(self.assignment))

    def test_destroy_blocked_when_locked(self):
        response = self.client.delete(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/',
            {'deletion_reason': 'Test amaçlı silme denemesi kilitli.'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn(CONTROL_LOCK_MESSAGE, response.json()['error'])

    def test_reset_all_tasks_blocked_when_locked(self):
        response = self.client.post(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/reset_all_tasks/',
        )
        self.assertEqual(response.status_code, 403)

    def test_update_task_status_blocked_when_locked(self):
        response = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{self.task.id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'task_completion_percent': 50},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_detail_includes_is_control_locked(self):
        response = self.client.get(f'{ASSIGNMENTS_URL}{self.assignment.id}/')
        self.assertEqual(response.status_code, 200)
        payload = response.json().get('data', response.json())
        self.assertTrue(payload['is_control_locked'])
        self.assertFalse(payload['can_override_control_lock'])

    def test_postpone_accepts_iso_z_datetime(self):
        self.assignment.due_date = timezone.now() + timedelta(days=1)
        self.assignment.postpone_count = 0
        self.assignment.max_postpone = 3
        self.assignment.save(update_fields=['due_date', 'postpone_count', 'max_postpone', 'updated_at'])
        self.task.completion_status = 'PENDING'
        self.task.evaluated_at = None
        self.task.save()

        new_due = (timezone.now() + timedelta(days=5)).strftime('%Y-%m-%dT23:59:00Z')
        response = self.client.post(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/postpone/',
            {'new_due_date': new_due, 'reason': 'Sınav haftası'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.postpone_count, 1)
        self.assertGreater(self.assignment.due_date, timezone.now())

    def test_coach_cannot_reactivate(self):
        new_due = (timezone.now() + timedelta(days=7)).isoformat()
        response = self.client.post(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/reactivate/',
            {'new_due_date': new_due, 'reason': 'Koç denemesi'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_edit_locked_assignment(self):
        self.assertTrue(can_override_assignment_control_lock(self.admin))
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{self.task.id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'task_completion_percent': 50},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.task.refresh_from_db()
        self.assertEqual(self.task.completion_status, 'PARTIAL')

    def test_admin_reactivate_reopens_assignment(self):
        self.assignment.status = ManualAssignment.Status.COMPLETED
        self.assignment.completed_date = timezone.now() - timedelta(days=1)
        self.assignment.non_submission_reason = 'NOT_BROUGHT'
        self.assignment.save()

        self.client.force_authenticate(user=self.admin)
        new_due = timezone.now() + timedelta(days=7)
        response = self.client.post(
            f'{ASSIGNMENTS_URL}{self.assignment.id}/reactivate/',
            {'new_due_date': new_due.isoformat(), 'reason': 'Sonraki hafta eklenecek'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()['data']
        self.assertFalse(payload['is_control_locked'])
        self.assertTrue(payload['can_override_control_lock'])

        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.postpone_count, 0)
        self.assertEqual(self.assignment.status, ManualAssignment.Status.IN_PROGRESS)
        self.assertIsNone(self.assignment.completed_date)
        self.assertEqual(self.assignment.non_submission_reason, '')
        self.assertEqual(
            timezone.localtime(self.assignment.due_date).date(),
            timezone.localtime(new_due).date(),
        )

        self.client.force_authenticate(user=self.coach)
        coach_update = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{self.task.id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'task_completion_percent': 40},
            format='json',
        )
        self.assertEqual(coach_update.status_code, 200)
