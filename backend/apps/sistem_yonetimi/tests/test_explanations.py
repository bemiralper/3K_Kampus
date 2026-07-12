from django.test import SimpleTestCase

from apps.sistem_yonetimi.collectors.explanations import explain_log_line
from apps.sistem_yonetimi.collectors.logs import detect_level


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

    def test_access_log_200_with_levels_error_query_is_info(self):
        line = (
            '127.0.0.1 - - [12/Jul/2026:13:55:28 +0300] '
            '"GET /sistem-yonetimi/api/logs/?source=django&levels=ERROR&max_lines=250 HTTP/1.1" 200 695 '
            '"https://www.3kkampus.com/admin/sistem-yonetimi?tab=logs" "Mozilla/5.0"'
        )
        self.assertEqual(detect_level(line, source_category='api'), 'INFO')
        self.assertEqual(detect_level(line), 'INFO')

    def test_access_log_500_is_error(self):
        line = (
            '127.0.0.1 - - [12/Jul/2026:13:55:28 +0300] '
            '"GET /api/foo HTTP/1.1" 500 12 '
            '"-" "Mozilla/5.0"'
        )
        self.assertEqual(detect_level(line, source_category='api'), 'ERROR')

    def test_access_log_404_is_warning(self):
        line = (
            '127.0.0.1 - - [12/Jul/2026:13:55:28 +0300] '
            '"GET /missing HTTP/1.1" 404 12 '
            '"-" "Mozilla/5.0"'
        )
        self.assertEqual(detect_level(line), 'WARNING')
