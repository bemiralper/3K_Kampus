"""Meta template body parametreleri — boş değer / named format."""
from django.test import SimpleTestCase

from apps.communication.application.meta_template_mapper import (
    build_send_body_parameters,
    sanitize_template_param_text,
)


class SendBodyParametersTest(SimpleTestCase):
    def test_empty_becomes_dash(self):
        self.assertEqual(sanitize_template_param_text(''), '-')
        self.assertEqual(sanitize_template_param_text(None), '-')
        self.assertEqual(sanitize_template_param_text('  a\nb  '), 'a b')

    def test_multiline_param_becomes_single_line(self):
        self.assertEqual(
            sanitize_template_param_text('Merhaba Ahmet,\n\nÖdevlerin hazır.\n\nİyi çalışmalar.'),
            'Merhaba Ahmet, Ödevlerin hazır. İyi çalışmalar.',
        )

    def test_send_payload_normalizes_multiline_param_not_body(self):
        """Meta'ya giden parameters[].text tek satır; gövde satırları payload'da yok."""
        params = build_send_body_parameters(
            {'1': 'mesaj'},
            {'mesaj': 'Merhaba Ahmet,\n\nÖdevlerin hazır.\n\nİyi çalışmalar.'},
            body_named='Değerli Velimiz,\n\n{{mesaj}}\n\n3K Kampüs',
        )
        self.assertEqual(len(params), 1)
        self.assertEqual(params[0]['text'], 'Merhaba Ahmet, Ödevlerin hazır. İyi çalışmalar.')
        self.assertNotIn('\n', params[0]['text'])

    def test_positional_from_map_and_body(self):
        params = build_send_body_parameters(
            {'1': 'ogrenci_ad', '2': 'hafta'},
            {'ogrenci_ad': 'Ali', 'hafta': ''},
            body_named='{{1}} — {{2}} ödev',
        )
        self.assertEqual(len(params), 2)
        self.assertEqual(params[0]['text'], 'Ali')
        self.assertEqual(params[1]['text'], '-')  # boş → -
        self.assertNotIn('parameter_name', params[0])

    def test_named_format_includes_parameter_name(self):
        """Body named kaldıysa ve map yoksa Meta parameter_name ister (#100)."""
        params = build_send_body_parameters(
            {},
            {'ogrenci_ad': 'Ali', 'hafta': '4. Hafta'},
            body_named='{{ogrenci_ad}} — {{hafta}} ödev planı',
        )
        self.assertEqual(len(params), 2)
        self.assertEqual(params[0]['parameter_name'], 'ogrenci_ad')
        self.assertEqual(params[0]['text'], 'Ali')
        self.assertEqual(params[1]['parameter_name'], 'hafta')

    def test_named_body_with_positional_map_sends_numbered_params(self):
        """Yerel gövde named olsa bile Cloud API {{1}} ise positional gitmeli."""
        params = build_send_body_parameters(
            {'1': 'ogrenci_ad', '2': 'kurum_ad'},
            {'ogrenci_ad': 'Zeynep Altunışık', 'kurum_ad': '3K Kampüs'},
            body_named='🎉 Merhaba {{ogrenci_ad}}, {{kurum_ad}} ailesine hoş geldin!',
        )
        self.assertEqual(len(params), 2)
        self.assertNotIn('parameter_name', params[0])
        self.assertEqual(params[0]['text'], 'Zeynep Altunışık')
        self.assertEqual(params[1]['text'], '3K Kampüs')

    def test_body_only_count_not_full_map(self):
        params = build_send_body_parameters(
            {'1': 'ogrenci_ad', '2': 'hafta', '3': 'kurum_ad'},
            {'ogrenci_ad': 'Ali', 'hafta': '4', 'kurum_ad': 'X'},
            body_named='Merhaba {{ogrenci_ad}}',
        )
        # Map 3 alanlı olsa da body'de tek named var → 1 parametre (positional via map)
        self.assertEqual(len(params), 1)
        self.assertEqual(params[0]['text'], 'Ali')
