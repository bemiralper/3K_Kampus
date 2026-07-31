"""Faz B — çoklu WhatsApp hesabı, resolver, webhook routing."""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from apps.communication.application.account_resolver import AccountResolveError, AccountResolver
from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import Channel, WhatsAppAccountScope
from apps.communication.domain.models import CommunicationChannelConfig, Conversation
from apps.kurum.domain.models import Kurum
from apps.roller.models import Role, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


@override_settings(
    WHATSAPP_ACCESS_TOKEN='',
    WHATSAPP_PHONE_NUMBER_ID='',
    WHATSAPP_WABA_ID='',
)
class MultiWhatsAppAccountTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TWAM')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='B')
        self.role_muhasebe, _ = Role.objects.get_or_create(
            code='test_muhasebe_wa',
            defaults={'name': 'Test Muhasebe', 'level': 10, 'is_active': True},
        )
        self.role_koc, _ = Role.objects.get_or_create(
            code='test_koc_wa',
            defaults={'name': 'Test Koç', 'level': 20, 'is_active': True},
        )
        self.user_m = User.objects.create_user(username='wa_muh', password='x')
        self.user_k = User.objects.create_user(username='wa_koc', password='x')
        UserRole.objects.create(user=self.user_m, role=self.role_muhasebe)
        UserRole.objects.create(user=self.user_k, role=self.role_koc)

        self.acc_genel = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Genel',
            phone_number_id='pn_genel',
            is_active=True,
            is_default=True,
            scope_type=WhatsAppAccountScope.ALL_SUBES,
        )
        self.acc_genel.allowed_roles.set([self.role_muhasebe, self.role_koc])

        self.acc_kadikoy = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Kadıköy Muhasebe',
            phone_number_id='pn_kadikoy',
            is_active=True,
            is_default=False,
            scope_type=WhatsAppAccountScope.SELECTED_SUBES,
        )
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])
        self.acc_kadikoy.allowed_subes.set([self.sube_a])

    def test_resolver_role_and_sube(self):
        cfg = AccountResolver.resolve(
            kurum_id=self.kurum.id,
            user=self.user_m,
            sube_id=self.sube_a.id,
            preferred_id=self.acc_kadikoy.id,
        )
        self.assertEqual(cfg.id, self.acc_kadikoy.id)

        with self.assertRaises(AccountResolveError):
            AccountResolver.resolve(
                kurum_id=self.kurum.id,
                user=self.user_k,
                sube_id=self.sube_a.id,
                preferred_id=self.acc_kadikoy.id,
            )

    def test_resolver_selected_sube_blocks_other_sube(self):
        accessible = AccountResolver.list_accessible(
            kurum_id=self.kurum.id,
            user=self.user_m,
            sube_id=self.sube_b.id,
        )
        ids = {a.id for a in accessible}
        self.assertIn(self.acc_genel.id, ids)
        self.assertNotIn(self.acc_kadikoy.id, ids)

    def test_webhook_routes_by_phone_number_id(self):
        processor = InboundProcessor()
        payload = {
            'entry': [{
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'metadata': {'phone_number_id': 'pn_kadikoy'},
                        'messages': [{
                            'id': 'wamid.test1',
                            'from': '905551112233',
                            'type': 'text',
                            'text': {'body': 'Merhaba'},
                            'timestamp': '1700000000',
                        }],
                        'statuses': [],
                    },
                }],
            }],
        }
        result = processor.process_webhook(payload, signature_valid=True)
        self.assertEqual(result['processed'], 1)
        conv = Conversation.objects.filter(kurum=self.kurum).first()
        self.assertIsNotNone(conv)
        self.assertEqual(conv.channel_config_id, self.acc_kadikoy.id)

    def test_phone_number_uniqueness_helper(self):
        from apps.communication.infrastructure.repository import ChannelConfigRepository
        self.assertTrue(
            ChannelConfigRepository.phone_number_id_taken('pn_genel')
        )
        self.assertFalse(
            ChannelConfigRepository.phone_number_id_taken(
                'pn_genel', exclude_id=self.acc_genel.id,
            )
        )
