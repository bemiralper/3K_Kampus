"""Kuyrukta takılan gönderimlerin kurtarılması ve batch sınırı olmadan boşaltma."""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.communication.application.outbound_processor import drain_pending_queue
from apps.communication.domain.enums import Channel, MessageDirection, MessageStatus
from apps.communication.domain.models import Conversation, Message, OutboundQueueItem
from apps.communication.infrastructure.repository import OutboundQueueRepository
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class QueueRecoveryTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kuyruk Kurtarma', kod='QREC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='QREC-M')
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905551112233',
        )

    def _item(self, *, status=MessageStatus.PENDING, locked_at=None):
        msg = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='Merhaba',
            status=status,
        )
        return OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=msg,
            next_attempt_at=timezone.now() - timedelta(minutes=1),
            locked_at=locked_at,
        )

    def test_fresh_lock_is_skipped(self):
        self._item(locked_at=timezone.now())
        self.assertEqual(list(OutboundQueueRepository.get_pending_batch()), [])
        self.assertEqual(OutboundQueueRepository.count_pending(), 0)

    @override_settings(COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS=600)
    def test_stale_lock_is_reclaimed(self):
        """Deploy/restart yarıda kesince kilit temizlenmez; kayıt takılı kalmamalı."""
        item = self._item(locked_at=timezone.now() - timedelta(minutes=30))
        batch = OutboundQueueRepository.get_pending_batch()
        self.assertEqual([i.id for i in batch], [item.id])
        self.assertEqual(OutboundQueueRepository.count_pending(), 1)

    @override_settings(COMMUNICATION_QUEUE_LOCK_TIMEOUT_SECONDS=600)
    def test_orphan_sending_message_is_reclaimed(self):
        item = self._item(
            status=MessageStatus.SENDING,
            locked_at=timezone.now() - timedelta(minutes=30),
        )
        batch = OutboundQueueRepository.get_pending_batch()
        self.assertEqual([i.id for i in batch], [item.id])

    def test_sending_message_with_fresh_lock_is_left_alone(self):
        self._item(status=MessageStatus.SENDING, locked_at=timezone.now())
        self.assertEqual(list(OutboundQueueRepository.get_pending_batch()), [])

    def test_reclaim_counts_as_attempt(self):
        """Her seferinde süreci düşüren mesaj sonsuza kadar denenmesin."""
        item = self._item(locked_at=timezone.now() - timedelta(hours=1))
        OutboundQueueRepository.lock_item(item)
        item.refresh_from_db()
        self.assertEqual(item.attempt_count, 1)

    @override_settings(COMMUNICATION_QUEUE_BATCH_SIZE=2, COMMUNICATION_QUEUE_THROTTLE_MS=0)
    def test_drain_processes_beyond_one_batch(self):
        for _ in range(5):
            self._item()

        with patch(
            'apps.communication.application.outbound_processor.process_queue_item',
            side_effect=lambda item, client=None: (
                OutboundQueueRepository.mark_sent(item, 'wamid.test') or True
            ),
        ):
            result = drain_pending_queue(max_seconds=30)

        self.assertEqual(result['processed'], 5)
        self.assertGreater(result['batches'], 1)
        self.assertEqual(result['pending_left'], 0)
        self.assertEqual(OutboundQueueItem.objects.count(), 0)

    @override_settings(COMMUNICATION_QUEUE_BATCH_SIZE=2, COMMUNICATION_QUEUE_THROTTLE_MS=0)
    def test_drain_without_budget_runs_single_batch(self):
        for _ in range(5):
            self._item()

        with patch(
            'apps.communication.application.outbound_processor.process_queue_item',
            side_effect=lambda item, client=None: (
                OutboundQueueRepository.mark_sent(item, 'wamid.test') or True
            ),
        ):
            result = drain_pending_queue(max_seconds=0)

        self.assertEqual(result['processed'], 2)
        self.assertEqual(result['pending_left'], 3)
