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


class MetaTemplateBodyEdgeVariableTest(SimpleTestCase):
    """Başlık/alt bilgi varsa gövde tek başına değişken olabilir."""

    def test_lone_variable_body_blocked_without_header_and_footer(self):
        issues = validate_template_content(body_named='{{mesaj}}')
        self.assertTrue(any('başlayamaz' in i for i in issues))
        self.assertTrue(any('bitemez' in i for i in issues))

    def test_lone_variable_body_allowed_with_text_header_and_footer(self):
        issues = validate_template_content(
            body_named='{{mesaj}}',
            header_json={'type': 'TEXT', 'text': 'DUYURU'},
            footer_text='3K Kampüs / 3K keşif',
        )
        self.assertEqual(issues, [])

    def test_media_header_counts_as_leading_text(self):
        issues = validate_template_content(
            body_named='{{mesaj}} bilgilerinize sunulur.',
            header_json={'type': 'DOCUMENT', 'example_handle': 'x'},
        )
        self.assertEqual(issues, [])

    def test_header_made_only_of_variable_does_not_count(self):
        issues = validate_template_content(
            body_named='{{mesaj}} bilgilerinize sunulur.',
            header_json={'type': 'TEXT', 'text': '{{baslik}}'},
        )
        self.assertTrue(any('başlayamaz' in i for i in issues))


class MetaTemplateFooterVariableTest(SimpleTestCase):
    def test_footer_variable_allowed_with_static_text(self):
        issues = validate_template_content(
            body_named='Sayın velimiz, bilgilendirme metnidir.',
            footer_text='3K Kampüs — {{sube}}',
        )
        self.assertEqual(issues, [])

    def test_footer_made_only_of_variable_rejected(self):
        issues = validate_template_content(
            body_named='Sayın velimiz, bilgilendirme metnidir.',
            footer_text='{{sube}}',
        )
        self.assertTrue(any('Alt bilgi' in i for i in issues))


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
