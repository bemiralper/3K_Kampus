"""Faz 3 — webhook ve veri bütünlüğü: tekrar, sıra, bilinmeyen hat, silinen sohbet, imza, moderasyon."""
import hashlib
import hmac
import json
from datetime import datetime, timezone as dt_tz

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from rest_framework.test import APIClient

from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import Channel, ConversationStatus, WebhookProcessingStatus
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    Message,
    RawWebhookEvent,
)
from apps.communication.infrastructure.repository import ConversationRepository
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _payload(phone_number_id, *, msg_id, phone='905327776655', ts='1710000000', text='Merhaba'):
    return {
        'entry': [{
            'id': 'waba-1',
            'changes': [{
                'field': 'messages',
                'value': {
                    'metadata': {'phone_number_id': phone_number_id},
                    'messages': [{
                        'from': phone, 'id': msg_id, 'timestamp': ts,
                        'type': 'text', 'text': {'body': text},
                    }],
                },
            }],
        }],
    }


class InboundIntegrityTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Integrity Kurum', kod='INTG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='INTG-M')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ze', soyad='Yn', aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.student, veli_turu='anne', ad='Fa', soyad='Tma',
            telefon='05327776655', sms_bildirimleri=['duyuru'],
        )
        self.cfg = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, phone_number_id='PN-INTG', is_active=True,
        )
        self.processor = InboundProcessor()

    def test_duplicate_webhook_creates_single_message(self):
        payload = _payload('PN-INTG', msg_id='wamid.dup1')
        self.processor.process_webhook(payload, signature_valid=True)
        self.processor.process_webhook(payload, signature_valid=True)
        self.assertEqual(Message.objects.filter(provider_message_id='wamid.dup1').count(), 1)
        conv = Conversation.objects.get(kurum=self.kurum)
        self.assertEqual(conv.unread_count_coach, 1)

    def test_inbound_uses_meta_timestamp_for_ordering(self):
        # Yeni mesaj önce, eski mesaj (geciken webhook) sonra gelir
        self.processor.process_webhook(
            _payload('PN-INTG', msg_id='wamid.new', ts='1710000100', text='yeni'), signature_valid=True,
        )
        self.processor.process_webhook(
            _payload('PN-INTG', msg_id='wamid.old', ts='1710000000', text='eski'), signature_valid=True,
        )
        bodies = list(Message.objects.filter(conversation__kurum=self.kurum).order_by('created_at')
                      .values_list('body', flat=True))
        self.assertEqual(bodies, ['eski', 'yeni'])
        old = Message.objects.get(provider_message_id='wamid.old')
        self.assertEqual(old.created_at, datetime.fromtimestamp(1710000000, tz=dt_tz.utc))
        conv = Conversation.objects.get(kurum=self.kurum)
        # Son mesaj zamanı geri gitmez
        self.assertEqual(conv.last_message_at, datetime.fromtimestamp(1710000100, tz=dt_tz.utc))
        self.assertEqual(conv.last_message_preview, 'eski')

    def test_unknown_phone_number_id_is_skipped_with_error(self):
        result = self.processor.process_webhook(
            _payload('PN-UNKNOWN', msg_id='wamid.unk'), signature_valid=True,
        )
        self.assertEqual(result['processed'], 0)
        self.assertTrue(any('unknown phone_number_id' in e for e in result['errors']))
        event = RawWebhookEvent.objects.get(provider_message_id='wamid.unk')
        self.assertEqual(event.processing_status, WebhookProcessingStatus.SKIPPED)
        self.assertEqual(Message.objects.count(), 0)

    def test_deleted_conversation_is_revived_on_inbound(self):
        self.processor.process_webhook(_payload('PN-INTG', msg_id='wamid.first'), signature_valid=True)
        conv = Conversation.objects.get(kurum=self.kurum)
        ConversationRepository.soft_delete(conv)
        conv.refresh_from_db()
        self.assertIsNotNone(conv.deleted_at)

        self.processor.process_webhook(
            _payload('PN-INTG', msg_id='wamid.second', ts='1710000500', text='tekrar'),
            signature_valid=True,
        )
        self.assertEqual(Conversation.objects.filter(kurum=self.kurum).count(), 1)
        conv.refresh_from_db()
        self.assertIsNone(conv.deleted_at)
        self.assertNotEqual(conv.status, ConversationStatus.CLOSED)
        listed = ConversationRepository.list_by_kurum_and_sube(self.kurum.id, self.sube.id)
        self.assertIn(conv.id, list(listed.values_list('id', flat=True)))

    def test_log_body_masks_phone_numbers(self):
        from apps.communication.domain.models import CommunicationLog

        self.processor.process_webhook(_payload('PN-INTG', msg_id='wamid.mask'), signature_valid=True)
        log = CommunicationLog.objects.filter(endpoint='/webhook/').latest('created_at')
        self.assertNotIn('905327776655', log.request_body)


@override_settings(DEBUG=False, WHATSAPP_APP_SECRET='')
class WebhookAccountSecretTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Secret Kurum', kod='SCRT')
        self.cfg = CommunicationChannelConfig.objects.create(
            kurum=self.kurum, phone_number_id='PN-SCRT', is_active=True,
            app_secret_encrypted='hat-secret',
        )
        self.client = Client()

    def _post(self, payload, secret=None):
        body = json.dumps(payload).encode()
        headers = {}
        if secret is not None:
            digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            headers['HTTP_X_HUB_SIGNATURE_256'] = f'sha256={digest}'
        return self.client.post(
            '/api/communication/webhook/', data=body, content_type='application/json', **headers,
        )

    def test_account_secret_accepted(self):
        res = self._post(_payload('PN-SCRT', msg_id='wamid.s1', phone='905321234567'), secret='hat-secret')
        self.assertEqual(res.status_code, 200, res.content)

    def test_wrong_signature_rejected_without_db_write(self):
        before = RawWebhookEvent.objects.count()
        res = self._post(_payload('PN-SCRT', msg_id='wamid.s2'), secret='yanlis')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(RawWebhookEvent.objects.count(), before)

    def test_no_secret_anywhere_is_rejected_outside_debug(self):
        res = self._post(_payload('PN-NOSECRET', msg_id='wamid.s3'))
        self.assertEqual(res.status_code, 403)


class ModerationPermissionTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Mod Kurum', kod='MODK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MODK-M')
        self.conv = Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP, contact_phone='+905320000001',
        )
        self.inbound = Message.objects.create(
            conversation=self.conv, direction='INBOUND', message_type='TEXT', body='veli yazdı',
        )
        self.reader = User.objects.create_user(username='mod-reader', password='x')
        role, _ = Role.objects.get_or_create(
            code='mod_reader', defaults={'name': 'Mod Reader', 'level': 100, 'is_system_role': True},
        )
        # ogrenci.read → "staff messaging" erişimi: sohbeti görür, ama moderatör değildir
        for code in ('communication.read', 'communication.write', 'ogrenci.read'):
            perm, _ = Permission.objects.get_or_create(
                code=code, defaults={'name': code, 'module': code.split('.')[0], 'permission_type': 'write'},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.reader, defaults={'role': role})
        self.client.force_authenticate(user=self.reader)
        self.hdr = {'HTTP_X_SUBE_ID': str(self.sube.id)}

    def test_non_owner_cannot_delete_conversation_or_inbound_message(self):
        row = self.client.get(
            f'/api/communication/conversations/{self.conv.id}/item/',
            {'kurum_id': self.kurum.id}, **self.hdr,
        )
        self.assertEqual(row.status_code, 200, row.content)
        self.assertFalse(row.json()['can_moderate'])
        res = self.client.delete(
            f'/api/communication/conversations/{self.conv.id}/delete/',
            {'kurum_id': self.kurum.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 403)
        res = self.client.delete(
            f'/api/communication/conversations/{self.conv.id}/messages/{self.inbound.id}/delete/',
            {'kurum_id': self.kurum.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 403)
        self.conv.refresh_from_db()
        self.assertIsNone(self.conv.deleted_at)

    def test_claimer_can_delete_and_list_row_exposes_can_moderate(self):
        self.conv.claimed_by_user = self.reader
        self.conv.save(update_fields=['claimed_by_user'])
        row = self.client.get(
            f'/api/communication/conversations/{self.conv.id}/item/',
            {'kurum_id': self.kurum.id}, **self.hdr,
        )
        self.assertEqual(row.status_code, 200, row.content)
        self.assertTrue(row.json()['can_moderate'])
        res = self.client.delete(
            f'/api/communication/conversations/{self.conv.id}/delete/',
            {'kurum_id': self.kurum.id}, format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 200, res.content)
