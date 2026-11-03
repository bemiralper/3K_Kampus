from django.test import TestCase, override_settings
from . import test_assignment_create_evaluate as fixtures
from ..models import ManualAssignment, AssignmentOperation


@override_settings(ASSIGNMENT_OPERATION_LEDGER_ENABLED=True)
class BatchCreateTests(TestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)
        self.payload = fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self)
        self.url = '/api/coaching/manual-assignments/assignments/batch-create/'

    def test_successful_student_not_duplicated_after_partial_failure(self):
        items = [{'key': 'good', 'payload': self.payload},
                 {'key': 'bad', 'payload': {**self.payload, 'student': 999999}}]
        first = self.client.post(self.url, {'items': items}, format='json')
        second = self.client.post(self.url, {'items': items}, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['data'][0]['data']['id'], second.data['data'][0]['data']['id'])
        self.assertFalse(first.data['data'][1]['success'])
        self.assertEqual(ManualAssignment.objects.count(), 1)
        self.assertEqual(AssignmentOperation.objects.filter(status='SUCCEEDED').count(), 1)

    def test_key_conflict_does_not_create_another_assignment(self):
        self.client.post(self.url, {'items': [{'key': 'one', 'payload': self.payload}]}, format='json')
        result = self.client.post(self.url, {'items': [{'key': 'one', 'payload': {**self.payload, 'title': 'Different'}}]}, format='json')
        self.assertFalse(result.data['data'][0]['success'])
        self.assertEqual(result.data['data'][0]['http_status'], 409)
        self.assertEqual(ManualAssignment.objects.count(), 1)

    def test_single_create_accepts_same_idempotency_header(self):
        url = '/api/coaching/manual-assignments/assignments/'
        first = self.client.post(url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY='single')
        second = self.client.post(url, self.payload, format='json', HTTP_IDEMPOTENCY_KEY='single')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data, second.data)
        self.assertEqual(ManualAssignment.objects.count(), 1)
