"""
Token encryption ve webhook verify testleri.
"""
from cryptography.fernet import Fernet
from django.test import Client, TestCase, override_settings

from apps.communication.application.token_crypto import decrypt_access_token, encrypt_access_token
from apps.communication.domain.enums import Channel
from apps.communication.domain.models import CommunicationChannelConfig
from apps.communication.infrastructure.repository import ChannelConfigRepository
from apps.communication.interfaces.views.config import _serialize_whatsapp_config
from apps.kurum.domain.models import Kurum


class TokenCryptoTest(TestCase):
    @override_settings(COMMUNICATION_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode())
    def test_encrypt_decrypt_roundtrip(self):
        plain = 'EAABtest_token_value_12345'
        encrypted = encrypt_access_token(plain)
        self.assertNotEqual(encrypted, plain)
        self.assertEqual(decrypt_access_token(encrypted), plain)

    @override_settings(COMMUNICATION_TOKEN_ENCRYPTION_KEY='')
    def test_plaintext_fallback_without_key(self):
        plain = 'legacy_token'
        stored = encrypt_access_token(plain)
        self.assertEqual(stored, plain)
        self.assertEqual(decrypt_access_token(stored), plain)


class WhatsAppConfigResponseTest(TestCase):
    def test_serialize_includes_has_token(self):
        kurum = Kurum.objects.create(ad='Cfg Kurum', kod='CFGWH')
        config = ChannelConfigRepository.upsert_whatsapp(
            kurum.id,
            {
                'phone_number_id': '12345',
                'is_active': True,
                'access_token_encrypted': 'EAAB_saved_token',
            },
        )
        data = _serialize_whatsapp_config(config, kurum_id=kurum.id)
        self.assertTrue(data['configured'])
        self.assertTrue(data['has_token'])
        self.assertEqual(data['kurum_id'], kurum.id)
        self.assertEqual(data['webhook_event_count'], 0)
        self.assertIsNone(data['webhook_last_received_at'])


class WebhookVerifyTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Webhook Kurum', kod='WHKUR')
        CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            webhook_verify_token='kurum_secret_token',
            is_active=True,
        )
        self.client = Client()

    @override_settings(WHATSAPP_VERIFY_TOKEN='global_verify')
    def test_global_verify_token(self):
        resp = self.client.get(
            '/api/communication/webhook/',
            {'hub.mode': 'subscribe', 'hub.verify_token': 'global_verify', 'hub.challenge': '12345'},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content.decode(), '12345')

    @override_settings(WHATSAPP_VERIFY_TOKEN='')
    def test_per_kurum_verify_token(self):
        resp = self.client.get(
            '/api/communication/webhook/',
            {'hub.mode': 'subscribe', 'hub.verify_token': 'kurum_secret_token', 'hub.challenge': '999'},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content.decode(), '999')

    def test_verify_token_exists_repository(self):
        self.assertTrue(ChannelConfigRepository.verify_token_exists('kurum_secret_token'))
        self.assertFalse(ChannelConfigRepository.verify_token_exists('wrong'))
