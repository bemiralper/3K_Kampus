from django.test import SimpleTestCase

from apps.communication.application.delivery_error import (
    explain_delivery_failure,
    summarize_delivery_failure,
)


class DeliveryErrorTest(SimpleTestCase):
    def test_code_131026_is_turkish(self):
        text = explain_delivery_failure('(#131026) Message undeliverable', code=131026)
        self.assertIn('WhatsApp', text)
        self.assertNotIn('undeliverable', text.lower())

    def test_empty_reason_stays_empty_in_summary(self):
        short, full = summarize_delivery_failure('')
        self.assertEqual(short, '')
        self.assertEqual(full, '')

    def test_summary_shortens_long_reason(self):
        short, full = summarize_delivery_failure('(#131026) Message undeliverable')
        self.assertTrue(short)
        self.assertGreaterEqual(len(full), len(short))
        self.assertEqual(short, 'İletilemedi')
