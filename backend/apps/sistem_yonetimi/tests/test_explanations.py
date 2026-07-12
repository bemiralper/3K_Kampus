from django.test import SimpleTestCase

from apps.sistem_yonetimi.collectors.explanations import explain_log_line


class LogExplanationTests(SimpleTestCase):
    def test_worker_timeout(self):
        hint = explain_log_line('[2026-07-07 07:29:30 +0000] [85803] [CRITICAL] WORKER TIMEOUT (pid:85821)')
        self.assertIsNotNone(hint)
        self.assertIn('zaman aşımı', hint['title'].lower())

    def test_unknown_line_has_no_explanation(self):
        self.assertIsNone(explain_log_line('hello world ordinary access log'))

    def test_sse_stream_and_sigkill_explanations(self):
        h1 = explain_log_line(
            '[ERROR] Error handling request GET /api/communication/events/stream/?kurum_id=2&sube_id=2'
        )
        self.assertIsNotNone(h1)
        self.assertIn('SSE', h1['title'])
        h2 = explain_log_line('[ERROR] Worker (pid:85824) was sent SIGKILL! Perhaps out of memory?')
        self.assertIsNotNone(h2)
        self.assertIn('SIGKILL', h2['title'])
