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

    def test_resolve_uses_role_assigned_number_not_default(self):
        """Koç varsayılan hatta olsa da muhasebe kendi rolünün numarasını kullanır."""
        self.acc_genel.allowed_roles.set([self.role_koc])
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])

        cfg_m = AccountResolver.resolve(
            kurum_id=self.kurum.id,
            user=self.user_m,
            sube_id=self.sube_a.id,
            raise_if_missing=False,
        )
        cfg_k = AccountResolver.resolve(
            kurum_id=self.kurum.id,
            user=self.user_k,
            sube_id=self.sube_a.id,
            raise_if_missing=False,
        )
        self.assertEqual(cfg_m.id, self.acc_kadikoy.id)
        self.assertEqual(cfg_k.id, self.acc_genel.id)

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

    def test_accounting_staff_accesses_accounting_account_without_role(self):
        """finans + communication yetkili, allowed_roles'ta olmasa da ACCOUNTING hattını görür."""
        from apps.communication.domain.enums import CommunicationDepartment

        self.acc_genel.allowed_roles.set([self.role_koc])
        self.acc_genel.department = CommunicationDepartment.COACHING
        self.acc_genel.save(update_fields=['department'])
        self.acc_kadikoy.allowed_roles.set([self.role_koc])
        self.acc_kadikoy.department = CommunicationDepartment.ACCOUNTING
        self.acc_kadikoy.save(update_fields=['department'])

        accessible = AccountResolver.list_accessible(
            kurum_id=self.kurum.id,
            user=self.user_m,
            sube_id=self.sube_a.id,
        )
        ids = {a.id for a in accessible}
        self.assertIn(self.acc_kadikoy.id, ids)
        self.assertNotIn(self.acc_genel.id, ids)

    def test_accounting_sees_own_outbound_on_other_account(self):
        """Makbuz koç hattına düşse bile gönderen muhasebe sohbeti görür."""
        from apps.communication.application.coach_scope import filter_conversations_for_user
        from apps.communication.domain.enums import (
            ConversationStatus,
            MessageDirection,
            MessageStatus,
        )
        from apps.communication.domain.models import Message

        self.acc_genel.allowed_roles.set([self.role_koc])
        conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            channel=Channel.WHATSAPP,
            contact_phone='905551110003',
            status=ConversationStatus.OPEN,
            channel_config=self.acc_genel,
        )
        Message.objects.create(
            conversation=conv,
            direction=MessageDirection.OUTBOUND,
            body='Tahsilat makbuzu',
            status=MessageStatus.SENT,
            sender_user=self.user_m,
            source_module='odeme',
        )

        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.user_m,
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
        )
        self.assertIn(conv.id, set(qs.values_list('id', flat=True)))

    def test_accounting_sees_accounting_department_on_other_account(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user
        from apps.communication.domain.enums import CommunicationDepartment, ConversationStatus

        self.acc_genel.allowed_roles.set([self.role_koc])
        conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            channel=Channel.WHATSAPP,
            contact_phone='905551110004',
            status=ConversationStatus.OPEN,
            channel_config=self.acc_genel,
            department=CommunicationDepartment.ACCOUNTING,
        )
        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.user_m,
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
        )
        self.assertIn(conv.id, set(qs.values_list('id', flat=True)))

    def test_send_stamps_channel_config_and_accounting_department(self):
        from unittest.mock import patch

        from apps.communication.application.communication_service import (
            CommunicationService,
            MessageContent,
            RecipientQuery,
        )
        from apps.communication.domain.enums import CommunicationDepartment

        self.acc_kadikoy.department = CommunicationDepartment.COACHING
        self.acc_kadikoy.save(update_fields=['department'])

        with patch(
            'apps.communication.application.communication_service.process_queue_item',
            return_value=True,
        ):
            result = CommunicationService().send(
                self.kurum.id,
                recipients=RecipientQuery(phone='+905551110055'),
                content=MessageContent(
                    text='Tahsilat makbuzu ektedir.',
                    template_name='odeme_makbuzu_veli',
                    channel_config_id=str(self.acc_kadikoy.id),
                ),
                sender_user_id=self.user_m.id,
                process_immediately=True,
            )
        self.assertTrue(result.success)
        conv = Conversation.objects.get(kurum=self.kurum, contact_phone='+905551110055')
        self.assertEqual(conv.channel_config_id, self.acc_kadikoy.id)
        self.assertEqual(conv.department, CommunicationDepartment.ACCOUNTING)

    def test_for_department_prefers_accounting_over_default_coaching(self):
        from apps.communication.domain.enums import CommunicationDepartment

        self.acc_genel.department = CommunicationDepartment.COACHING
        self.acc_genel.is_default = True
        self.acc_genel.save(update_fields=['department', 'is_default'])
        self.acc_kadikoy.department = CommunicationDepartment.ACCOUNTING
        self.acc_kadikoy.save(update_fields=['department'])

        cfg = AccountResolver.for_department(
            self.kurum.id,
            CommunicationDepartment.ACCOUNTING,
            sube_id=self.sube_a.id,
            user=self.user_m,
        )
        self.assertIsNotNone(cfg)
        self.assertEqual(cfg.id, self.acc_kadikoy.id)

    def test_odeme_dispatch_uses_accounting_account(self):
        """Gönderen muhasebe rolündeyse makbuz o role bağlanan numaradan çözülür."""
        from apps.communication.application.notification_dispatcher import (
            NotificationRecipient,
            dispatch_event,
        )
        from apps.communication.domain.enums import CommunicationDepartment, MetaTemplateStatus
        from apps.communication.domain.models import WhatsAppMetaTemplate
        from django.utils import timezone

        self.acc_genel.department = CommunicationDepartment.COACHING
        self.acc_genel.is_default = True
        self.acc_genel.save(update_fields=['department', 'is_default'])
        self.acc_kadikoy.department = CommunicationDepartment.ACCOUNTING
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])
        self.acc_kadikoy.save(update_fields=['department'])

        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.acc_genel,
            name='odeme_makbuzu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, makbuz ektedir.',
            header_json={'type': 'DOCUMENT'},
            approved_at=timezone.now(),
        )
        acc_tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.acc_kadikoy,
            name='odeme_makbuzu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, makbuz ektedir.',
            header_json={'type': 'DOCUMENT'},
            approved_at=timezone.now(),
        )

        preview = dispatch_event(
            self.kurum.id,
            'odeme.makbuz',
            recipient=NotificationRecipient.veli(1),
            sube_id=self.sube_a.id,
            sent_by_user_id=self.user_m.id,
            dry_run=True,
        )
        self.assertIsNotNone(preview)
        self.assertEqual(str(preview.channel_config_id), str(self.acc_kadikoy.id))
        self.assertEqual(preview.meta_template_name, acc_tpl.name)

    def test_yoklama_dispatch_uses_coaching_not_sender_accounting_line(self):
        """Kütüphane yoklaması, gönderen muhasebe rolünde olsa da koçluk hattından gider."""
        from apps.communication.application.notification_dispatcher import (
            NotificationRecipient,
            dispatch_event,
        )
        from apps.communication.domain.enums import CommunicationDepartment, MetaTemplateStatus
        from apps.communication.domain.models import WhatsAppMetaTemplate
        from django.utils import timezone

        self.acc_genel.department = CommunicationDepartment.COACHING
        self.acc_genel.is_default = True
        self.acc_genel.save(update_fields=['department', 'is_default'])
        self.acc_kadikoy.department = CommunicationDepartment.ACCOUNTING
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])
        self.acc_kadikoy.save(update_fields=['department'])

        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.acc_genel,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{ogrenci_ad}} gelmedi.',
            approved_at=timezone.now(),
        )

        preview = dispatch_event(
            self.kurum.id,
            'yoklama.gelmedi',
            recipient=NotificationRecipient.veli(1),
            context={'ogrenci_ad': 'Ali', 'tarih': '21.08.2026'},
            sube_id=self.sube_a.id,
            sent_by_user_id=self.user_m.id,
            dry_run=True,
        )
        self.assertIsNotNone(preview)
        self.assertEqual(str(preview.channel_config_id), str(self.acc_genel.id))
        self.assertEqual(preview.meta_template_name, 'yoklama_gelmedi_veli')

    def test_odeme_reuses_approved_template_from_other_account_on_same_waba(self):
        """Şablon koç hesabında kayıtlı olsa da muhasebe numarasından Meta ile gider."""
        from apps.communication.application.notification_dispatcher import (
            NotificationAttachment,
            NotificationRecipient,
            dispatch_event,
        )
        from apps.communication.domain.enums import MetaTemplateStatus
        from apps.communication.domain.models import WhatsAppMetaTemplate
        from django.utils import timezone

        self.acc_genel.allowed_roles.set([self.role_koc])
        self.acc_genel.waba_id = 'waba-shared'
        self.acc_genel.save(update_fields=['waba_id'])
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])
        self.acc_kadikoy.waba_id = 'waba-shared'
        self.acc_kadikoy.save(update_fields=['waba_id'])

        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.acc_genel,
            name='odeme_makbuzu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, makbuz ektedir.',
            header_json={'type': 'DOCUMENT'},
            approved_at=timezone.now(),
        )

        preview = dispatch_event(
            self.kurum.id,
            'odeme.makbuz',
            recipient=NotificationRecipient.veli(1),
            attachment=NotificationAttachment(filename='makbuz.pdf', file_bytes=b'%PDF-1'),
            sube_id=self.sube_a.id,
            sent_by_user_id=self.user_m.id,
            dry_run=True,
        )
        self.assertTrue(preview.would_send)
        self.assertTrue(preview.uses_meta)
        self.assertEqual(preview.meta_template_name, 'odeme_makbuzu_veli')
        self.assertEqual(str(preview.channel_config_id), str(self.acc_kadikoy.id))

    def test_odeme_reuses_template_when_waba_id_missing(self):
        """WABA id boş olsa bile onaylı makbuz şablonu düşürülmez."""
        from apps.communication.application.notification_dispatcher import (
            NotificationAttachment,
            NotificationRecipient,
            dispatch_event,
        )
        from apps.communication.domain.enums import MetaTemplateStatus
        from apps.communication.domain.models import WhatsAppMetaTemplate
        from django.utils import timezone

        self.acc_genel.allowed_roles.set([self.role_koc])
        self.acc_genel.waba_id = ''
        self.acc_genel.save(update_fields=['waba_id'])
        self.acc_kadikoy.allowed_roles.set([self.role_muhasebe])
        self.acc_kadikoy.waba_id = ''
        self.acc_kadikoy.save(update_fields=['waba_id'])

        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.acc_genel,
            name='odeme_makbuzu_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, makbuz ektedir.',
            header_json={'type': 'DOCUMENT'},
            approved_at=timezone.now(),
        )

        preview = dispatch_event(
            self.kurum.id,
            'odeme.makbuz',
            recipient=NotificationRecipient.veli(1),
            attachment=NotificationAttachment(filename='makbuz.pdf', file_bytes=b'%PDF-1'),
            sube_id=self.sube_a.id,
            sent_by_user_id=self.user_m.id,
            dry_run=True,
        )
        self.assertTrue(preview.would_send, preview.blocked_reason or preview.warnings)
        self.assertTrue(preview.uses_meta)
        self.assertEqual(preview.meta_template_name, 'odeme_makbuzu_veli')
        self.assertEqual(str(preview.channel_config_id), str(self.acc_kadikoy.id))

    def test_apply_shared_meta_copies_credentials(self):
        """Aynı Meta'ya eklenen ikinci hat token/WABA/App ID'yi kaynak hesaptan alır."""
        from apps.communication.application.account_resolver import AccountResolver

        self.acc_genel.access_token_encrypted = 'EAAB_shared'
        self.acc_genel.waba_id = 'waba-1'
        self.acc_genel.app_id = 'app-1'
        self.acc_genel.webhook_verify_token = 'verify-1'
        self.acc_genel.app_secret_encrypted = 'secret-1'
        self.acc_genel.save(update_fields=[
            'access_token_encrypted', 'waba_id', 'app_id',
            'webhook_verify_token', 'app_secret_encrypted',
        ])
        data = AccountResolver.apply_shared_meta_credentials(
            {'phone_number_id': 'pn_new'},
            self.acc_genel,
        )
        self.assertEqual(data['phone_number_id'], 'pn_new')
        self.assertEqual(data['access_token_encrypted'], 'EAAB_shared')
        self.assertEqual(data['waba_id'], 'waba-1')
        self.assertEqual(data['app_id'], 'app-1')
        self.assertEqual(data['webhook_verify_token'], 'verify-1')
        self.assertEqual(data['app_secret_encrypted'], 'secret-1')
        source = AccountResolver.source_for_shared_meta(self.kurum.id, self.acc_genel.id)
        self.assertEqual(source.id, self.acc_genel.id)

    def test_muhasebe_account_uses_sibling_token_for_send(self):
        """Muhasebe hattında token yoksa koç hesabının token'ı, muhasebe phone_number_id ile kullanılır."""
        from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient

        self.acc_genel.access_token_encrypted = 'EAAB_koc_token'
        self.acc_genel.waba_id = 'waba-shared'
        self.acc_genel.save(update_fields=['access_token_encrypted', 'waba_id'])
        self.acc_kadikoy.access_token_encrypted = ''
        self.acc_kadikoy.waba_id = 'waba-shared'
        self.acc_kadikoy.save(update_fields=['access_token_encrypted', 'waba_id'])

        client = WhatsAppCloudClient(channel_config=self.acc_kadikoy)
        cfg = client._resolve_config(self.kurum.id)
        self.assertEqual(cfg['phone_number_id'], 'pn_kadikoy')
        self.assertEqual(cfg['access_token'], 'EAAB_koc_token')
