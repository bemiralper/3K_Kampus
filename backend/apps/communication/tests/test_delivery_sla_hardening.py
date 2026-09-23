"""Faz 4 — kuyruk/teslim/SLA: sistem mesajı SLA'yı sıfırlamaz, sahipsiz sohbet SLA, stub, 429, Celery."""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
)
from apps.communication.application.conversation_router import ConversationRouter
from apps.communication.application.outbound_processor import process_queue_item
from apps.communication.application.sla_service import check_and_mark_needs_support
from apps.communication.domain.enums import (
    Channel,
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    MessageStatus,
    RecipientType,
)
from apps.communication.domain.models import Conversation, Message, OutboundQueueItem
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class OutboundReplySemanticsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='SLA Kurum', kod='SLAK')
        self.conv = Conversation.objects.create(
            kurum=self.kurum, channel=Channel.WHATSAPP, contact_phone='+905551110001',
            status=ConversationStatus.NEW, department=CommunicationDepartment.COACHING,
            first_unanswered_at=timezone.now() - timedelta(minutes=10),
        )

    def test_system_message_does_not_reset_sla(self):
        ConversationRouter.apply_after_outbound(self.conv, source_module='odeme')
        self.conv.refresh_from_db()
        self.assertIsNotNone(self.conv.first_unanswered_at)
        self.assertEqual(self.conv.status, ConversationStatus.NEW)

    def test_campaign_message_does_not_reset_sla(self):
        ConversationRouter.apply_after_outbound(self.conv, source_module='campaign')
        self.conv.refresh_from_db()
        self.assertIsNotNone(self.conv.first_unanswered_at)

    def test_manual_reply_resets_sla(self):
        ConversationRouter.apply_after_outbound(self.conv, source_module='manual')
        self.conv.refresh_from_db()
        self.assertIsNone(self.conv.first_unanswered_at)
        self.assertEqual(self.conv.status, ConversationStatus.REPLIED)

    @override_settings(COMMUNICATION_SYSTEM_MESSAGES_COUNT_AS_REPLY=True)
    def test_legacy_flag_restores_old_behaviour(self):
        ConversationRouter.apply_after_outbound(self.conv, source_module='odeme')
        self.conv.refresh_from_db()
        self.assertIsNone(self.conv.first_unanswered_at)


@override_settings(COMMUNICATION_TICKET_ROUTING=True, COMMUNICATION_SLA_MINUTES=30)
class UnassignedSlaTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='SLA2', kod='SLA2')

    def _conv(self, **kw):
        base = dict(
            kurum=self.kurum, channel=Channel.WHATSAPP, contact_phone='+905551110002',
            contact_type=RecipientType.RAW_PHONE, status=ConversationStatus.NEW,
            department=CommunicationDepartment.COACHING,
            first_unanswered_at=timezone.now() - timedelta(minutes=45),
        )
        base.update(kw)
        return Conversation.objects.create(**base)

    def test_unassigned_coaching_conversation_escalates(self):
        conv = self._conv()
        check_and_mark_needs_support()
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.NEEDS_SUPPORT)

    def test_accounting_unassigned_is_left_alone(self):
        conv = self._conv(department=CommunicationDepartment.ACCOUNTING, contact_phone='+905551110003')
        check_and_mark_needs_support()
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.NEW)

    @override_settings(COMMUNICATION_SLA_INCLUDE_UNASSIGNED=False)
    def test_flag_off_keeps_legacy_scope(self):
        conv = self._conv(contact_phone='+905551110004')
        check_and_mark_needs_support()
        conv.refresh_from_db()
        self.assertEqual(conv.status, ConversationStatus.NEW)


class DeliveryOutcomeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Deliver', kod='DLV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='M', kod='DLV-M')
        self.conv = Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, channel=Channel.WHATSAPP, contact_phone='+905551110005',
        )

    def _queued(self):
        msg = Message.objects.create(
            conversation=self.conv, direction=MessageDirection.OUTBOUND, body='x',
            status=MessageStatus.PENDING,
        )
        return OutboundQueueItem.objects.create(
            kurum=self.kurum, message=msg, next_attempt_at=timezone.now(),
        )

    @override_settings(COMMUNICATION_ALLOW_STUB_SEND=False)
    def test_stub_send_is_recorded_as_failed(self):
        item = self._queued()
        with patch.object(
            WhatsAppCloudClient, 'send_text',
            return_value={'success': True, 'stub': True, 'messages': [{'id': 'stub_1'}]},
        ):
            ok = process_queue_item(item)
        self.assertFalse(ok)
        item.message.refresh_from_db()
        self.assertEqual(item.message.status, MessageStatus.FAILED)
        self.assertIn('kimlik bilgileri eksik', item.message.failed_reason)

    def test_rate_limit_defers_without_counting_attempt(self):
        item = self._queued()
        with patch.object(
            WhatsAppCloudClient, 'send_text',
            return_value={'success': False, 'error': 'Rate limit', 'error_code': 130429, 'status_code': 429},
        ):
            ok = process_queue_item(item)
        self.assertFalse(ok)
        item.refresh_from_db()
        self.assertEqual(item.attempt_count, 0)
        self.assertIsNone(item.locked_at)
        self.assertGreater(item.next_attempt_at, timezone.now() + timedelta(seconds=30))
        item.message.refresh_from_db()
        self.assertEqual(item.message.status, MessageStatus.PENDING)

    @override_settings(CELERY_BROKER_URL='memory://')
    def test_queued_send_with_celery_reports_queued_not_failed(self):
        with patch('apps.communication.tasks.process_outbound_queue_task.delay') as delay:
            result = CommunicationService().send(
                self.kurum.id,
                recipients=RecipientQuery(phone='05551110005'),
                content=MessageContent(text='Merhaba', template_name='x_tpl'),
                source=MessageSource(module='odeme', ref_id='t1'),
                process_immediately=False,
            )
        self.assertTrue(result.success, result.errors)
        self.assertTrue(result.provider_response.get('queued'))
        delay.assert_called()
