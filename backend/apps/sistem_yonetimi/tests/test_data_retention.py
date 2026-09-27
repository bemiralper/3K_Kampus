"""Eski metrik, hata ve iletişim logları silinir; yenileri kalır."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.communication.domain.enums import LogDirection, MessageDirection, MessageStatus
from apps.communication.domain.models import (
    CommunicationLog,
    Conversation,
    Message,
    MessageStatusEvent,
    RawWebhookEvent,
)
from apps.kurum.domain.models import Kurum
from apps.sistem_yonetimi.domain.models import SystemAuditLog, SystemErrorEvent, SystemMetricSample
from apps.sistem_yonetimi.services.data_retention import purge_operational_data
from apps.yedekleme.domain.models import BackupOperationAction, BackupOperationLog


class OperationalRetentionTests(TestCase):
    def test_purges_old_logs_and_errors_only(self):
        now = timezone.now()
        old = now - timedelta(days=40)
        ancient = now - timedelta(days=120)

        stale_metric = SystemMetricSample.objects.create(collected_at=old, cpu_percent=1)
        fresh_metric = SystemMetricSample.objects.create(collected_at=now, cpu_percent=2)
        SystemMetricSample.objects.filter(pk=stale_metric.pk).update(collected_at=old)

        stale_error = SystemErrorEvent.objects.create(fingerprint='old', message='boom')
        fresh_error = SystemErrorEvent.objects.create(fingerprint='new', message='boom')
        SystemErrorEvent.objects.filter(pk=stale_error.pk).update(last_seen_at=old)

        stale_audit = SystemAuditLog.objects.create(module='x', action='y')
        fresh_audit = SystemAuditLog.objects.create(module='x', action='z')
        SystemAuditLog.objects.filter(pk=stale_audit.pk).update(created_at=ancient)

        stale_log = CommunicationLog.objects.create(direction=LogDirection.OUTBOUND, endpoint='/x')
        fresh_log = CommunicationLog.objects.create(direction=LogDirection.INBOUND, endpoint='/y')
        CommunicationLog.objects.filter(pk=stale_log.pk).update(created_at=old)

        stale_hook = RawWebhookEvent.objects.create(event_type='status', payload={'a': 1})
        RawWebhookEvent.objects.filter(pk=stale_hook.pk).update(created_at=old)

        kurum = Kurum.objects.create(ad='Log Kurum', kod='LOGR')
        conversation = Conversation.objects.create(kurum=kurum, contact_phone='905321110011')
        message = Message.objects.create(
            conversation=conversation,
            direction=MessageDirection.OUTBOUND,
            status=MessageStatus.SENT,
        )
        event = MessageStatusEvent.objects.create(
            message=message,
            status=MessageStatus.DELIVERED,
            occurred_at=old,
            raw_payload={'raw': True},
        )
        MessageStatusEvent.objects.filter(pk=event.pk).update(created_at=old)

        backup_log = BackupOperationLog.objects.create(
            action=BackupOperationAction.CREATE,
            success=True,
        )
        BackupOperationLog.objects.filter(pk=backup_log.pk).update(created_at=old)

        purge_operational_data()

        self.assertFalse(SystemMetricSample.objects.filter(pk=stale_metric.pk).exists())
        self.assertTrue(SystemMetricSample.objects.filter(pk=fresh_metric.pk).exists())
        self.assertFalse(SystemErrorEvent.objects.filter(pk=stale_error.pk).exists())
        self.assertTrue(SystemErrorEvent.objects.filter(pk=fresh_error.pk).exists())
        self.assertFalse(SystemAuditLog.objects.filter(pk=stale_audit.pk).exists())
        self.assertTrue(SystemAuditLog.objects.filter(pk=fresh_audit.pk).exists())
        self.assertFalse(CommunicationLog.objects.filter(pk=stale_log.pk).exists())
        self.assertTrue(CommunicationLog.objects.filter(pk=fresh_log.pk).exists())
        self.assertFalse(RawWebhookEvent.objects.filter(pk=stale_hook.pk).exists())
        event.refresh_from_db()
        self.assertEqual(event.raw_payload, {})
        self.assertEqual(event.status, MessageStatus.DELIVERED)
        self.assertFalse(BackupOperationLog.objects.filter(pk=backup_log.pk).exists())
