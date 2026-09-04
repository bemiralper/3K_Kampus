"""Muhasebe sohbetlerinin görünürlüğü.

Muhasebe portalından gönderilen mesaja gelen cevabın muhasebe sohbetinde
kalması, bildirimlerin sohbeti göremeyen kişilere gitmemesi ve filtre dışında
kalan sohbetin tek satır ucundan açılabilmesi.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.inbound_processor import InboundProcessor
from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    ConversationStatus,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    Message,
)
from apps.communication.infrastructure.repository import ConversationRepository
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()

BASE = '/api/communication'
PHONE = '+905329998877'


def _grant(user, code, perms):
    role, _ = Role.objects.get_or_create(
        code=code,
        defaults={'name': code, 'level': 100, 'is_system_role': True},
    )
    for perm_code in perms:
        perm, _ = Permission.objects.get_or_create(
            code=perm_code,
            defaults={
                'name': perm_code,
                'module': perm_code.split('.')[0],
                'permission_type': 'write',
            },
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})
    return role


class InboundDepartmentContinuityTest(TestCase):
    """Cevap, kişiyle en son konuşan departmanın sohbetine düşer."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Dept Kurum', kod='DPT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DPT-M')
        # Hat koçluk olarak tanımlı; muhasebe aynı numarayı paylaşıyor.
        self.config = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Genel Hat',
            phone_number_id='PN_DEPT',
            department=CommunicationDepartment.COACHING,
            is_active=True,
            is_default=True,
        )
        self.processor = InboundProcessor()

    def _conv(self, department, *, minutes_ago):
        return Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone=PHONE,
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.REPLIED,
            department=department,
            channel_config=self.config,
            last_message_at=timezone.now() - timedelta(minutes=minutes_ago),
        )

    def _inbound(self, msg_id='wamid.dept1', text='Ödemeyi yaptım'):
        payload = {
            'entry': [{
                'id': str(self.kurum.id),
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'metadata': {'phone_number_id': 'PN_DEPT'},
                        'messages': [{
                            'from': PHONE.lstrip('+'),
                            'id': msg_id,
                            'timestamp': '1710000000',
                            'type': 'text',
                            'text': {'body': text},
                        }],
                    },
                }],
            }],
        }
        self.processor.process_webhook(payload, signature_valid=True)

    def test_reply_stays_in_accounting_thread(self):
        coaching = self._conv(CommunicationDepartment.COACHING, minutes_ago=600)
        accounting = self._conv(CommunicationDepartment.ACCOUNTING, minutes_ago=5)

        self._inbound()

        accounting.refresh_from_db()
        coaching.refresh_from_db()
        self.assertEqual(accounting.department, CommunicationDepartment.ACCOUNTING)
        self.assertEqual(
            Message.objects.filter(conversation=accounting).count(), 1,
        )
        self.assertEqual(Message.objects.filter(conversation=coaching).count(), 0)

    def test_reply_stays_in_coaching_when_coaching_spoke_last(self):
        coaching = self._conv(CommunicationDepartment.COACHING, minutes_ago=5)
        accounting = self._conv(CommunicationDepartment.ACCOUNTING, minutes_ago=600)

        self._inbound(msg_id='wamid.dept2')

        self.assertEqual(Message.objects.filter(conversation=coaching).count(), 1)
        self.assertEqual(Message.objects.filter(conversation=accounting).count(), 0)

    def test_new_contact_uses_channel_department(self):
        self._inbound(msg_id='wamid.dept3')

        conv = Conversation.objects.get(kurum=self.kurum, contact_phone=PHONE)
        self.assertEqual(conv.department, CommunicationDepartment.COACHING)

    def test_inbound_department_helper_ignores_other_line(self):
        other_config = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe Hattı',
            phone_number_id='PN_DEPT_2',
            department=CommunicationDepartment.ACCOUNTING,
            is_active=True,
        )
        conv = self._conv(CommunicationDepartment.ACCOUNTING, minutes_ago=5)
        conv.channel_config = other_config
        conv.save(update_fields=['channel_config'])

        resolved = ConversationRepository.inbound_department(
            self.kurum.id,
            Channel.WHATSAPP,
            PHONE,
            channel_config=self.config,
        )
        self.assertEqual(resolved, CommunicationDepartment.COACHING)


class ConversationItemViewTest(TestCase):
    """Filtre dışında kalan sohbet tek satır ucundan açılabilir."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Item Kurum', kod='ITM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ITM-M')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Kaya', aktif_mi=True,
        )
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905320000010',
            contact_name='Ece Kaya',
            ogrenci=self.student,
            department=CommunicationDepartment.COACHING,
            status=ConversationStatus.OPEN,
        )
        self.user = User.objects.create_user(username='item_user', password='x')
        _grant(self.user, 'item_test', ['communication.read', 'communication.manage'])
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_returns_conversation_outside_active_filters(self):
        listed = self.client.get(
            f'{BASE}/conversations/?kurum_id={self.kurum.id}'
            f'&department={CommunicationDepartment.ACCOUNTING}',
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(
            [c['id'] for c in listed.json()['conversations']], [],
        )

        res = self.client.get(
            f'{BASE}/conversations/{self.conv.id}/item/?kurum_id={self.kurum.id}',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['id'], str(self.conv.id))
        self.assertEqual(res.json()['contact_name'], 'Ece Kaya')

    def test_unknown_conversation_returns_404(self):
        res = self.client.get(
            f'{BASE}/conversations/00000000-0000-0000-0000-000000000000/item/'
            f'?kurum_id={self.kurum.id}',
        )
        self.assertEqual(res.status_code, 404)


class WhatsAppNotifyRecipientsTest(TestCase):
    """Sohbetin departmanını göremeyen kişiye bildirim gitmez."""

    def setUp(self):
        from datetime import date

        from apps.coaching.models import CoachProfile, CoachStudentAssignment
        from apps.personel.domain.models import Personel

        self.kurum = Kurum.objects.create(ad='Notify Kurum', kod='NTF')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='NTF-M')
        self.coach_user = User.objects.create_user(username='ntf_coach', password='x')
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Koç',
            soyad='Notify',
            tc_kimlik_no='44444444444',
            user=self.coach_user,
        )
        self.coach = CoachProfile.objects.create(
            teacher=personel, capacity=10, is_active=True, is_coach=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Efe', soyad='Notify', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach, student=self.student,
            start_date=date(2026, 1, 1), is_primary=True,
        )
        self.admin = User.objects.create_superuser(
            username='ntf_admin', password='x', email='ntf@example.com',
        )

    def _conv(self, department):
        return Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905320000020',
            contact_type=RecipientType.OGRENCI,
            ogrenci=self.student,
            assigned_coach=self.coach,
            department=department,
            status=ConversationStatus.NEW,
        )

    def test_coach_not_notified_for_accounting_thread(self):
        from apps.communication.application.whatsapp_notifications import (
            resolve_whatsapp_notify_user_ids,
        )

        ids = resolve_whatsapp_notify_user_ids(
            self._conv(CommunicationDepartment.ACCOUNTING),
        )
        self.assertNotIn(self.coach_user.id, ids)

    def test_coach_notified_for_coaching_thread(self):
        from apps.communication.application.whatsapp_notifications import (
            resolve_whatsapp_notify_user_ids,
        )

        ids = resolve_whatsapp_notify_user_ids(
            self._conv(CommunicationDepartment.COACHING),
        )
        self.assertIn(self.coach_user.id, ids)

    def test_accounting_sender_gets_notification(self):
        from apps.communication.application.whatsapp_notifications import (
            resolve_whatsapp_notify_user_ids,
        )
        from apps.communication.domain.enums import (
            MessageDirection,
            MessageStatus,
            MessageType,
        )

        muhasebe = User.objects.create_user(username='ntf_muh', password='x')
        _grant(muhasebe, 'ntf_muh_role', [
            'communication.read', 'communication.write', 'finans.manage',
        ])
        conv = self._conv(CommunicationDepartment.ACCOUNTING)
        Message.objects.create(
            conversation=conv,
            direction=MessageDirection.OUTBOUND,
            message_type=MessageType.TEXT,
            status=MessageStatus.SENT,
            body='Taksit hatırlatması',
            sender_user=muhasebe,
        )

        ids = resolve_whatsapp_notify_user_ids(conv)
        self.assertIn(muhasebe.id, ids)
        self.assertNotIn(self.coach_user.id, ids)
