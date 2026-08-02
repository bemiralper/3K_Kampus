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

    def test_sync_worker_is_flagged(self):
        hint = explain_log_line('[INFO] Using worker: sync')
        self.assertIsNotNone(hint)
        self.assertIn('gthread', hint['text'])

    def test_access_log_503_explained_not_confused_with_401(self):
        line = (
            '127.0.0.1 - - [02/Aug/2026:17:40:52 +0300] '
            '"GET /api/communication/conversations/2f627c3f-a3b3-4571-a446-f8102401add7/notes/ '
            'HTTP/1.1" 503 174 "-" "Mozilla/5.0"'
        )
        hint = explain_log_line(line)
        self.assertIsNotNone(hint)
        self.assertIn('503', hint['title'])

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

    def test_scanner_probe_is_info_and_explained(self):
        for path in ('/.env/', '/phpinfo/', '/wp-login.php', '/.git/config'):
            line = (
                '127.0.0.1 - - [02/Aug/2026:18:25:55 +0300] '
                f'"GET {path} HTTP/1.1" 404 179 "-" "Mozilla/4.0"'
            )
            self.assertEqual(detect_level(line), 'INFO', path)
            hint = explain_log_line(line)
            self.assertIsNotNone(hint, path)
            self.assertIn('bot', hint['title'].lower())

    def test_real_app_404_stays_warning(self):
        line = (
            '127.0.0.1 - - [02/Aug/2026:17:44:06 +0300] '
            '"GET /sinif/?egitim_yili_id=1 HTTP/1.1" 404 179 '
            '"https://www.3kkampus.com/admin/iletisim/toplu-gonder" "Mozilla/5.0"'
        )
        self.assertEqual(detect_level(line), 'WARNING')
