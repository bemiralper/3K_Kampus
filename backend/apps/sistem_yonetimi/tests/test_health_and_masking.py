"""Sağlık yoklaması, takılı cron, gecikmiş kuyruk ve gizli alan maskesi.

Kuyruk satırı işlenmez, süreç öldürülmez, nabız dosyası silinmez.
"""

from __future__ import annotations

import os
import socket
import time
from datetime import timedelta
from unittest import mock

from django.test import RequestFactory, TestCase
from django.utils import timezone

from apps.communication.domain.enums import Channel, MessageDirection, MessageStatus
from apps.communication.domain.models import Conversation, Message, OutboundQueueItem
from apps.kurum.domain.models import Kurum
from apps.sistem_yonetimi.domain.models import SystemErrorEvent
from apps.sistem_yonetimi.middleware import SystemErrorMiddleware, redact_mapping, scrub_text, scrub_url
from apps.sistem_yonetimi.registry.builtins import _health_unit
from apps.sistem_yonetimi.registry.specs import all_health_checks
from apps.sistem_yonetimi.services.cron_health import cron_lock_health


class ActiveServiceProbeTests(TestCase):
    def test_systemd_active_without_http_is_down(self):
        unit = {
            'available': True,
            'active_state': 'active',
            'status': 'up',
        }
        with mock.patch('apps.sistem_yonetimi.registry.builtins.unit_status', return_value=unit), \
                mock.patch('apps.sistem_yonetimi.registry.builtins.http_probe', return_value=(False, 'URLError')), \
                mock.patch('apps.sistem_yonetimi.registry.builtins.tcp_probe', return_value=False):
            result = _health_unit('gunicorn', 'Gunicorn', 'lms-backend')()
        self.assertEqual(result['status'], 'down')
        self.assertIn('yanıt vermiyor', result['message'])
        self.assertIn('URLError', result['message'])

    def test_systemd_active_and_http_ok_stays_up(self):
        unit = {
            'available': True,
            'active_state': 'active',
            'status': 'up',
        }
        with mock.patch('apps.sistem_yonetimi.registry.builtins.unit_status', return_value=unit), \
                mock.patch('apps.sistem_yonetimi.registry.builtins.http_probe', return_value=(True, 'HTTP 200')), \
                mock.patch('apps.sistem_yonetimi.registry.builtins.tcp_probe', return_value=True):
            result = _health_unit('gunicorn', 'Gunicorn', 'lms-backend')()
        self.assertEqual(result['status'], 'up')

    def test_configured_port_is_used_and_closed_port_is_down(self):
        listening = socket.socket()
        listening.bind(('127.0.0.1', 0))
        listening.listen(1)
        open_port = listening.getsockname()[1]
        refused = socket.socket()
        refused.bind(('127.0.0.1', 0))
        closed_port = refused.getsockname()[1]
        unit = {'available': False, 'message': 'yok', 'status': 'unknown', 'active_state': 'unknown'}
        try:
            with mock.patch.dict(os.environ, {
                'LMS_HEALTH_URL': f'http://127.0.0.1:{open_port}/api/legacy/index/',
            }):
                with mock.patch('apps.sistem_yonetimi.registry.builtins.unit_status', return_value=unit):
                    up = _health_unit('gunicorn', 'Gunicorn', 'lms-backend')()
            self.assertEqual(up['status'], 'up')
            self.assertIn(f'127.0.0.1:{open_port}', up['message'])
            self.assertEqual(up['detail']['port'], open_port)

            with mock.patch.dict(os.environ, {
                'LMS_FRONTEND_HEALTH_URL': f'http://127.0.0.1:{closed_port}/',
            }):
                with mock.patch('apps.sistem_yonetimi.registry.builtins.unit_status', return_value=unit):
                    down = _health_unit('frontend', 'Next.js', 'lms-frontend')()
            self.assertEqual(down['status'], 'down')
            self.assertIn(f'127.0.0.1:{closed_port}', down['message'])
            self.assertEqual(down['detail']['url'], f'http://127.0.0.1:{closed_port}/')
        finally:
            listening.close()
            refused.close()


class CronLockHealthTests(TestCase):
    def test_long_skip_without_newer_done_warns_and_keeps_files(self):
        from pathlib import Path
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            now = time.time()
            (root / 'comm-queue.skip').write_text(str(int(now - 1200)), encoding='utf-8')
            (root / 'comm-queue.done').write_text(f'{int(now - 1800)} 0', encoding='utf-8')
            result = cron_lock_health(state_dir=root, now=now, stuck_seconds=900)
            self.assertEqual(result['status'], 'warn')
            self.assertIn('comm-queue', result['message'])
            self.assertTrue((root / 'comm-queue.skip').exists())
            self.assertTrue((root / 'comm-queue.done').exists())

    def test_recent_skip_after_success_is_quiet(self):
        from pathlib import Path
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            now = time.time()
            (root / 'comm-queue.done').write_text(f'{int(now - 30)} 0', encoding='utf-8')
            (root / 'comm-queue.skip').write_text(str(int(now - 5)), encoding='utf-8')
            result = cron_lock_health(state_dir=root, now=now, stuck_seconds=900)
            self.assertEqual(result['status'], 'up')

    def test_missing_state_dir_is_unknown(self):
        from pathlib import Path
        result = cron_lock_health(state_dir=Path('/tmp/lms-cron-state-yok-olmayan'), stuck_seconds=900)
        self.assertEqual(result['status'], 'unknown')


class QueueAgeHealthTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kuyruk Alarm', kod='KYRKALM')
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            contact_phone='+905550000441',
        )

    def _check(self):
        checks = {item.code: item for item in all_health_checks()}
        return checks['whatsapp'].check()

    def _item(self, *, when, locked_at=None):
        message = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='alarm',
            status=MessageStatus.PENDING,
        )
        return OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=message,
            next_attempt_at=when,
            locked_at=locked_at,
        )

    def test_old_pending_item_warns_and_is_left_untouched(self):
        before = self._check()['detail'].get('stale', 0)
        item = self._item(when=timezone.now() - timedelta(minutes=20))
        result = self._check()
        self.assertEqual(result['detail']['stale'], before + 1)
        self.assertEqual(result['status'], 'warn')
        self.assertIn('gecikmiş', result['message'])
        item.refresh_from_db()
        item.message.refresh_from_db()
        self.assertEqual(item.message.status, MessageStatus.PENDING)
        self.assertIsNone(item.locked_by or None)

    def test_fresh_pending_item_does_not_add_stale(self):
        before = self._check()['detail'].get('stale', 0)
        self._item(when=timezone.now())
        result = self._check()
        self.assertEqual(result['detail']['stale'], before)

    def test_long_lock_warns_without_clearing_it(self):
        before = self._check()['detail'].get('locked', 0)
        item = self._item(
            when=timezone.now(),
            locked_at=timezone.now() - timedelta(minutes=20),
        )
        item.locked_by = 'worker-1'
        item.save(update_fields=['locked_by'])
        result = self._check()
        self.assertEqual(result['detail']['locked'], before + 1)
        self.assertEqual(result['status'], 'warn')
        item.refresh_from_db()
        self.assertEqual(item.locked_by, 'worker-1')
        self.assertIsNotNone(item.locked_at)


class SecretMaskingTests(TestCase):
    def test_substring_keys_and_exception_text_are_masked(self):
        nested = redact_mapping({'password_reset': 'gizli-deger', 'ad': 'Ada', 'profil': {'refresh_token': 'ic-gizli'}})
        self.assertEqual(nested['password_reset'], '***')
        self.assertEqual(nested['profil']['refresh_token'], '***')
        self.assertNotIn('gizli-deger', scrub_text('token=gizli-deger oldu'))
        self.assertNotIn('abc.def', scrub_text('Authorization: Bearer abc.def'))
        factory = RequestFactory()
        request = factory.post(
            '/api/ornek/?password_reset=URLdeGizli',
            data=b'{"api_key":"GovdeGizli","ad":"Ada"}',
            content_type='application/json',
        )
        middleware = SystemErrorMiddleware(lambda req: None)
        middleware.process_exception(request, RuntimeError('authorization=GovdeGizli patladi'))
        event = SystemErrorEvent.objects.order_by('-id').first()
        self.assertIsNotNone(event)
        blob = f"{event.message}\n{event.stack_trace}\n{event.request_params}"
        self.assertNotIn('URLdeGizli', blob)
        self.assertNotIn('GovdeGizli', blob)
        self.assertEqual(event.request_params.get('password_reset'), '***')
        self.assertEqual(event.request_params.get('api_key'), '***')
        self.assertEqual(event.request_params.get('ad'), 'Ada')

    def test_token_in_url_path_is_not_stored(self):
        token = 'SuperGizliYolToken99'
        path = f'/api/auth/sifre-sifirla/{token}/'
        self.assertNotIn(token, scrub_url(path))
        self.assertIn('/ogrenci/42/', scrub_url('/ogrenci/42/odev/'))
        jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signaturevalue'
        self.assertNotIn('eyJhbGci', scrub_url(f'/api/dosya/{jwt}/'))
        hex_token = 'a' * 32
        self.assertNotIn(hex_token, scrub_url(f'/api/x/{hex_token}/y'))
        factory = RequestFactory()
        request = factory.get(path)
        middleware = SystemErrorMiddleware(lambda req: None)
        middleware.process_exception(request, RuntimeError(f'yol dustu {path}'))
        event = SystemErrorEvent.objects.order_by('-id').first()
        blob = f'{event.request_url}\n{event.message}\n{event.stack_trace}'
        self.assertNotIn(token, blob)
