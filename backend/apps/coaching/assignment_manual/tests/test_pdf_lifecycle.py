import subprocess
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.communication.application.html_to_pdf import render_url_to_pdf


class PdfLifecycleTests(SimpleTestCase):
    @patch('apps.communication.application.html_to_pdf.os.killpg')
    @patch('apps.communication.application.html_to_pdf.subprocess.Popen')
    def test_total_deadline_reaps_browser_process_group(self, popen, kill):
        child = MagicMock(pid=12345)
        child.communicate.side_effect = [subprocess.TimeoutExpired('renderer', 1), (b'', b'')]
        popen.return_value = child
        with self.assertRaisesRegex(RuntimeError, 'zaman aşımı'):
            render_url_to_pdf('http://print.invalid/?token=secret', timeout_ms=1000)
        kill.assert_called_once()
        self.assertNotIn('secret', str(popen.call_args))
        self.assertEqual(child.communicate.call_count, 2)

    @patch('apps.communication.application.html_to_pdf.os.killpg')
    @patch('apps.communication.application.html_to_pdf.subprocess.Popen')
    def test_validated_output_and_cleanup(self, popen, kill):
        pdf = b'%PDF'+b'x'*3000
        popen.return_value = MagicMock(pid=12345, returncode=0)
        popen.return_value.communicate.return_value = (pdf, b'')
        self.assertEqual(render_url_to_pdf('http://print.invalid'), pdf)
        kill.assert_called_once()

    @patch('apps.communication.application.html_to_pdf.os.killpg')
    @patch('apps.communication.application.html_to_pdf.subprocess.Popen')
    def test_invalid_output_is_rejected(self, popen, kill):
        popen.return_value = MagicMock(pid=12345, returncode=0)
        popen.return_value.communicate.return_value = (b'error page', b'')
        with self.assertRaises(RuntimeError):
            render_url_to_pdf('http://print.invalid')
