from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.assignment_manual.serializers import ManualAssignmentDetailSerializer
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class AssignmentCompletionPercentTest(TestCase):
    """Tek kaynak: _update_assignment_completion (task_completion_percent ortalaması)."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='CMP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach',
            email='coach@test.com',
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
        self.task_a = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev A',
            question_count=20,
            page_count=10,
            order=0,
        )
        self.task_b = AssignmentTask.objects.create(
            lesson_block=self.lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev B',
            question_count=30,
            page_count=15,
            order=1,
        )

    def _update_task_status(self, task_id, **payload):
        return self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
            payload,
            format='json',
        )

    def _mark_completed(self, task_id, **payload):
        return self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/mark_completed/',
            payload,
            format='json',
        )

    def test_update_task_status_partial_updates_assignment_avg(self):
        """PARTIAL görevler ağırlıklı ortalamaya dahil edilir (sayım değil)."""
        self.assertEqual(self._update_task_status(
            self.task_a.id,
            completion_status='PARTIAL',
            task_completion_percent=70,
        ).status_code, 200)
        self.assertEqual(self._update_task_status(
            self.task_b.id,
            completion_status='DONE',
        ).status_code, 200)

        self.assignment.refresh_from_db()
        # (70 + 100) / 2 = 85
        self.assertEqual(self.assignment.completion_percent, 85)

    def test_mark_completed_delegates_same_as_done(self):
        """mark_completed, update_task_status(DONE) ile aynı sonucu üretir."""
        done_assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Done via update_task_status',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        done_lesson = AssignmentLesson.objects.create(assignment=done_assignment, order=0)
        done_task_obj = AssignmentTask.objects.create(
            lesson_block=done_lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev',
            question_count=20,
            page_count=10,
            order=0,
        )
        done_response = self._update_task_status(
            done_task_obj.id,
            completion_status='DONE',
        )
        self.assertEqual(done_response.status_code, 200)
        done_task = done_response.json()['data']

        mark_assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Done via mark_completed',
            status=ManualAssignment.Status.ASSIGNED,
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        mark_lesson = AssignmentLesson.objects.create(assignment=mark_assignment, order=0)
        mark_task_obj = AssignmentTask.objects.create(
            lesson_block=mark_lesson,
            task_type=AssignmentTask.TaskType.SOLVE_TEST,
            title='Görev',
            question_count=20,
            page_count=10,
            order=0,
        )
        mark_response = self._mark_completed(mark_task_obj.id, actual_duration_minutes=45)
        self.assertEqual(mark_response.status_code, 200)
        mark_task = mark_response.json()['data']

        self.assertEqual(mark_task['completion_status'], done_task['completion_status'])
        self.assertEqual(mark_task['task_completion_percent'], done_task['task_completion_percent'])
        self.assertEqual(mark_task['status'], done_task['status'])
        self.assertEqual(mark_task['completed_question_count'], done_task['completed_question_count'])
        self.assertEqual(mark_task['completed_page_count'], done_task['completed_page_count'])
        self.assertEqual(mark_task['actual_duration_minutes'], 45)

        done_assignment.refresh_from_db()
        mark_assignment.refresh_from_db()
        self.assertEqual(mark_assignment.completion_percent, done_assignment.completion_percent)
        self.assertEqual(done_assignment.completion_percent, 100)

    def test_report_never_100_when_partial_exists(self):
        """Eksik görev varken rapor %100 göstermez."""
        self._update_task_status(
            self.task_a.id,
            completion_status='DONE',
        )
        self._update_task_status(
            self.task_b.id,
            completion_status='PARTIAL',
            task_completion_percent=80,
        )

        report_response = self.client.get(
            f'/api/coaching/manual-assignments/assignments/{self.assignment.id}/report/',
        )
        self.assertEqual(report_response.status_code, 200)
        summary = report_response.json()['data']['report_summary']
        self.assertEqual(summary['partial_tasks'], 1)
        self.assertEqual(summary['done_tasks'], 1)
        self.assertLess(summary['overall_completion_percent'], 100)
        self.assertEqual(summary['overall_completion_percent'], 90)

    def test_report_and_assignment_completion_percent_match(self):
        """Kontrol listesi ve rapor aynı assignment.completion_percent kullanır."""
        self._update_task_status(
            self.task_a.id,
            completion_status='PARTIAL',
            task_completion_percent=60,
        )
        self._update_task_status(
            self.task_b.id,
            completion_status='NOT_DONE',
        )

        self.assignment.refresh_from_db()
        expected = self.assignment.completion_percent  # (60 + 0) / 2 = 30

        report_response = self.client.get(
            f'/api/coaching/manual-assignments/assignments/{self.assignment.id}/report/',
        )
        self.assertEqual(report_response.status_code, 200)
        report_data = report_response.json()

        detail = ManualAssignmentDetailSerializer(self.assignment).data
        self.assertEqual(detail['completion_percent'], expected)
        self.assertEqual(report_data['data']['completion_percent'], expected)
        self.assertEqual(
            report_data['data']['report_summary']['overall_completion_percent'],
            expected,
        )
        overall = report_data['overall_stats']
        self.assertIn('full_assignments', overall)
        self.assertIn('not_brought_assignments', overall)
        self.assertIn('partial_assignments', overall)

        current_trend = next(
            t for t in report_data['recent_trend'] if t['is_current']
        )
        self.assertEqual(current_trend['completion_percent'], expected)
