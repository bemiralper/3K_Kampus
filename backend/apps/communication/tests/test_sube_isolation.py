"""
Şube zorunluluğu — iletişim modülü endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.domain.enums import CampaignStatus, Channel
from apps.communication.domain.models import Conversation, OutboundCampaign
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_communication_read(user):
    role, _ = Role.objects.get_or_create(
        code='comm_sube_test',
        defaults={'name': 'Comm Sube Test', 'level': 100, 'is_system_role': True},
    )
    for code in ('communication.read', 'communication.manage'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


def _assign_communication_bulk(user):
    role, _ = Role.objects.get_or_create(
        code='comm_sube_bulk_test',
        defaults={'name': 'Comm Sube Bulk Test', 'level': 100, 'is_system_role': True},
    )
    for code in ('communication.bulk', 'communication.read'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class CommunicationSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Comm Iso Kurum', kod='CISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='CISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='CISO-B')

        self.student_a = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            ad='Ali',
            soyad='A',
            aktif_mi=True,
        )
        self.student_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            ad='Veli',
            soyad='B',
            aktif_mi=True,
        )

        self.conv_a = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            channel=Channel.WHATSAPP,
            contact_phone='+905321111111',
            ogrenci=self.student_a,
        )
        self.conv_b = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            channel=Channel.WHATSAPP,
            contact_phone='+905322222222',
            ogrenci=self.student_b,
        )

        self.campaign_a = OutboundCampaign.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            title='Kampanya A',
            status=CampaignStatus.DRAFT,
        )
        self.campaign_b = OutboundCampaign.objects.create(
            kurum=self.kurum,
            sube=self.sube_b,
            title='Kampanya B',
            status=CampaignStatus.DRAFT,
        )

        self.user = User.objects.create_user(username='commiso', password='test')
        _assign_communication_read(self.user)
        self.client.force_authenticate(user=self.user)

        self.bulk_user = User.objects.create_user(username='commbulk', password='test')
        _assign_communication_bulk(self.bulk_user)

    def test_conversations_list_requires_sube_context(self):
        res = self.client.get(
            '/api/communication/conversations/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_conversations_list_success_with_sube_header(self):
        res = self.client.get(
            '/api/communication/conversations/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()['conversations']}
        self.assertIn(str(self.conv_a.id), ids)
        self.assertNotIn(str(self.conv_b.id), ids)

    def test_campaign_list_filtered_by_sube(self):
        self.client.force_authenticate(user=self.bulk_user)
        res = self.client.get(
            '/api/communication/campaigns/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        titles = {row['title'] for row in res.json()['campaigns']}
        self.assertIn('Kampanya A', titles)
        self.assertNotIn('Kampanya B', titles)
