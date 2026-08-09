"""Ticket routing — claim, SLA, scope senaryoları."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.claim_service import ClaimConflictError, ClaimService
from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.application.conversation_router import ConversationRouter
from apps.communication.application.sla_service import check_and_mark_needs_support
from apps.communication.domain.enums import (
    CommunicationDepartment,
    ConversationStatus,
    RecipientType,
)
from apps.communication.domain.models import Conversation, ConversationRoutingRule
from apps.kurum.domain.models import Kurum

User = get_user_model()


@override_settings(COMMUNICATION_TICKET_ROUTING=True, COMMUNICATION_SLA_MINUTES=30)
class TicketRoutingUnitTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ticket Test', kod='TKT')
        self.user_a = User.objects.create_user(username='coach_a_tkt', password='x')
        self.user_b = User.objects.create_user(username='coach_b_tkt', password='x')

    def _conv(self, **kwargs):
        defaults = dict(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905551111111',
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.NEW,
            department='COACHING',
        )
        defaults.update(kwargs)
        return Conversation.objects.create(**defaults)

    def test_claim_race_second_fails(self):
        conv = self._conv()
        ClaimService.claim(conv.id, self.user_a)
        with self.assertRaises(ClaimConflictError):
            ClaimService.claim(conv.id, self.user_b)
        conv.refresh_from_db()
        self.assertEqual(conv.claimed_by_user_id, self.user_a.id)

    def test_sla_marks_needs_support(self):
        from datetime import date

        from apps.coaching.models import CoachProfile, CoachStudentAssignment
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube
        from apps.ogrenci.domain.models import Ogrenci

        sube = Sube.objects.create(kurum=self.kurum, ad='T', kod='TKT')
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=sube,
            ad='Koç',
            soyad='Bir',
            tc_kimlik_no='33333333333',
            user=self.user_a,
        )
        coach = CoachProfile.objects.create(
            teacher=personel, capacity=10, is_active=True, is_coach=True,
        )
        student = Ogrenci.objects.create(
            kurum=self.kurum, sube=sube, ad='S', soyad='T', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=coach, student=student, start_date=date(2026, 1, 1), is_primary=True,
        )
        conv = self._conv(
            status=ConversationStatus.WAITING,
            contact_type=RecipientType.OGRENCI,
            ogrenci=student,
            assigned_coach=coach,
            first_unanswered_at=timezone.now() - timedelta(minutes=45),
        )
        n = check_and_mark_needs_support()
        self.assertGreaterEqual(n, 1)
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.NEEDS_SUPPORT)

    def test_inbound_router_sets_new_for_unknown(self):
        conv = self._conv(status=ConversationStatus.OPEN)
        ConversationRouter.apply_after_inbound(conv, preview='Merhaba')
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.NEW)
        self.assertIsNotNone(conv.first_unanswered_at)
        self.assertIsNotNone(conv.last_customer_message_at)

    def test_outbound_clears_sla(self):
        conv = self._conv(
            status=ConversationStatus.WAITING,
            first_unanswered_at=timezone.now(),
            needs_support_at=timezone.now(),
        )
        ConversationRouter.apply_after_outbound(conv, actor=self.user_a, preview='Yanıt')
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.REPLIED)
        self.assertIsNone(conv.first_unanswered_at)
        self.assertIsNone(conv.needs_support_at)

    def test_other_user_cannot_access_claimed(self):
        conv = self._conv(claimed_by_user=self.user_a, status=ConversationStatus.WAITING)
        self.assertFalse(user_can_access_conversation(self.user_b, conv))


@override_settings(COMMUNICATION_TICKET_ROUTING=True)
class TicketRoutingAPITest(TestCase):
    def setUp(self):
        from apps.sube.domain.models import Sube

        self.kurum = Kurum.objects.create(ad='Ticket API', kod='TKA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TKA')
        self.user = User.objects.create_user(
            username='admin_tkt', password='x', is_staff=True, is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel='WHATSAPP',
            contact_phone='+905552222222',
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.NEW,
            department='COACHING',
        )

    def test_claim_endpoint(self):
        url = f'/api/communication/conversations/{self.conv.id}/claim/'
        res = self.client.post(url, {'kurum_id': self.kurum.id}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.conv.refresh_from_db()
        self.assertEqual(self.conv.claimed_by_user_id, self.user.id)

    def test_list_inbox_new(self):
        res = self.client.get(
            '/api/communication/conversations/',
            {'inbox': 'new', 'period': 'all', 'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 200, res.content)
        ids = [c['id'] for c in res.data.get('conversations', [])]
        self.assertIn(str(self.conv.id), ids)

    def test_notification_cards(self):
        self.conv.unread_count_coach = 3
        self.conv.save(update_fields=['unread_count_coach'])
        res = self.client.get(
            '/api/communication/notifications/summary/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn('cards', res.data)
        self.assertIn('unread_count', res.data)

    def test_set_and_clear_tags(self):
        url = f'/api/communication/conversations/{self.conv.id}/tags/'
        catalog = self.client.get(url, {'kurum_id': self.kurum.id})
        self.assertEqual(catalog.status_code, 200, catalog.content)
        slug = catalog.data['tags'][0]['slug']

        res = self.client.post(
            url, {'kurum_id': self.kurum.id, 'slugs': [slug]}, format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.conv.tags.count(), 1)

        # Son etiketi kaldırma: boş liste 400 vermemeli
        res = self.client.post(
            url, {'kurum_id': self.kurum.id, 'slugs': []}, format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.conv.tags.count(), 0)

    def test_tags_without_payload_is_bad_request(self):
        url = f'/api/communication/conversations/{self.conv.id}/tags/'
        res = self.client.post(url, {'kurum_id': self.kurum.id}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_routing_rules_crud(self):
        res = self.client.post(
            '/api/communication/routing-rules/',
            {
                'kurum_id': self.kurum.id,
                'name': 'Koçsuz Yeni',
                'department': 'COACHING',
                'priority': 10,
                'conditions': {'has_coach': False},
                'actions': {'queue_behavior': 'unclaimed'},
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.content)
        rule_id = res.data['id']
        self.assertEqual(res.data['name'], 'Koçsuz Yeni')

        res = self.client.patch(
            f'/api/communication/routing-rules/{rule_id}/',
            {'kurum_id': self.kurum.id, 'is_active': False, 'priority': 5},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(res.data['is_active'])
        self.assertEqual(res.data['priority'], 5)

        res = self.client.get(
            '/api/communication/routing-rules/',
            {'kurum_id': self.kurum.id},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['rules']), 1)

        res = self.client.delete(
            f'/api/communication/routing-rules/{rule_id}/',
            {'kurum_id': self.kurum.id},
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(ConversationRoutingRule.objects.filter(pk=rule_id).count(), 0)


@override_settings(COMMUNICATION_TICKET_ROUTING=True)
class RoutingRuleMatcherTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Rule Match', kod='RLM')

    def _conv(self, **kwargs):
        defaults = dict(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905553333333',
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.OPEN,
            department='COACHING',
        )
        defaults.update(kwargs)
        return Conversation.objects.create(**defaults)

    def test_priority_first_match_wins(self):
        ConversationRoutingRule.objects.create(
            kurum=self.kurum,
            name='Low prio',
            department=CommunicationDepartment.GUIDANCE,
            priority=50,
            is_active=True,
            conditions={'has_coach': False},
            actions={'set_department': 'GUIDANCE', 'queue_behavior': 'unclaimed'},
        )
        ConversationRoutingRule.objects.create(
            kurum=self.kurum,
            name='High prio',
            department=CommunicationDepartment.ACCOUNTING,
            priority=1,
            is_active=True,
            conditions={'has_coach': False},
            actions={'set_department': 'ACCOUNTING', 'set_status': 'NEW'},
        )
        conv = self._conv()
        ConversationRouter.apply_after_inbound(conv, preview='Merhaba')
        conv.refresh_from_db()
        self.assertEqual(conv.department, 'ACCOUNTING')
        self.assertEqual(conv.status, ConversationStatus.NEW)

    def test_no_match_keeps_default_behavior(self):
        ConversationRoutingRule.objects.create(
            kurum=self.kurum,
            name='Only with coach',
            department=CommunicationDepartment.COACHING,
            priority=1,
            is_active=True,
            conditions={'has_coach': True},
            actions={'set_department': 'MANAGEMENT', 'set_status': 'WAITING'},
        )
        conv = self._conv(status=ConversationStatus.OPEN)
        ConversationRouter.apply_after_inbound(conv, preview='x')
        conv.refresh_from_db()
        self.assertEqual(conv.department, 'COACHING')
        self.assertEqual(conv.status, ConversationStatus.NEW)

    def test_contact_types_filter(self):
        ConversationRoutingRule.objects.create(
            kurum=self.kurum,
            name='Raw only',
            department=CommunicationDepartment.ADMISSIONS,
            priority=1,
            is_active=True,
            conditions={'contact_types': ['RAW_PHONE']},
            actions={
                'set_department': 'ADMISSIONS',
                'queue_behavior': 'needs_support',
            },
        )
        conv = self._conv(contact_type=RecipientType.RAW_PHONE, status=ConversationStatus.OPEN)
        ConversationRouter.apply_after_inbound(conv, preview='x')
        conv.refresh_from_db()
        self.assertEqual(conv.department, 'ADMISSIONS')
        self.assertEqual(conv.status, ConversationStatus.NEEDS_SUPPORT)
        self.assertIsNotNone(conv.needs_support_at)

    def test_inactive_rule_ignored(self):
        ConversationRoutingRule.objects.create(
            kurum=self.kurum,
            name='Pasif',
            department=CommunicationDepartment.SECRETARIAT,
            priority=1,
            is_active=False,
            conditions={'has_coach': False},
            actions={'set_department': 'SECRETARIAT', 'set_status': 'WAITING'},
        )
        conv = self._conv(status=ConversationStatus.OPEN)
        ConversationRouter.apply_after_inbound(conv, preview='x')
        conv.refresh_from_db()
        self.assertEqual(conv.department, 'COACHING')
        self.assertEqual(conv.status, ConversationStatus.NEW)


@override_settings(COMMUNICATION_TICKET_ROUTING=True)
class WhatsAppAppNotificationTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='WA Notif', kod='WAN')
        self.user = User.objects.create_user(
            username='wa_admin', password='x', is_staff=True, is_superuser=True,
        )

    def test_notify_inbound_creates_app_notification(self):
        from apps.communication.application.whatsapp_notifications import notify_inbound_whatsapp
        from apps.takvim.domain.models import AppNotification

        conv = Conversation.objects.create(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905554444444',
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.NEW,
            department='COACHING',
            contact_name='Test Kişi',
            last_message_preview='Merhaba',
        )
        n = notify_inbound_whatsapp(conv, preview='Merhaba')
        self.assertGreaterEqual(n, 1)
        self.assertTrue(
            AppNotification.objects.filter(
                kurum_id=self.kurum.id,
                user_id=self.user.id,
                baslik__icontains='WhatsApp',
            ).exists()
        )

    def test_notify_coach_gets_coach_inbox_url(self):
        from datetime import date

        from apps.coaching.models import CoachProfile, CoachStudentAssignment
        from apps.communication.application.whatsapp_notifications import notify_inbound_whatsapp
        from apps.ogrenci.domain.models import Ogrenci
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube
        from apps.takvim.domain.models import AppNotification

        sube = Sube.objects.create(kurum=self.kurum, ad='N', kod='WAN')
        coach_user = User.objects.create_user(username='wa_coach', password='x')
        personel = Personel.objects.create(
            kurum=self.kurum, sube=sube, ad='Koç', soyad='W',
            tc_kimlik_no='44444444444', user=coach_user,
        )
        coach = CoachProfile.objects.create(
            teacher=personel, capacity=10, is_active=True, is_coach=True,
        )
        student = Ogrenci.objects.create(
            kurum=self.kurum, sube=sube, ad='Ali', soyad='Y', aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=coach, student=student, start_date=date(2026, 1, 1), is_primary=True,
        )
        conv = Conversation.objects.create(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905555555555',
            contact_type=RecipientType.OGRENCI,
            ogrenci=student,
            assigned_coach=coach,
            status=ConversationStatus.WAITING,
            department='COACHING',
        )
        notify_inbound_whatsapp(conv, preview='Merhaba koç')
        notif = AppNotification.objects.filter(user_id=coach_user.id).order_by('-id').first()
        self.assertIsNotNone(notif)
        self.assertIn('/coach/mesajlar?conversation=', notif.url)


@override_settings(COMMUNICATION_TICKET_ROUTING=True)
class SecondaryCoachVisibilityTest(TestCase):
    def setUp(self):
        from datetime import date

        from apps.coaching.models import CoachProfile, CoachStudentAssignment
        from apps.ogrenci.domain.models import Ogrenci
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube

        self.kurum = Kurum.objects.create(ad='Sec Coach', kod='SEC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='M', kod='SEC')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='S', soyad='T', aktif_mi=True,
        )
        self.primary_user = User.objects.create_user(username='prim', password='x')
        self.secondary_user = User.objects.create_user(username='sec', password='x')
        primary_p = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='P', soyad='C',
            tc_kimlik_no='55555555551', user=self.primary_user,
        )
        secondary_p = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='S', soyad='C',
            tc_kimlik_no='55555555552', user=self.secondary_user,
        )
        self.primary = CoachProfile.objects.create(
            teacher=primary_p, capacity=10, is_active=True, is_coach=True,
        )
        self.secondary = CoachProfile.objects.create(
            teacher=secondary_p, capacity=10, is_active=True, is_coach=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.primary, student=self.student,
            start_date=date(2026, 1, 1), is_primary=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.secondary, student=self.student,
            start_date=date(2026, 1, 1), is_primary=False,
        )
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            channel='WHATSAPP',
            contact_phone='+905556666666',
            contact_type=RecipientType.OGRENCI,
            ogrenci=self.student,
            assigned_coach=self.primary,
            claimed_by_user=self.primary_user,
            status=ConversationStatus.WAITING,
            department='COACHING',
        )

    def test_secondary_coach_can_access_student_thread(self):
        self.assertTrue(user_can_access_conversation(self.secondary_user, self.conv))

    def test_secondary_coach_sees_in_filtered_queryset(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user

        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.secondary_user,
            kurum_id=self.kurum.id,
        )
        self.assertIn(self.conv.id, qs.values_list('id', flat=True))


@override_settings(COMMUNICATION_TICKET_ROUTING=True)
class ManagerSeesTransferredConversationsTest(TestCase):
    """Devredilmiş sohbetler Süper Yönetici / Yönetici için görünür kalmalı."""

    def setUp(self):
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel
        from apps.roller.models import Permission, Role, RolePermission, UserRole
        from apps.sube.domain.models import Sube

        self.kurum = Kurum.objects.create(ad='Mgr Xfer', kod='MXF')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='M', kod='MXF')
        self.claimer = User.objects.create_user(username='claimer_mxf', password='x')
        self.other_coach = User.objects.create_user(username='other_mxf', password='x')

        # Yönetici + aktif koç profili (is_resource_admin False olsa bile tam inbox)
        self.yonetici = User.objects.create_user(username='yonetici_mxf', password='x')
        role_y, _ = Role.objects.get_or_create(
            code='kurum_yoneticisi',
            defaults={'name': 'Yönetici', 'level': 10, 'is_system_role': True},
        )
        UserRole.objects.update_or_create(user=self.yonetici, defaults={'role': role_y})
        y_personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Y', soyad='Netici',
            tc_kimlik_no='55555555561', user=self.yonetici,
        )
        CoachProfile.objects.create(
            teacher=y_personel, capacity=10, is_active=True, is_coach=True,
        )

        # Süper yönetici (yalnızca rol kodu; permission satırı olmasa bile)
        self.super_y = User.objects.create_user(username='super_mxf', password='x')
        role_s, _ = Role.objects.get_or_create(
            code='super_admin',
            defaults={'name': 'Süper Yönetici', 'level': 0, 'is_system_role': True},
        )
        UserRole.objects.update_or_create(user=self.super_y, defaults={'role': role_s})

        # communication.manage ile yönetici (rol kodu farklı olsa bile)
        self.manage_user = User.objects.create_user(username='manage_mxf', password='x')
        role_m, _ = Role.objects.get_or_create(
            code='custom_comm_mgr_mxf',
            defaults={'name': 'Comm Mgr', 'level': 50, 'is_system_role': False},
        )
        perm, _ = Permission.objects.get_or_create(
            code='communication.manage',
            defaults={
                'name': 'İletişim Yönetimi',
                'module': 'communication',
                'permission_type': 'manage',
            },
        )
        RolePermission.objects.get_or_create(role=role_m, permission=perm)
        UserRole.objects.update_or_create(user=self.manage_user, defaults={'role': role_m})

        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel='WHATSAPP',
            contact_phone='+905557777777',
            contact_type=RecipientType.RAW_PHONE,
            status=ConversationStatus.WAITING,
            department='COACHING',
            claimed_by_user=self.claimer,
        )
        ClaimService.transfer(self.conv.id, self.claimer, self.other_coach, reason='devret')
        self.conv.refresh_from_db()

    def test_transfer_sets_claimed_by_target(self):
        self.assertEqual(self.conv.claimed_by_user_id, self.other_coach.id)

    def test_yonetici_with_coach_profile_sees_transferred(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user

        self.assertTrue(user_can_access_conversation(self.yonetici, self.conv))
        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.yonetici,
            kurum_id=self.kurum.id,
        )
        self.assertIn(self.conv.id, qs.values_list('id', flat=True))

    def test_super_admin_sees_transferred(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user

        self.assertTrue(user_can_access_conversation(self.super_y, self.conv))
        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.super_y,
            kurum_id=self.kurum.id,
        )
        self.assertIn(self.conv.id, qs.values_list('id', flat=True))

    def test_manage_permission_sees_transferred(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user

        self.assertTrue(user_can_access_conversation(self.manage_user, self.conv))
        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            self.manage_user,
            kurum_id=self.kurum.id,
        )
        self.assertIn(self.conv.id, qs.values_list('id', flat=True))

    def test_unrelated_coach_still_hidden(self):
        from apps.communication.application.coach_scope import filter_conversations_for_user
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel

        outsider = User.objects.create_user(username='out_mxf', password='x')
        p = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='O', soyad='Ut',
            tc_kimlik_no='55555555562', user=outsider,
        )
        CoachProfile.objects.create(teacher=p, capacity=5, is_active=True, is_coach=True)

        self.assertFalse(user_can_access_conversation(outsider, self.conv))
        qs = filter_conversations_for_user(
            Conversation.objects.filter(kurum=self.kurum),
            outsider,
            kurum_id=self.kurum.id,
        )
        self.assertNotIn(self.conv.id, qs.values_list('id', flat=True))
