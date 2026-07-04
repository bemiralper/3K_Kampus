"""
İletişim modülü Faz 2 testleri.
"""
import hashlib
import hmac
import json
from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import Channel, MessageDirection, MessageStatus
from apps.communication.domain.models import Conversation, Message, MessageStatusEvent
from apps.communication.infrastructure.repository import (
    ChannelConfigRepository,
    ConversationRepository,
    MessageRepository,
    OutboundQueueRepository,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_role(user, role_code: str):
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={'name': role_code, 'level': 100, 'is_system_role': True},
    )
    for code in ('communication.read', 'communication.write'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class ContactResolverTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TSTCOMM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            telefon='05321234567',
            aktif_mi=True,
        )

    def test_normalize_tr_mobile(self):
        self.assertEqual(ContactResolver.normalize('05321234567'), '+905321234567')
        self.assertEqual(ContactResolver.normalize('+905321234567'), '+905321234567')
        self.assertEqual(ContactResolver.normalize('5321234567'), '+905321234567')

    def test_normalize_invalid(self):
        with self.assertRaises(ValidationError):
            ContactResolver.normalize('123')

    def test_upsert_idempotent(self):
        identity1, errors1 = ContactResolver.upsert_identity(
            self.kurum.id, '05321111111', label='İlk',
        )
        self.assertEqual(errors1, [])
        self.assertIsNotNone(identity1)

        identity2, errors2 = ContactResolver.upsert_identity(
            self.kurum.id, '05321111111', label='Güncel',
        )
        self.assertEqual(errors2, [])
        self.assertEqual(identity1.id, identity2.id)
        self.assertEqual(identity2.label, 'Güncel')

    def test_resolve_veli_phone_with_spaces(self):
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            ad='Ayşe',
            soyad='Veli',
            telefon='0532 999 88 77',
            veli_turu='anne',
            varsayilan=True,
        )
        resolved = ContactResolver.resolve_contact(self.kurum.id, '0532 999 88 77')
        self.assertEqual(resolved.veli_id, veli.id)
        self.assertEqual(resolved.contact_type, 'VELI')

    def test_resolve_matches_veli_phone(self):
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Veli',
            telefon='05329998877',
            sms_bildirimleri=['duyuru'],
        )
        resolved = ContactResolver.resolve_contact(self.kurum.id, '05329998877')
        self.assertEqual(resolved.veli_id, veli.id)
        self.assertEqual(resolved.ogrenci_id, self.student.id)
        self.assertEqual(resolved.contact_type, 'VELI')
        self.assertIsNotNone(resolved.identity)

    def test_resolve_refreshes_stale_identity(self):
        from apps.communication.domain.models import ContactIdentity

        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Veli',
            telefon='05328887766',
            sms_bildirimleri=['duyuru'],
        )
        ContactIdentity.objects.filter(
            kurum=self.kurum,
            e164='+905328887766',
        ).update(ogrenci_id=self.student.id, veli_id=None)
        resolved = ContactResolver.resolve_contact(self.kurum.id, '05328887766')
        self.assertEqual(resolved.veli_id, veli.id)
        self.assertEqual(resolved.contact_type, 'VELI')
        resolved.identity.refresh_from_db()
        self.assertEqual(resolved.identity.veli_id, veli.id)

    def test_veli_opt_in(self):
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='baba',
            ad='Mehmet',
            soyad='Veli',
            telefon='05321112233',
            sms_bildirimleri=['duyuru'],
        )
        self.assertTrue(ContactResolver.veli_allows_outbound(veli, 'duyuru'))
        self.assertFalse(ContactResolver.veli_allows_outbound(veli, 'odeme'))

    def test_veli_empty_sms_defaults_duyuru_and_devamsizlik_opt_in(self):
        veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Empty',
            soyad='Prefs',
            telefon='05324445566',
            sms_bildirimleri=[],
        )
        self.assertTrue(ContactResolver.veli_allows_outbound(veli, 'duyuru'))
        self.assertTrue(ContactResolver.veli_allows_outbound(veli, 'devamsizlik'))
        self.assertFalse(ContactResolver.veli_allows_outbound(veli, 'odeme'))


class InboundWebhookTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Webhook Kurum', kod='WHK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='WHK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Test',
            aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.student,
            veli_turu='anne',
            ad='Fatma',
            soyad='Test',
            telefon='05327776655',
            sms_bildirimleri=['duyuru'],
        )
        ChannelConfigRepository.upsert_whatsapp(
            self.kurum.id,
            {'phone_number_id': 'PNID123', 'is_active': True},
        )
        self.processor = InboundProcessor()

    def _inbound_payload(self, phone='905327776655', msg_id='wamid.inbound1', text='Merhaba'):
        return {
            'entry': [{
                'id': str(self.kurum.id),
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'metadata': {'phone_number_id': 'PNID123'},
                        'messages': [{
                            'from': phone,
                            'id': msg_id,
                            'timestamp': '1710000000',
                            'type': 'text',
                            'text': {'body': text},
                        }],
                    },
                }],
            }],
        }

    def test_inbound_creates_conversation_and_message(self):
        payload = self._inbound_payload()
        result = self.processor.process_webhook(payload, signature_valid=True)
        self.assertEqual(result['processed'], 1)
        self.assertEqual(result['errors'], [])

        conv = Conversation.objects.filter(kurum_id=self.kurum.id).first()
        self.assertIsNotNone(conv)
        self.assertEqual(conv.contact_phone, '+905327776655')
        self.assertEqual(conv.veli_id, self.veli.id)
        self.assertEqual(conv.unread_count_coach, 1)

        msg = Message.objects.filter(conversation=conv).first()
        self.assertIsNotNone(msg)
        self.assertEqual(msg.direction, MessageDirection.INBOUND)
        self.assertEqual(msg.body, 'Merhaba')
        self.assertEqual(msg.provider_message_id, 'wamid.inbound1')

    def test_status_webhook_idempotency(self):
        conv, _ = ConversationRepository.get_or_create_by_phone(
            self.kurum.id, Channel.WHATSAPP, '+905327776655',
        )
        message = MessageRepository.create(
            conversation=conv,
            direction=MessageDirection.OUTBOUND,
            body='Test',
            status=MessageStatus.PENDING,
            provider_message_id='wamid.out1',
        )

        status_payload = {
            'entry': [{
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'metadata': {'phone_number_id': 'PNID123'},
                        'statuses': [{
                            'id': 'wamid.out1',
                            'status': 'delivered',
                            'timestamp': '1710000001',
                        }],
                    },
                }],
            }],
        }

        self.processor.process_webhook(status_payload, signature_valid=True)
        self.processor.process_webhook(status_payload, signature_valid=True)

        self.assertEqual(MessageStatusEvent.objects.filter(message=message).count(), 1)
        message.refresh_from_db()
        self.assertEqual(message.status, MessageStatus.DELIVERED)


class CoachScopeAPITest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Scope Kurum', kod='SCP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SCP')

        self.student_a = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='A', soyad='Ogr', aktif_mi=True,
        )
        self.student_b = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='B', soyad='Ogr', aktif_mi=True,
        )

        self.coach_user = User.objects.create_user(username='coach_a', password='pass')
        _assign_role(self.coach_user, 'koc')
        self.coach_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='A',
            tc_kimlik_no='11111111111',
            user=self.coach_user,
        )
        self.coach_profile = CoachProfile.objects.create(
            teacher=self.coach_personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach_profile,
            student=self.student_a,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

        self.conv_a, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905321111111',
            ogrenci_id=self.student_a.id,
        )
        self.conv_b, _ = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905322222222',
            ogrenci_id=self.student_b.id,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach_user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_coach_cannot_access_other_coach_conversation(self):
        url = f'/api/communication/conversations/{self.conv_b.id}/'
        response = self.client.get(url, {'kurum_id': self.kurum.id})
        self.assertEqual(response.status_code, 403)

    def test_coach_can_access_assigned_student_conversation(self):
        url = f'/api/communication/conversations/{self.conv_a.id}/'
        response = self.client.get(url, {'kurum_id': self.kurum.id})
        self.assertEqual(response.status_code, 200)

    def test_notification_summary_scoped(self):
        self.conv_a.unread_count_coach = 3
        self.conv_a.save()
        self.conv_b.unread_count_coach = 5
        self.conv_b.save()

        response = self.client.get(
            '/api/communication/notifications/summary/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['unread_count'], 3)


class WebhookSignatureTest(TestCase):
    @override_settings(WHATSAPP_APP_SECRET='testsecret')
    def test_invalid_hmac_returns_403(self):
        payload = {'entry': []}
        body = json.dumps(payload).encode()
        client = Client()
        response = client.post(
            '/api/communication/webhook/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256='sha256=invalid',
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(WHATSAPP_APP_SECRET='testsecret')
    def test_valid_hmac_accepted(self):
        payload = {'entry': []}
        body = json.dumps(payload).encode()
        digest = hmac.new(b'testsecret', body, hashlib.sha256).hexdigest()
        client = Client()
        response = client.post(
            '/api/communication/webhook/',
            data=body,
            content_type='application/json',
            HTTP_X_HUB_SIGNATURE_256=f'sha256={digest}',
        )
        self.assertEqual(response.status_code, 200)


class ChannelConfigRepositoryTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Config Kurum', kod='CFGCOM')

    def test_upsert_whatsapp_config(self):
        config = ChannelConfigRepository.upsert_whatsapp(
            self.kurum.id,
            {'phone_number_id': '12345', 'is_active': True},
        )
        self.assertEqual(config.channel, Channel.WHATSAPP)
        self.assertEqual(config.phone_number_id, '12345')

        fetched = ChannelConfigRepository.get_whatsapp_config(self.kurum.id)
        self.assertEqual(fetched.id, config.id)


class InboundProcessorChallengeTest(TestCase):
    def test_verify_challenge(self):
        processor = InboundProcessor()
        result = processor.verify_challenge('subscribe', 'mytoken', 'challenge123', 'mytoken')
        self.assertEqual(result, 'challenge123')

    def test_verify_challenge_mismatch(self):
        processor = InboundProcessor()
        result = processor.verify_challenge('subscribe', 'wrong', 'challenge123', 'mytoken')
        self.assertIsNone(result)

    def test_verify_signature_without_secret(self):
        processor = InboundProcessor()
        self.assertTrue(processor.verify_signature(b'{}', 'sha256=abc', ''))


class OutboundQueueRepositoryTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Queue Kurum', kod='QUECOM')

    def test_pending_batch_empty(self):
        batch = OutboundQueueRepository.get_pending_batch(limit=10)
        self.assertEqual(len(batch), 0)
