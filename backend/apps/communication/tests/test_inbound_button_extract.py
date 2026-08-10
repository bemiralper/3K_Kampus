"""Inbound şablon buton / interactive cevap metin çıkarımı."""
from django.test import SimpleTestCase

from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import MessageType


class InboundButtonExtractTest(SimpleTestCase):
    def setUp(self):
        self.proc = InboundProcessor()

    def test_template_quick_reply_button(self):
        msg_type, body, _ = self.proc._extract_message_content({
            'type': 'button',
            'button': {'text': 'Uygunum', 'payload': 'Uygunum'},
        })
        self.assertEqual(msg_type, MessageType.TEXT)
        self.assertEqual(body, 'Uygunum')

    def test_interactive_button_reply(self):
        msg_type, body, _ = self.proc._extract_message_content({
            'type': 'interactive',
            'interactive': {
                'type': 'button_reply',
                'button_reply': {'id': '1', 'title': 'Daha sonra'},
            },
        })
        self.assertEqual(msg_type, MessageType.TEXT)
        self.assertEqual(body, 'Daha sonra')

    def test_interactive_list_reply(self):
        msg_type, body, _ = self.proc._extract_message_content({
            'type': 'interactive',
            'interactive': {
                'type': 'list_reply',
                'list_reply': {'id': 'opt', 'title': 'Seçenek A'},
            },
        })
        self.assertEqual(body, 'Seçenek A')

    def test_unknown_falls_back_to_bracket_type(self):
        msg_type, body, _ = self.proc._extract_message_content({'type': 'sticker'})
        self.assertEqual(body, '[sticker]')
