from unittest.mock import patch
from django.test import TestCase

from . import test_assignment_create_evaluate as fixtures
from ..models import AssignmentTask
from ..views import update_assignment_completion_from_tasks


class BatchStatusTests(TestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)
        response = self.client.post('/api/coaching/manual-assignments/assignments/',
            fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self), format='json')
        self.assignment_id = response.data['data']['id']
        self.ids = list(AssignmentTask.objects.filter(lesson_block__assignment_id=self.assignment_id).values_list('pk', flat=True))
        self.url = '/api/coaching/manual-assignments/tasks/batch-status/'

    def test_batch_computes_once_and_matches_single_endpoint(self):
        with patch('apps.coaching.assignment_manual.views.update_assignment_completion_from_tasks', wraps=update_assignment_completion_from_tasks) as compute:
            response = self.client.post(self.url, {'task_ids': self.ids, 'completion_status': 'DONE'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        compute.assert_called_once()
        self.assertEqual(response.data['data']['assignment_summary']['completion_percent'], 100)
        self.assertEqual(AssignmentTask.objects.filter(pk__in=self.ids, completion_status='DONE').count(), len(self.ids))

    def test_unknown_task_rolls_back_entire_batch(self):
        response = self.client.post(self.url, {'task_ids': [*self.ids, 999999], 'completion_status': 'DONE'}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(AssignmentTask.objects.filter(pk__in=self.ids, completion_status='PENDING').count(), len(self.ids))

    def test_invalid_status_rejected(self):
        response = self.client.post(self.url, {'task_ids': self.ids, 'completion_status': 'OTHER'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_single_endpoint_has_additive_summary(self):
        response = self.client.post(f'/api/coaching/manual-assignments/tasks/{self.ids[0]}/update_task_status/', {'completion_status': 'DONE'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['id'], self.ids[0])
        self.assertIn('assignment_summary', response.data)
