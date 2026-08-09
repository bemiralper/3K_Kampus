"""Faz B — çoklu WhatsApp hesabı, resolver, webhook routing."""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model

from apps.communication.application.account_resolver import AccountResolveError, AccountResolver
from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import Channel, WhatsAppAccountScope
from apps.communication.domain.models import CommunicationChannelConfig, Conversation
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _grant(role, codes):
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'category': 'test'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)


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
        _grant(self.role_muhasebe, [
            'communication.read', 'communication.write', 'finans.read',
        ])
        _grant(self.role_koc, [
            'communication.read', 'communication.write', 'ogrenci.read',
        ])
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

    def test_conversation_list_respects_allowed_roles(self):
        """Muhasebe rolü olmayan hesap sohbetleri muhasebe kullanıcısına görünmez."""
        from apps.communication.application.coach_scope import (
            filter_conversations_for_user,
            user_can_access_conversation,
        )
        from apps.communication.domain.enums import ConversationStatus

        # Genel hesaptan muhasebe rolünü çıkar — yalnızca koç
        self.acc_genel.allowed_roles.set([self.role_koc])

        conv_genel = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            channel=Channel.WHATSAPP,
            contact_phone='905551110001',
            status=ConversationStatus.OPEN,
            channel_config=self.acc_genel,
        )
        conv_muh = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            channel=Channel.WHATSAPP,
            contact_phone='905551110002',
            status=ConversationStatus.OPEN,
            channel_config=self.acc_kadikoy,
        )

        qs = Conversation.objects.filter(kurum=self.kurum)
        muh_qs = filter_conversations_for_user(
            qs, self.user_m, kurum_id=self.kurum.id, sube_id=self.sube_a.id,
        )
        muh_ids = set(muh_qs.values_list('id', flat=True))
        self.assertIn(conv_muh.id, muh_ids)
        self.assertNotIn(conv_genel.id, muh_ids)

        self.assertTrue(user_can_access_conversation(self.user_m, conv_muh))
        self.assertFalse(user_can_access_conversation(self.user_m, conv_genel))

        koc_qs = filter_conversations_for_user(
            qs, self.user_k, kurum_id=self.kurum.id, sube_id=self.sube_a.id,
        )
        koc_ids = set(koc_qs.values_list('id', flat=True))
        self.assertIn(conv_genel.id, koc_ids)
        self.assertNotIn(conv_muh.id, koc_ids)

    def test_coach_profile_accesses_coaching_account_without_role(self):
        """Aktif CoachProfile, allowed_roles'ta olmasa da COACHING hattını görür."""
        from apps.coaching.models import CoachProfile
        from apps.communication.domain.enums import CommunicationDepartment
        from apps.personel.domain.models import Personel

        self.acc_genel.allowed_roles.set([self.role_muhasebe])  # koç rolü yok
        self.acc_genel.department = CommunicationDepartment.COACHING
        self.acc_genel.save(update_fields=['department'])
        # Varsayılan departman COACHING; muhasebe hattını koç bypass'ından çıkar
        self.acc_kadikoy.department = CommunicationDepartment.ACCOUNTING
        self.acc_kadikoy.save(update_fields=['department'])

        # Rolü olmayan kullanıcı + koç profili
        user_coach = User.objects.create_user(username='wa_coach_profile', password='x')
        personel = Personel.objects.create(
            user=user_coach,
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Koç',
            soyad='Test',
            tc_kimlik_no='44444444444',
        )
        CoachProfile.objects.create(
            teacher=personel, capacity=10, is_active=True, is_coach=True,
        )

        accessible = AccountResolver.list_accessible(
            kurum_id=self.kurum.id,
            user=user_coach,
            sube_id=self.sube_a.id,
        )
        ids = {a.id for a in accessible}
        self.assertIn(self.acc_genel.id, ids)
        self.assertNotIn(self.acc_kadikoy.id, ids)
