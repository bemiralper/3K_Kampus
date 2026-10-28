from django.test import SimpleTestCase

from apps.communication.application.delivery_error import (
    explain_delivery_failure,
    explain_from_webhook_errors,
    summarize_delivery_failure,
)


class DeliveryErrorExplainTest(SimpleTestCase):
    def test_undeliverable_title_is_turkish(self):
        text = explain_delivery_failure('Message undeliverable')
        self.assertIn('iletilemedi', text.lower())
        self.assertNotIn('undeliverable', text.lower())

    def test_code_131026(self):
        text = explain_delivery_failure('', code=131026)
        self.assertIn('WhatsApp', text)

    def test_webhook_errors(self):
        text = explain_from_webhook_errors([{
            'code': 131026,
            'title': 'Message undeliverable',
            'error_data': {'details': 'Message Undeliverable.'},
        }])
        self.assertIn('iletilemedi', text.lower())

    def test_already_turkish_kept(self):
        text = explain_delivery_failure('Numara WhatsApp’te kayıtlı değil.')
        self.assertIn('WhatsApp', text)

    def test_summarize_is_short_with_full_on_side(self):
        short, full = summarize_delivery_failure('Message undeliverable')
        self.assertEqual(short, 'İletilemedi')
        self.assertGreater(len(full), len(short))
        self.assertIn('iletilemedi', full.lower())

    def test_ecosystem_engagement_is_turkish(self):
        text = explain_delivery_failure(
            'This message was not delivered to maintain healthy ecosystem engagement.'
        )
        self.assertIn('yazışmadığı', text)
        self.assertNotIn('ecosystem', text.lower())
        self.assertNotIn('delivered', text.lower())

    def test_experiment_number_is_turkish(self):
        text = explain_delivery_failure("User's number is part of an experiment.")
        self.assertIn('deneme', text.lower())
        self.assertNotIn('experiment', text.lower())
        short, full = summarize_delivery_failure("User's number is part of an experiment")
        self.assertEqual(short, 'Meta denemesinde')
        self.assertIn('deneme grubunda', full)

    def test_ecosystem_code(self):
        text = explain_from_webhook_errors([{
            'code': 131049,
            'title': 'This message was not delivered to maintain healthy ecosystem engagement.',
        }])
        self.assertIn('şablon', text)
        self.assertNotIn('healthy', text.lower())

    def test_summarize_empty_stays_empty(self):
        self.assertEqual(summarize_delivery_failure(''), ('', ''))
        self.assertEqual(summarize_delivery_failure(None), ('', ''))
