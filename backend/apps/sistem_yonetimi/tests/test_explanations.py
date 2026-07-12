from django.test import SimpleTestCase

from apps.sistem_yonetimi.collectors.explanations import explain_log_line


class LogExplanationTests(SimpleTestCase):
    def test_worker_timeout(self):
        hint = explain_log_line('[2026-07-07 07:29:30 +0000] [85803] [CRITICAL] WORKER TIMEOUT (pid:85821)')
        self.assertIsNotNone(hint)
        self.assertIn('zaman aşımı', hint['title'].lower())

    def test_unknown_line_has_no_explanation(self):
        self.assertIsNone(explain_log_line('hello world ordinary access log'))

    def test_programming_error(self):
        hint = explain_log_line('django.db.utils.ProgrammingError: column yedekleme_schedule.last_run_status does not exist')
        self.assertIsNotNone(hint)
        self.assertIn('Migration', hint['title'])
