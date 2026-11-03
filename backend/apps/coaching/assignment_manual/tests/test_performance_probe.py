"""Repeatable synthetic benchmarks. No external delivery; fixture rolled back."""
import json
import time

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from . import test_assignment_create_evaluate as fixtures
from ..assignment_template_seed import ensure_assignment_pdf_templates
from ..notification_service import AssignmentNotificationService
from ..models import AssignmentTask
from ..views import AssignmentTaskViewSet


class PerformanceProbe(TestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)
        self.payload = fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self)
        task = self.payload['lessons'][0]['tasks'][0]
        self.payload['lessons'][0]['tasks'] = [{**task, 'title': f'Test {i}', 'order': i} for i in range(20)]
        response = self.client.post('/api/coaching/manual-assignments/assignments/', self.payload, format='json')
        self.assignment_id = response.data['data']['id']
        self.client.get('/api/coaching/manual-assignments/assignments/')  # session warmup

    def measure(self, label, run):
        started = time.perf_counter()
        with CaptureQueriesContext(connection) as queries:
            responses = run()
        metric = {
            'operation': label, 'queries': len(queries),
            'writes': sum(q['sql'].lstrip().split()[0] in ('INSERT', 'UPDATE', 'DELETE') and 'django_session' not in q['sql'] for q in queries),
            'elapsed_ms': round((time.perf_counter()-started)*1000, 2),
            'http_requests': len(responses or []),
            'response_bytes': sum(len(r.content) for r in (responses or [])),
        }
        print('PERF '+json.dumps(metric))

    def test_read_workloads(self):
        base = '/api/coaching/manual-assignments/assignments/'
        for label, path in [('list', base), ('stats', base+'stats/'), ('report', base+f'{self.assignment_id}/report/')]:
            self.measure(label, lambda path=path: [self.client.get(path)])
        ensure_assignment_pdf_templates(self.kurum.id)
        def preview():
            AssignmentNotificationService().preview(self.kurum.id, self.assignment_id, 'plan')
            return []
        self.measure('preview', preview)

    def test_twenty_task_control(self):
        ids = list(AssignmentTask.objects.filter(lesson_block__assignment_id=self.assignment_id).values_list('pk', flat=True))
        if hasattr(AssignmentTaskViewSet, 'batch_status'):
            self.measure('control_20', lambda: [self.client.post('/api/coaching/manual-assignments/tasks/batch-status/', {'task_ids': ids, 'completion_status': 'DONE'}, format='json')])
        else:
            self.measure('control_20', lambda: [self.client.post(f'/api/coaching/manual-assignments/tasks/{pk}/update_task_status/', {'completion_status': 'DONE'}, format='json') for pk in ids])
