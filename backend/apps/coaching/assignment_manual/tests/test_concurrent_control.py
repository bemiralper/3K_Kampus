from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.db import connection, connections, close_old_connections
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from . import test_assignment_create_evaluate as fixtures
from ..models import ManualAssignment, AssignmentTask, AssignmentLesson


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locking')
class ConcurrentControlTests(TransactionTestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)
        response = self.client.post('/api/coaching/manual-assignments/assignments/',
            fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self), format='json')
        self.assignment_id = response.data['data']['id']

    def run_parallel(self, ids):
        barrier = Barrier(2)

        def update(task_id):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.coach)
                barrier.wait(timeout=10)
                response = client.post(f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
                    {'completion_status': 'DONE'}, format='json',
                    HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
                return response.status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(update, ids))
        self.assertEqual(statuses, [200, 200])

    def test_two_connections_preserve_final_completion(self):
        ids = list(AssignmentTask.objects.filter(lesson_block__assignment_id=self.assignment_id).values_list('pk', flat=True))
        self.run_parallel(ids)
        assignment = ManualAssignment.objects.get(pk=self.assignment_id)
        self.assertEqual(assignment.completion_percent, 100)
        self.assertEqual(assignment.status, 'COMPLETED')

    def test_two_assignments_sharing_source_preserve_resource_average(self):
        from apps.student_resources.models import StudentResourceAssignment
        from ..services.progress_sync import sync_source_assignment_progress
        from django.utils import timezone
        source = StudentResourceAssignment.objects.create(
            student=self.student, lesson=self.ders, resource_book=self.resource_book,
            coach=self.coach, progress_percent=0, status='ASSIGNED',
        )
        ManualAssignment.objects.filter(pk=self.assignment_id).update(source_assignment=source)
        other = ManualAssignment.objects.create(
            student=self.student, coach=self.coach, title='Second source assignment',
            due_date=timezone.now()+timezone.timedelta(days=5), status='ASSIGNED', source_assignment=source,
        )
        lesson = AssignmentLesson.objects.create(assignment=other)
        task = AssignmentTask.objects.create(lesson_block=lesson, title='Only task', task_type='SOLVE_TEST')
        first_id = AssignmentTask.objects.filter(lesson_block__assignment_id=self.assignment_id).first().pk
        before_sync = Barrier(2)

        def synchronize(assignment):
            before_sync.wait(timeout=10)
            return sync_source_assignment_progress(assignment)

        with patch('apps.coaching.assignment_manual.services.progress_sync.sync_source_assignment_progress', side_effect=synchronize):
            self.run_parallel([first_id, task.pk])
        source.refresh_from_db()
        self.assertEqual(source.progress_percent, 75)

    def parallel_post(self, url, payload, key):
        barrier = Barrier(2)
        def submit(_):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(self.coach)
                barrier.wait(timeout=10)
                response = client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key,
                    HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
                return response.status_code, response.data
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(submit, range(2)))

    @override_settings(ASSIGNMENT_OPERATION_LEDGER_ENABLED=True, CELERY_BROKER_URL='')
    def test_parallel_create_requests_reuse_one_assignment(self):
        payload = fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self)
        results = self.parallel_post('/api/coaching/manual-assignments/assignments/', payload, 'parallel-create')
        self.assertEqual([status for status, _ in results], [201, 201], results)
        self.assertEqual(results[0][1]['data']['id'], results[1][1]['data']['id'])
        self.assertEqual(ManualAssignment.objects.count(), 2)  # initial fixture + one new assignment

    @override_settings(ASSIGNMENT_OPERATION_LEDGER_ENABLED=True, CELERY_BROKER_URL='')
    def test_parallel_notify_requests_reuse_one_job(self):
        from apps.ogrenci.domain.models import Ogrenci
        from ..models import AssignmentOperation
        Ogrenci.objects.filter(pk=self.student.pk).update(telefon='05551112233')
        results = self.parallel_post(f'/api/coaching/manual-assignments/assignments/{self.assignment_id}/notify-send/',
            {'async': True, 'notify_type': 'plan', 'include_student': True, 'veli_ids': []}, 'parallel-notify')
        self.assertEqual([status for status, _ in results], [202, 202], results)
        self.assertEqual(results[0][1]['data']['job_id'], results[1][1]['data']['job_id'])
        self.assertEqual(AssignmentOperation.objects.count(), 1)
