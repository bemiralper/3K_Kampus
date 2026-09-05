"""Yeni Sohbetler ekranının uçları — sabitleme, susturma, yıldız, silme, arama.

Kişiye özel durumların (sabitleme/susturma/yıldız) gerçekten kullanıcı bazlı
tutulduğunu ve soft delete'in listeden düşürdüğünü doğrular.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.domain.enums import (
    Channel,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    MessageType,
)
from apps.communication.domain.models import Conversation, Message
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

BASE = '/api/communication'


def _grant(user, code='chat_actions_test'):
    role, _ = Role.objects.get_or_create(
        code=code,
        defaults={'name': code, 'level': 100, 'is_system_role': True},
    )
    for perm_code in ('communication.read', 'communication.manage'):
        perm, _ = Permission.objects.get_or_create(
            code=perm_code,
            defaults={
                'name': perm_code,
                'module': 'communication',
                'permission_type': 'write',
            },
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class ChatActionsAPITest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Chat Kurum', kod='CHAT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CHAT-M')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Deniz', soyad='Yıldız', aktif_mi=True,
        )
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905320000001',
            contact_name='Deniz Yıldız',
            ogrenci=self.student,
            status=ConversationStatus.OPEN,
            unread_count_coach=2,
        )
        self.other_conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905320000002',
            contact_name='Başka Kişi',
        )
        self.message = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.INBOUND,
            message_type=MessageType.TEXT,
            status=MessageStatus.DELIVERED,
            body='Ödev teslimi ne zaman?',
        )
        Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEXT,
            status=MessageStatus.SENT,
            body='Yarın akşam saat 20:00.',
        )

        self.user = User.objects.create_user(username='chatuser', password='test')
        _grant(self.user)
        self.other_user = User.objects.create_user(username='chatuser2', password='test')
        _grant(self.other_user, code='chat_actions_test_2')

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    # ── sabitleme / susturma kişiye özel ──

    def test_pin_is_per_user(self):
        res = self.client.patch(
            f'{BASE}/conversations/{self.conv.id}/pin/',
            {'kurum_id': self.kurum.id, 'pin': True},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_pinned'])

        other = APIClient()
        other.force_authenticate(user=self.other_user)
        other.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        res = other.get(f'{BASE}/conversations/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 200)
        rows = {row['id']: row for row in res.json()['conversations']}
        self.assertFalse(rows[str(self.conv.id)]['is_pinned'])

    def test_mute_sets_expiry(self):
        res = self.client.patch(
            f'{BASE}/conversations/{self.conv.id}/mute/',
            {'kurum_id': self.kurum.id, 'mute': True, 'hours': 8},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_muted'])
        self.assertIsNotNone(res.json()['muted_until'])

    def test_pinned_filter_returns_only_pinned(self):
        self.client.patch(
            f'{BASE}/conversations/{self.conv.id}/pin/',
            {'kurum_id': self.kurum.id, 'pin': True},
            format='json',
        )
        res = self.client.get(
            f'{BASE}/conversations/', {'kurum_id': self.kurum.id, 'pinned': 'true'},
        )
        ids = {row['id'] for row in res.json()['conversations']}
        self.assertEqual(ids, {str(self.conv.id)})

    # ── okundu / okunmadı ──

    def test_mark_unread_then_read(self):
        res = self.client.patch(
            f'{BASE}/conversations/{self.conv.id}/unread/',
            {'kurum_id': self.kurum.id},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertGreater(res.json()['unread_count_coach'], 0)

        res = self.client.post(
            f'{BASE}/conversations/read-all/', {'kurum_id': self.kurum.id}, format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.unread_count_coach, 0)

    # ── soft delete ──

    def test_delete_hides_conversation_from_list(self):
        res = self.client.delete(
            f'{BASE}/conversations/{self.conv.id}/delete/',
            {'kurum_id': self.kurum.id},
            format='json',
        )
        self.assertEqual(res.status_code, 200)

        res = self.client.get(f'{BASE}/conversations/', {'kurum_id': self.kurum.id})
        ids = {row['id'] for row in res.json()['conversations']}
        self.assertNotIn(str(self.conv.id), ids)
        self.conv.refresh_from_db()
        self.assertIsNotNone(self.conv.deleted_at)

    def test_deleted_message_disappears_from_thread(self):
        res = self.client.delete(
            f'{BASE}/conversations/{self.conv.id}/messages/{self.message.id}/delete/',
            {'kurum_id': self.kurum.id},
            format='json',
        )
        self.assertEqual(res.status_code, 200)

        res = self.client.get(
            f'{BASE}/conversations/{self.conv.id}/messages/', {'kurum_id': self.kurum.id},
        )
        ids = {row['id'] for row in res.json()['messages']}
        self.assertNotIn(str(self.message.id), ids)

    # ── yıldız / sabitleme ──

    def test_star_is_per_user_and_listed(self):
        res = self.client.patch(
            f'{BASE}/conversations/{self.conv.id}/messages/{self.message.id}/star/',
            {'kurum_id': self.kurum.id, 'star': True},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_starred'])

        res = self.client.get(f'{BASE}/messages/starred/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual([m['id'] for m in res.json()['messages']], [str(self.message.id)])

        other = APIClient()
        other.force_authenticate(user=self.other_user)
        other.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        res = other.get(f'{BASE}/messages/starred/', {'kurum_id': self.kurum.id})
        self.assertEqual(res.json()['messages'], [])

    def test_pin_message_is_conversation_wide_and_single(self):
        second = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.INBOUND,
            message_type=MessageType.TEXT,
            status=MessageStatus.DELIVERED,
            body='İkinci mesaj',
        )
        for msg in (self.message, second):
            res = self.client.patch(
                f'{BASE}/conversations/{self.conv.id}/messages/{msg.id}/pin/',
                {'kurum_id': self.kurum.id, 'pin': True},
                format='json',
            )
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.json()['is_pinned'])

        self.message.refresh_from_db()
        self.assertIsNone(self.message.pinned_at)

        # Sabitlenmiş mesaj sohbeti gören herkes için aynı.
        other = APIClient()
        other.force_authenticate(user=self.other_user)
        other.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        res = other.get(
            f'{BASE}/conversations/{self.conv.id}/messages/', {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.json()['pinned_message']['id'], str(second.id))

    # ── sohbet içi arama ve bağlam ──

    def test_search_in_conversation(self):
        res = self.client.get(
            f'{BASE}/conversations/{self.conv.id}/messages/search/',
            {'kurum_id': self.kurum.id, 'q': 'ödev'},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual([r['id'] for r in res.json()['results']], [str(self.message.id)])

    def test_message_context_includes_anchor(self):
        res = self.client.get(
            f'{BASE}/conversations/{self.conv.id}/messages/{self.message.id}/context/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['anchor_id'], str(self.message.id))
        self.assertIn(str(self.message.id), [m['id'] for m in res.json()['messages']])

    # ── liste filtreleri ──

    def test_message_content_search_matches_conversation(self):
        """`search_messages=1` gönderilince arama mesaj gövdesini de tarar."""
        res = self.client.get(
            f'{BASE}/conversations/',
            {'kurum_id': self.kurum.id, 'search': 'ödev teslimi', 'search_messages': '1'},
        )
        ids = {row['id'] for row in res.json()['conversations']}
        self.assertIn(str(self.conv.id), ids)
        self.assertNotIn(str(self.other_conv.id), ids)

    def test_search_without_flag_stays_on_contact_fields(self):
        res = self.client.get(
            f'{BASE}/conversations/', {'kurum_id': self.kurum.id, 'search': 'ödev teslimi'},
        )
        self.assertEqual(res.json()['conversations'], [])

    def test_since_filter(self):
        Conversation.objects.filter(id=self.other_conv.id).update(
            last_message_at=timezone.now() - timedelta(days=3),
        )
        Conversation.objects.filter(id=self.conv.id).update(last_message_at=timezone.now())
        res = self.client.get(
            f'{BASE}/conversations/', {'kurum_id': self.kurum.id, 'since': '24h'},
        )
        ids = {row['id'] for row in res.json()['conversations']}
        self.assertIn(str(self.conv.id), ids)
        self.assertNotIn(str(self.other_conv.id), ids)

    def test_list_pagination(self):
        res = self.client.get(
            f'{BASE}/conversations/', {'kurum_id': self.kurum.id, 'limit': 1, 'offset': 0},
        )
        body = res.json()
        self.assertEqual(len(body['conversations']), 1)
        self.assertTrue(body['has_more'])
        self.assertEqual(body['total'], 2)


class ChatContextAPITest(TestCase):
    """Sağ bilgi paneli — öğrenci/veli bağlamı."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ctx Kurum', kod='CTX')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='CTX-M')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Kaya', aktif_mi=True,
        )
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905320000003',
            contact_name='Ece Kaya',
            ogrenci=self.student,
        )
        self.user = User.objects.create_user(username='ctxuser', password='test')
        _grant(self.user, code='chat_ctx_test')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_context_returns_student_core_info(self):
        res = self.client.get(
            f'{BASE}/conversations/{self.conv.id}/context/', {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['ogrenci']['ad_soyad'], 'Ece Kaya')
        self.assertEqual(body['ogrenci']['sube'], 'Merkez')
        self.assertEqual(body['contact']['phone'], '+905320000003')
        self.assertEqual(body['veliler'], [])
