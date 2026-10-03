"""Toplu WhatsApp hız kapısı ve paralel kuyruk."""
from __future__ import annotations

import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.communication.application.bulk_dispatch import SendGate, map_bulk, reset_send_gate
from apps.communication.application.outbound_processor import process_pending_batch


class SendGateTests(SimpleTestCase):
    def test_same_phone_waits_and_other_phone_does_not(self):
        gate = SendGate(max_per_second=1000, pair_gap_seconds=0.08)
        started = time.monotonic()
        gate.wait('+905551110001')
        gate.wait('+905551110001')
        self.assertGreaterEqual(time.monotonic() - started, 0.07)
        other = time.monotonic()
        gate.wait('+905551110002')
        self.assertLess(time.monotonic() - other, 0.15)


class MapBulkTests(SimpleTestCase):
    def test_single_call_stays_on_the_caller_thread(self):
        with override_settings(COMMUNICATION_QUEUE_WORKERS=8):
            out = map_bulk([lambda: threading.get_ident()])
        self.assertEqual(out, [threading.get_ident()])

    def test_serial_worker_lets_errors_raise(self):
        def bad():
            raise RuntimeError('x')

        with override_settings(COMMUNICATION_QUEUE_WORKERS=1):
            with self.assertRaises(RuntimeError):
                map_bulk([bad, lambda: 'ok'])

    def test_parallel_keeps_order_and_overlaps(self):
        state = {'n': 0, 'peak': 0}
        lock = threading.Lock()

        def work(tag):
            def _run():
                with lock:
                    state['n'] += 1
                    state['peak'] = max(state['peak'], state['n'])
                time.sleep(0.08)
                with lock:
                    state['n'] -= 1
                return tag
            return _run

        def boom():
            raise RuntimeError('no')

        reset_send_gate()
        with override_settings(
            COMMUNICATION_QUEUE_WORKERS=4,
            COMMUNICATION_QUEUE_MAX_PER_SECOND=1000,
            COMMUNICATION_QUEUE_PAIR_GAP_SECONDS=0,
        ):
            reset_send_gate()
            out = map_bulk([work('a'), boom, work('c'), work('d')])
        self.assertEqual(out[0], 'a')
        self.assertIsInstance(out[1], RuntimeError)
        self.assertEqual(out[2], 'c')
        self.assertEqual(out[3], 'd')
        self.assertGreaterEqual(state['peak'], 2)


class ParallelQueueBatchTests(SimpleTestCase):
    @override_settings(COMMUNICATION_QUEUE_WORKERS=4)
    def test_batch_sends_side_by_side(self):
        items = [SimpleNamespace(id=i, campaign_id=None) for i in range(4)]
        state = {'n': 0, 'peak': 0}
        lock = threading.Lock()

        def fake(item, *, own_connection, use_gate):
            self.assertTrue(own_connection)
            self.assertTrue(use_gate)
            with lock:
                state['n'] += 1
                state['peak'] = max(state['peak'], state['n'])
            time.sleep(0.08)
            with lock:
                state['n'] -= 1
            return item.id % 2 == 0

        with patch(
            'apps.communication.application.outbound_processor.OutboundQueueRepository.sweep_cancelled_items',
        ), patch(
            'apps.communication.application.outbound_processor.OutboundQueueRepository.get_pending_batch',
            return_value=items,
        ), patch(
            'apps.communication.application.outbound_processor._run_queue_item',
            side_effect=fake,
        ):
            result = process_pending_batch()
        self.assertEqual(result['processed'], 4)
        self.assertEqual(result['sent'], 2)
        self.assertEqual(result['failed'], 2)
        self.assertGreaterEqual(state['peak'], 2)
