"""Print token unit tests."""
from django.test import TestCase, override_settings

from apps.coaching.assignment_manual.print_token import (
    create_print_token,
    validate_print_token,
)


@override_settings(SECRET_KEY='test-secret-key-for-print-token')
class PrintTokenTests(TestCase):
    def test_create_and_validate_roundtrip(self):
        token = create_print_token(42, 7, notify_type='report', ttl=300)
        payload = validate_print_token(token)
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload['assignment_id'], 42)
        self.assertEqual(payload['kurum_id'], 7)
        self.assertEqual(payload['notify_type'], 'report')

    def test_invalid_signature_rejected(self):
        token = create_print_token(1, 1)
        parts = token.rsplit(':', 1)
        bad = f'{parts[0]}:deadbeef'
        self.assertIsNone(validate_print_token(bad))

    def test_malformed_token_rejected(self):
        self.assertIsNone(validate_print_token('not-a-valid-token'))
