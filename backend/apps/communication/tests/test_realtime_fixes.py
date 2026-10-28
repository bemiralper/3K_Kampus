"""Sohbet canlı akış düzeltmeleri: artımlı mesaj sınırı, tik damgası, portal bazlı okundu, rozet özeti."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
)
from apps.communication.domain.models import Conversation, ConversationUserState, Message
from apps.communication.infrastructure.repository import (
    MessageRepository,
    MessageStatusEventRepository,
)
from apps.communication.tests.test_list_performance import _grant
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class ListSinceWindowTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Win Kurum', kod='WIN')
        self.conv = Conversation.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, contact_phone='+905321110001',
        )
        base = timezone.now() - timedelta(hours=1)
        self.old = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='eski',
            status=MessageStatus.SENT, created_at=base,
        )
        self.anchor = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='anchor',
            status=MessageStatus.SENT, created_at=base + timedelta(minutes=1),
        )
        for m in (self.old, self.anchor):
            Message.objects.filter(id=m.id).update(updated_at=m.created_at)
        self.newer = [
            Message.objects.create(
                conversation=self.conv, direction=MessageDirection.INBOUND, body=f'yeni {i}',
                created_at=base + timedelta(minutes=2 + i),
            )
            for i in range(5)
        ]

    def test_truncated_flag_when_new_messages_exceed_limit(self):
        msgs, truncated = MessageRepository.list_since_window(
            self.conv.id, after_id=self.anchor.id, limit=3,
        )
        self.assertTrue(truncated)
        self.assertEqual([m.id for m in msgs], [m.id for m in self.newer[:3]])

    def test_status_changes_do_not_push_out_new_messages(self):
        Message.objects.filter(id=self.old.id).update(
            status=MessageStatus.DELIVERED, updated_at=timezone.now(),
        )
        msgs, truncated = MessageRepository.list_since_window(
            self.conv.id, after_id=self.anchor.id, limit=5,
        )
        self.assertFalse(truncated)
        ids = [m.id for m in msgs]
        self.assertEqual(ids[0], self.old.id)
        self.assertEqual(ids[1:], [m.id for m in self.newer])

    def test_list_since_keeps_previous_contract(self):
        ids = {m.id for m in MessageRepository.list_since(self.conv.id, after_id=self.anchor.id)}
        self.assertEqual(ids, {m.id for m in self.newer})


class StatusUpdateTouchesConversationTest(TestCase):
    def test_delivery_status_bumps_conversation_stamp(self):
        kurum = Kurum.objects.create(ad='Tik Kurum', kod='TIK')
        conv = Conversation.objects.create(
            kurum=kurum, channel=Channel.WHATSAPP, contact_phone='+905321110002',
        )
        msg = Message.objects.create(
            conversation=conv, direction=MessageDirection.OUTBOUND, body='merhaba',
            status=MessageStatus.SENT,
        )
        old = timezone.now() - timedelta(hours=2)
        Conversation.objects.filter(id=conv.id).update(updated_at=old)

        _, applied = MessageStatusEventRepository.apply_status_update(
            msg, meta_status='delivered', provider_event_id='wamid-1', occurred_at=timezone.now(),
        )
        self.assertTrue(applied)
        conv.refresh_from_db()
        self.assertGreater(conv.updated_at, old)


class PortalApiTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Portal Kurum', kod='PRT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PRT-M')
        self.admin = User.objects.create_user(username='prt-admin', password='x')
        _grant(self.admin, 'prt_manage', 'communication.manage', 'communication.read')
        Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Ad', soyad='Min', user=self.admin)
        self.client.force_authenticate(user=self.admin)
        self.hdr = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}

        def conv(i, department):
            return Conversation.objects.create(
                kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP,
                contact_phone=f'+90532220000{i}', unread_count_coach=2,
                status=ConversationStatus.NEW, last_message_at=timezone.now(),
                department=department,
            )

        self.coaching = [conv(i, CommunicationDepartment.COACHING) for i in range(2)]
        self.accounting = [conv(5, CommunicationDepartment.ACCOUNTING)]

    def test_read_all_respects_portal_department(self):
        res = self.client.post(
            '/api/communication/conversations/read-all/',
            {'kurum_id': self.kurum.id, 'department': CommunicationDepartment.COACHING},
            format='json', **self.hdr,
        )
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual(data['updated'], 2)
        # Yönetici görünümü: koç sayacı korunur ve istemciye bildirilir
        self.assertFalse(data['counters_reset'])
        cleared = set(
            ConversationUserState.objects.filter(
                user=self.admin, notif_cleared_at__isnull=False,
            ).values_list('conversation_id', flat=True)
        )
        self.assertEqual(cleared, {c.id for c in self.coaching})

    def test_summary_without_cards_returns_counts_only(self):
        url = '/api/communication/notifications/summary/'
        full = self.client.get(url, {'kurum_id': self.kurum.id}, **self.hdr)
        self.assertEqual(full.status_code, 200, full.content)
        self.assertEqual(len(full.json()['cards']), 3)

        slim = self.client.get(url, {'kurum_id': self.kurum.id, 'cards': '0'}, **self.hdr).json()
        self.assertEqual(slim['cards'], [])
        self.assertEqual(slim['unread_conversations'], 3)
        self.assertEqual(slim['unread_count'], 6)

    def test_incremental_messages_report_truncation(self):
        conv = self.coaching[0]
        anchor = Message.objects.create(
            conversation=conv, direction=MessageDirection.INBOUND, body='a',
        )
        res = self.client.get(
            f'/api/communication/conversations/{conv.id}/messages/',
            {'kurum_id': self.kurum.id, 'after': str(anchor.id)},
            **self.hdr,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIs(res.json()['has_more_after'], False)
