from django.test import SimpleTestCase

from apps.odeme_takip.application.print_token import create_print_token, validate_print_token


class OdemePrintTokenTests(SimpleTestCase):
    def test_create_and_validate(self):
        token = create_print_token(10, 3, doc_type='plan', ttl=300)
        payload = validate_print_token(token)
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload['entity_id'], 10)
        self.assertEqual(payload['kurum_id'], 3)
        self.assertEqual(payload['doc_type'], 'plan')

    def test_tampered_token_rejected(self):
        token = create_print_token(1, 1, doc_type='makbuz')
        bad = token[:-1] + ('0' if token[-1] != '0' else '1')
        self.assertIsNone(validate_print_token(bad))
