"""Açık işlem içinden kuyruk gönderimi başlamasın (paralel işçi kilitlenmesi)."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, override_settings

from apps.communication.application import celery_dispatch
from apps.communication.application.outbound_processor import process_pending_batch

BATCH = 'apps.communication.application.outbound_processor.process_pending_batch'
DRAIN = 'apps.communication.application.outbound_processor.drain_pending_queue'


def _inline_thread(func, *, name):
    func()


class DispatchInsideTransactionTests(TestCase):
    def test_outside_transaction_runs_now(self):
        with patch(BATCH) as batch:
            celery_dispatch.dispatch_process_outbound_queue()
        batch.assert_called_once()

    def test_inside_transaction_waits_for_commit_and_runs_once(self):
        with patch(BATCH) as batch, patch(DRAIN) as drain, patch.object(
            celery_dispatch, '_run_in_thread', side_effect=_inline_thread,
        ) as thread:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                with transaction.atomic():
                    celery_dispatch.dispatch_process_outbound_queue()
                    celery_dispatch.dispatch_process_outbound_queue()
                    celery_dispatch.dispatch_outbound_queue_after_commit()
                    self.assertFalse(batch.called)
                    self.assertFalse(drain.called)
        self.assertEqual(len(callbacks), 1)
        thread.assert_called_once()
        drain.assert_called_once()
        batch.assert_not_called()

    def test_rolled_back_transaction_sends_nothing(self):
        with patch(BATCH) as batch, patch(DRAIN) as drain:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                try:
                    with transaction.atomic():
                        celery_dispatch.dispatch_process_outbound_queue()
                        raise RuntimeError('rollback')
                except RuntimeError:
                    pass
        self.assertEqual(callbacks, [])
        batch.assert_not_called()
        drain.assert_not_called()

    def test_next_transaction_still_schedules_after_rollback(self):
        with patch(BATCH), patch(DRAIN):
            try:
                with transaction.atomic():
                    celery_dispatch.dispatch_process_outbound_queue()
                    raise RuntimeError('rollback')
            except RuntimeError:
                pass
            with self.captureOnCommitCallbacks() as callbacks:
                with transaction.atomic():
                    celery_dispatch.dispatch_process_outbound_queue()
        self.assertEqual(len(callbacks), 1)


class ParallelBatchInsideTransactionTests(TestCase):
    @override_settings(COMMUNICATION_QUEUE_WORKERS=8)
    def test_open_transaction_uses_caller_connection(self):
        items = [SimpleNamespace(id=i, campaign_id=None) for i in range(3)]
        seen = []

        def fake(item, *, own_connection, use_gate):
            seen.append(own_connection)
            return True

        with patch(
            'apps.communication.application.outbound_processor.OutboundQueueRepository.sweep_cancelled_items',
        ), patch(
            'apps.communication.application.outbound_processor.OutboundQueueRepository.get_pending_batch',
            return_value=items,
        ), patch(
            'apps.communication.application.outbound_processor._run_queue_item',
            side_effect=fake,
        ), patch(
            'apps.communication.application.outbound_processor._throttle_ms', return_value=0,
        ):
            with transaction.atomic():
                result = process_pending_batch()
        self.assertEqual(result['sent'], 3)
        self.assertEqual(seen, [False, False, False])
