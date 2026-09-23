"""
Şube zorunluluğu — iletişim modülü endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.domain.enums import CampaignStatus, Channel, RecipientType
from apps.communication.domain.models import Conversation, OutboundCampaign
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.interfaces.sube_context import filter_conversations_by_sube
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

    def test_unmatched_raw_phone_visible_in_every_sube_inbox(self):
        """Kayıtsız numara (null şube) tüm şube listelerinde görünür."""
        raw = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905339998877',
            contact_type=RecipientType.RAW_PHONE,
            sube=None,
            ogrenci=None,
            veli=None,
        )
        res_a = self.client.get(
            '/api/communication/conversations/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        res_b = self.client.get(
            '/api/communication/conversations/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_b.status_code, 200)
        ids_a = {row['id'] for row in res_a.json()['conversations']}
        ids_b = {row['id'] for row in res_b.json()['conversations']}
        self.assertIn(str(raw.id), ids_a)
        self.assertIn(str(raw.id), ids_b)
        # Diğer şubenin eşleşmiş sohbeti hâlâ gizlenir
        self.assertNotIn(str(self.conv_b.id), ids_a)

    def test_unmatched_raw_phone_detail_accessible(self):
        raw = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905339998866',
            contact_type=RecipientType.RAW_PHONE,
        )
        res = self.client.get(
            f'/api/communication/conversations/{raw.id}/',
            {'kurum_id': self.kurum.id},
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['id'], str(raw.id))

    def test_filter_conversations_by_sube_includes_orphans(self):
        raw = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905339998855',
            contact_type=RecipientType.RAW_PHONE,
        )
        qs = filter_conversations_by_sube(
            Conversation.objects.filter(kurum=self.kurum),
            self.sube_a.id,
        )
        ids = set(qs.values_list('id', flat=True))
        self.assertIn(raw.id, ids)
        self.assertIn(self.conv_a.id, ids)
        self.assertNotIn(self.conv_b.id, ids)

    def test_get_or_create_unmatched_keeps_null_sube_for_all_subes_account(self):
        conv, created = ConversationRepository.get_or_create_for_contact(
            self.kurum.id,
            Channel.WHATSAPP,
            '+905551112233',
            contact_type=RecipientType.RAW_PHONE,
        )
        self.assertTrue(created)
        self.assertIsNone(conv.sube_id)
        self.assertEqual(conv.contact_type, RecipientType.RAW_PHONE)


class CrossKurumAccessTest(TestCase):
    """Kurum bağı olan kullanıcı başka kurumun kimliğiyle iletişim verisine ulaşamaz."""

    def setUp(self):
        from apps.personel.domain.models import Personel

        self.client = APIClient()
        self.kurum_a = Kurum.objects.create(ad='Kurum A', kod='XK-A')
        self.kurum_b = Kurum.objects.create(ad='Kurum B', kod='XK-B')
        self.sube_a = Sube.objects.create(kurum=self.kurum_a, ad='A Merkez', kod='XK-A-M')
        self.sube_b = Sube.objects.create(kurum=self.kurum_b, ad='B Merkez', kod='XK-B-M')
        Conversation.objects.create(
            kurum=self.kurum_b, sube=self.sube_b, channel=Channel.WHATSAPP,
            contact_phone='+905329999999',
        )

        # Kurum A'ya bağlı yönetici (kurum_yoneticisi rolü, personel kaydı A'da)
        self.user = User.objects.create_user(username='xk-yonetici', password='test')
        role, _ = Role.objects.get_or_create(
            code='kurum_yoneticisi',
            defaults={'name': 'Kurum Yöneticisi', 'level': 10, 'is_system_role': True},
        )
        for code in ('communication.read', 'communication.manage', 'communication.config'):
            perm, _ = Permission.objects.get_or_create(
                code=code,
                defaults={'name': code, 'module': 'communication', 'permission_type': 'read'},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)
        UserRole.objects.update_or_create(user=self.user, defaults={'role': role, 'kurum': self.kurum_a})
        Personel.objects.create(
            kurum=self.kurum_a, sube=self.sube_a, ad='Yön', soyad='A',
            user=self.user, aktif_mi=True,
        )
        self.client.force_authenticate(user=self.user)

    def _get(self, path, kurum, sube):
        return self.client.get(
            path, {'kurum_id': kurum.id}, HTTP_X_KURUM_ID=str(kurum.id), HTTP_X_SUBE_ID=str(sube.id),
        )

    def test_own_kurum_is_accessible(self):
        res = self._get('/api/communication/conversations/', self.kurum_a, self.sube_a)
        self.assertEqual(res.status_code, 200)

    def test_other_kurum_conversations_forbidden(self):
        res = self._get('/api/communication/conversations/', self.kurum_b, self.sube_b)
        self.assertEqual(res.status_code, 403)

    def test_other_kurum_config_forbidden(self):
        res = self._get('/api/communication/config/whatsapp/', self.kurum_b, self.sube_b)
        self.assertEqual(res.status_code, 403)
        res = self.client.put(
            '/api/communication/config/whatsapp/',
            {'kurum_id': self.kurum_b.id, 'phone_number_id': 'hijack'},
            format='json', HTTP_X_KURUM_ID=str(self.kurum_b.id), HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_other_kurum_notification_binding_forbidden(self):
        res = self.client.put(
            '/api/communication/notification-bindings/',
            {'kurum_id': self.kurum_b.id, 'event_key': 'x', 'recipient_type': 'VELI'},
            format='json', HTTP_X_KURUM_ID=str(self.kurum_b.id), HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_foreign_scope_sube_in_body_forbidden(self):
        """Kendi kurumunda ama başka kurumun şubesini kapsam olarak vermek de reddedilir."""
        res = self.client.get(
            '/api/communication/notification-schedules/',
            {'kurum_id': self.kurum_a.id, 'event_key': 'gun_sonu', 'sube_id': self.sube_b.id},
            HTTP_X_KURUM_ID=str(self.kurum_a.id), HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

    def test_shared_sube_helper_blocks_other_kurum(self):
        from shared.sube_access import get_allowed_subeler_for_user

        self.assertFalse(
            get_allowed_subeler_for_user(self.user, kurum_id=self.kurum_b.id).exists(),
        )
        self.assertTrue(
            get_allowed_subeler_for_user(self.user, kurum_id=self.kurum_a.id)
            .filter(id=self.sube_a.id).exists(),
        )

    def test_header_hijack_does_not_change_session(self):
        from django.test import Client

        web = Client()
        web.force_login(self.user)
        web.get('/auth/api/me/', HTTP_X_KURUM_ID=str(self.kurum_b.id))
        self.assertNotEqual(web.session.get('active_kurum_id'), self.kurum_b.id)

    def test_verify_token_not_exposed(self):
        from apps.communication.domain.models import CommunicationChannelConfig

        CommunicationChannelConfig.objects.create(
            kurum=self.kurum_a, phone_number_id='pn-a', webhook_verify_token='gizli', is_active=True,
        )
        res = self._get('/api/communication/accounts/', self.kurum_a, self.sube_a)
        self.assertEqual(res.status_code, 200)
        acct = res.json()['accounts'][0]
        self.assertNotIn('webhook_verify_token', acct)
        self.assertTrue(acct['has_verify_token'])
