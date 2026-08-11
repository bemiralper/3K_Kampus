"""Meta App ID çözümleme ve public landing alanı."""
from django.test import TestCase, override_settings

from apps.communication.application.app_id_resolver import (
    ensure_account_app_id,
    public_facebook_app_id_for_kurum,
)
from apps.communication.domain.enums import Channel
from apps.communication.domain.models import CommunicationChannelConfig
from apps.kurum.domain.models import Kurum


@override_settings(WHATSAPP_APP_ID='env_app_999')
class AppIdResolverTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='AppId Kurum', kod='APPID')

    def test_public_prefers_active_account_app_id(self):
        CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn1',
            app_id='account_app_111',
            is_active=True,
            is_default=True,
        )
        self.assertEqual(
            public_facebook_app_id_for_kurum(self.kurum.id),
            'account_app_111',
        )

    def test_public_falls_back_to_env(self):
        CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn1',
            app_id='',
            is_active=True,
            is_default=True,
        )
        self.assertEqual(
            public_facebook_app_id_for_kurum(self.kurum.id),
            'env_app_999',
        )

    def test_ensure_keeps_manual_app_id(self):
        acc = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn1',
            app_id='manual_123',
            is_active=True,
        )
        result = ensure_account_app_id(acc, access_token='')
        self.assertEqual(result, 'manual_123')
        acc.refresh_from_db()
        self.assertEqual(acc.app_id, 'manual_123')

    def test_ensure_fills_from_env_when_empty(self):
        acc = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn1',
            app_id='',
            is_active=True,
        )
        result = ensure_account_app_id(acc, access_token='')
        self.assertEqual(result, 'env_app_999')
        acc.refresh_from_db()
        self.assertEqual(acc.app_id, 'env_app_999')
