from django.test import TestCase, override_settings

from apps.yedekleme.engine.notifications import parse_recipients, send_backup_notification, smtp_configured


class BackupNotificationTests(TestCase):
    def test_parse_recipients(self):
        self.assertEqual(parse_recipients('a@x.com, b@y.com'), ['a@x.com', 'b@y.com'])
        self.assertEqual(parse_recipients('a@x.com; b@y.com'), ['a@x.com', 'b@y.com'])

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', EMAIL_HOST='smtp.test', EMAIL_HOST_USER='u@test.com')
    def test_smtp_configured_true(self):
        self.assertTrue(smtp_configured())

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend')
    def test_smtp_configured_false_without_host(self):
        self.assertFalse(smtp_configured())

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', EMAIL_HOST='smtp.test', EMAIL_HOST_USER='u@test.com', DEFAULT_FROM_EMAIL='noreply@test.com')
    def test_send_backup_notification(self):
        sent = send_backup_notification(
            subject='Test',
            body='Body',
            recipients=['admin@test.com'],
        )
        self.assertEqual(sent, 1)
