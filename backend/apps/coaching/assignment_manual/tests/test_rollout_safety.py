from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from unittest.mock import patch

from . import test_assignment_create_evaluate as fixtures


@override_settings(ASSIGNMENT_OPERATION_LEDGER_ENABLED=False)
class RolloutSafetyTests(TestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)

    def test_disabled_ledger_does_not_query_new_table(self):
        payload = fixtures.AssignmentCreateEvaluateTest._create_assignment_payload(self)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.post('/api/coaching/manual-assignments/assignments/', payload,
                format='json', HTTP_IDEMPOTENCY_KEY='not-activated')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(any('coaching_assignment_operation' in query['sql'] for query in queries))

    def test_disabled_batch_is_explicit_and_capability_is_read_only(self):
        url = '/api/coaching/manual-assignments/assignments/'
        self.assertEqual(self.client.get(url+'capabilities/').data['data']['operation_ledger_enabled'], False)
        response = self.client.post(url+'batch-create/', {'items': []}, format='json')
        self.assertEqual(response.status_code, 503)

    @patch('apps.communication.application.html_to_pdf.render_html_to_pdf')
    def test_legacy_html_renderer_requires_visible_assignment(self, renderer):
        result = self.client.post('/api/coaching/manual-assignments/assignments/999999/render-report-pdf/',
            {'report_html': '<html><body>Sentetik belge</body></html>'}, format='json')
        self.assertEqual(result.status_code, 404)
        renderer.assert_not_called()
