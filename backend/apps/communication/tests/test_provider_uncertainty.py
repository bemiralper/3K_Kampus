from unittest.mock import MagicMock, patch

import httpx
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from . import test_queue_recovery as fixtures
from apps.communication.application.outbound_processor import process_queue_item, UNCERTAIN_SEND_ERROR
from apps.communication.domain.enums import MessageStatus
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.repository import OutboundQueueRepository


class ProviderTransportTests(SimpleTestCase):
    @patch('httpx.Client')
    def test_read_timeout_is_uncertain_but_connect_failure_is_retryable(self, client):
        transport = client.return_value.__enter__.return_value
        channel = WhatsAppCloudClient()
        config = {'phone_number_id': 'test-phone-id', 'access_token': 'synthetic-token'}
        for error, uncertain in ((httpx.ReadTimeout('mock'), True), (httpx.ConnectError('mock'), False)):
            transport.post.side_effect = error
            with self.assertLogs('apps.communication.infrastructure.channels.whatsapp_cloud', level='ERROR') as logs:
                result = channel._post_message_once(1, {'type': 'text'}, config)
            self.assertEqual(result['uncertain'], uncertain)
            self.assertFalse(result['success'])
            self.assertNotIn('synthetic-token', str(logs.output))


class ProviderQueueTests(TestCase):
    def setUp(self):
        fixtures.QueueRecoveryTest.setUp(self)
        self.conv.last_customer_message_at = timezone.now()
        self.conv.save(update_fields=['last_customer_message_at'])

    def test_uncertain_response_stops_automatic_retry(self):
        item = fixtures.QueueRecoveryTest._item(self)
        client = MagicMock()
        client.send_text.return_value = {'success': False, 'uncertain': True, 'error': 'connection lost'}
        self.assertFalse(process_queue_item(item, client))
        item.refresh_from_db()
        item.message.refresh_from_db()
        self.assertEqual(item.attempt_count, item.max_attempts)
        self.assertEqual(item.message.failed_reason, UNCERTAIN_SEND_ERROR)
        self.assertEqual(item.message.status, MessageStatus.FAILED)
        self.assertEqual(list(OutboundQueueRepository.get_pending_batch()), [])

    def test_rate_limit_defers_without_exhausting_attempts(self):
        item = fixtures.QueueRecoveryTest._item(self)
        client = MagicMock()
        client.send_text.return_value = {'success': False, 'status_code': 429, 'error_code': 130429}
        self.assertFalse(process_queue_item(item, client))
        item.refresh_from_db()
        item.message.refresh_from_db()
        self.assertEqual(item.attempt_count, 0)
        self.assertEqual(item.message.status, MessageStatus.PENDING)
        self.assertGreater(item.next_attempt_at, timezone.now())
