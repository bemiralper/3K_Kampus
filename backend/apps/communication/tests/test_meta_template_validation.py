"""Meta şablon yerel içerik doğrulama — #100 başlık kuralları."""
from django.test import SimpleTestCase

from apps.communication.application.meta_template_validation import (
    validate_header,
    validate_template_content,
)
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient


class MetaTemplateHeaderValidationTest(SimpleTestCase):
    def test_rejects_newline_in_header(self):
        errors = validate_header({'type': 'TEXT', 'text': 'Merhaba\nveli'})
        self.assertTrue(any('yeni satır' in e.lower() for e in errors))

    def test_rejects_asterisk_and_formatting(self):
        errors = validate_header({'type': 'TEXT', 'text': '*Önemli* duyuru'})
        self.assertTrue(any('yıldız' in e.lower() or 'biçimlendirme' in e.lower() for e in errors))

    def test_rejects_emoji(self):
        errors = validate_header({'type': 'TEXT', 'text': 'Duyuru 🎉'})
        self.assertTrue(any('emoji' in e.lower() for e in errors))

    def test_accepts_plain_header(self):
        errors = validate_header({'type': 'TEXT', 'text': 'Önemli duyuru'})
        self.assertEqual(errors, [])

    def test_media_header_skips_text_rules(self):
        errors = validate_header({'type': 'DOCUMENT', 'example_handle': 'x'})
        self.assertEqual(errors, [])

    def test_full_content_includes_header_issue(self):
        issues = validate_template_content(
            body_named='Sayın velimiz, bilgilendirme metnidir.',
            header_json={'type': 'TEXT', 'text': 'Başlık*'},
        )
        self.assertTrue(any('Başlık' in i for i in issues))


class MetaApiErrorHintTest(SimpleTestCase):
    def test_header_formatting_detail_gets_turkish_hint(self):
        formatted = WhatsAppCloudClient._format_api_error(
            {
                'error': {
                    'code': 100,
                    'message': 'Invalid parameter',
                    'error_data': {
                        'details': (
                            'Mesaj başlığında yeni satırlar, biçimlendirme karakterleri, '
                            'ifade simgeleri veya yıldız işaretleri bulunamaz.'
                        ),
                    },
                },
            },
            'fallback',
        )
        self.assertIn('Başlık metninde', formatted)
        self.assertIn('yıldız', formatted.lower())
