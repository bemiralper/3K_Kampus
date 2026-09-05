"""İletişim paneli dashboard serileri."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.dashboard_service import build_communication_dashboard
from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    RecipientType,
)
from apps.communication.domain.models import Conversation, Message
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _grant(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='comm_dash_test',
        defaults={'name': 'Comm Dash Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class CommunicationDashboardServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Dash Kurum', kod='DASHK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DASH-M')
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905551112233',
            contact_type=RecipientType.VELI,
            contact_name='Ayşe Veli',
            department=CommunicationDepartment.COACHING,
            status=ConversationStatus.NEEDS_SUPPORT,
            first_unanswered_at=timezone.now() - timedelta(minutes=45),
            unread_count_coach=2,
        )
        Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.INBOUND,
            body='Merhaba',
            status=MessageStatus.DELIVERED,
        )
        Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='PDF',
            status=MessageStatus.FAILED,
            source_module='odev',
            failed_reason='Message undeliverable',
        )

    def test_build_includes_live_series_and_alerts(self):
        data = build_communication_dashboard(self.kurum.id, self.sube.id)
        self.assertEqual(data['active_conversations'], 1)
        self.assertEqual(data['sla_breaches'], 1)
        self.assertEqual(data['daily_inbound'], 1)
        self.assertEqual(data['daily_outbound'], 1)
        self.assertEqual(data['today_failed'], 1)
        self.assertEqual(len(data['daily_trend']), 14)
        self.assertEqual(len(data['busy_hours']), 24)
        self.assertTrue(any(row['key'] == 'COACHING' for row in data['by_department']))
        self.assertTrue(any(row['key'] == 'VELI' for row in data['by_contact_type']))
        self.assertTrue(any(row['key'] == 'odev' for row in data['by_source']))
        self.assertIn('iletilemedi', data['recent_failures'][0]['reason'].lower())
        alert_keys = {row['key'] for row in data['alerts']}
        self.assertIn('sla', alert_keys)
        self.assertIn('failed', alert_keys)
        aging_60 = next(row for row in data['sla_aging'] if row['key'] == '30_60')
        self.assertEqual(aging_60['count'], 1)

    def test_closed_conversation_excluded_from_active(self):
        self.conv.status = ConversationStatus.CLOSED
        self.conv.save(update_fields=['status'])
        data = build_communication_dashboard(self.kurum.id, self.sube.id)
        self.assertEqual(data['active_conversations'], 0)


class CommunicationDashboardAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Dash API', kod='DASHA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DASHA-M')
        self.user = User.objects.create_user(username='dashuser', password='x')
        _grant(self.user, 'communication.read', 'communication.manage')
        self.client.force_authenticate(user=self.user)

    def test_requires_manage_and_returns_payload(self):
        res = self.client.get(
            '/api/communication/dashboard/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn('daily_trend', body)
        self.assertIn('alerts', body)
        self.assertEqual(len(body['daily_trend']), 14)
