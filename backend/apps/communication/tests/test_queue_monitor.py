"""Mesaj kuyruğu canlı liste, arşiv ve yeniden deneme."""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.communication.application.queue_monitor_service import (
    archive_old_failures,
    list_outbound_queue,
    retry_failed_message,
    retry_queue_item,
)
from apps.communication.domain.enums import Channel, MessageDirection, MessageStatus, MessageType
from apps.communication.domain.models import (
    Conversation,
    Message,
    MessageAttachment,
    OutboundQueueItem,
)
from apps.communication.infrastructure.repository import OutboundQueueRepository
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _grant(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='comm_queue_test',
        defaults={'name': 'Comm Queue Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class QueueMonitorServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Queue Mon', kod='QMON')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='QMON-M')
        self.conv = Conversation.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            channel=Channel.WHATSAPP,
            contact_phone='+905551110000',
            contact_name='Test Veli',
        )

    def _item(self, *, status, age_days=0, error='Message undeliverable', attempts=5):
        msg = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='Merhaba',
            status=status,
            source_module='odev',
            failed_reason=error if status == MessageStatus.FAILED else '',
        )
        item = OutboundQueueItem.objects.create(
            kurum=self.kurum,
            message=msg,
            next_attempt_at=timezone.now(),
            attempt_count=attempts,
            last_error=error if status == MessageStatus.FAILED else '',
        )
        if age_days:
            past = timezone.now() - timedelta(days=age_days)
            OutboundQueueItem.objects.filter(id=item.id).update(created_at=past, updated_at=past)
            item.refresh_from_db()
        return item

    def test_live_hides_old_failures(self):
        fresh = self._item(status=MessageStatus.FAILED, age_days=2)
        old = self._item(status=MessageStatus.FAILED, age_days=40)
        data = list_outbound_queue(self.kurum.id, self.sube.id, scope='live')
        ids = {row['id'] for row in data['items']}
        self.assertIn(str(fresh.id), ids)
        self.assertNotIn(str(old.id), ids)
        self.assertEqual(data['status_counts']['failed_live'], 1)
        self.assertEqual(data['status_counts']['failed_archive'], 1)

    def test_archive_lists_only_old_failures(self):
        self._item(status=MessageStatus.PENDING, attempts=0, error='')
        old = self._item(status=MessageStatus.FAILED, age_days=40)
        data = list_outbound_queue(self.kurum.id, self.sube.id, scope='archive')
        ids = {row['id'] for row in data['items']}
        self.assertEqual(ids, {str(old.id)})

    def test_archive_old_failures_deletes_queue_keeps_message(self):
        old = self._item(status=MessageStatus.FAILED, age_days=40)
        msg_id = old.message_id
        deleted = archive_old_failures(self.kurum.id, self.sube.id, days=14)
        self.assertEqual(deleted, 1)
        self.assertFalse(OutboundQueueItem.objects.filter(id=old.id).exists())
        self.assertTrue(Message.objects.filter(id=msg_id, status=MessageStatus.FAILED).exists())

    def test_retry_failed_message_keeps_template_and_refreshes_name(self):
        item = self._item(status=MessageStatus.FAILED, attempts=5)
        item.send_options = {
            'template_name': 'odev_plan_veli',
            'template_language': 'tr',
            'template_context': {
                'ogrenci_ad': 'Eski Ad',
                'hafta_no': '4',
                'odev_baslik': 'Fen planı',
            },
        }
        item.save(update_fields=['send_options'])
        self.conv.contact_name = 'Yeni Veli'
        self.conv.save(update_fields=['contact_name'])
        retry_failed_message(self.kurum.id, self.conv, item.message)
        item.refresh_from_db()
        item.message.refresh_from_db()
        ctx = item.send_options['template_context']
        self.assertEqual(item.send_options['template_name'], 'odev_plan_veli')
        self.assertEqual(ctx['hafta_no'], '4')
        self.assertEqual(ctx['odev_baslik'], 'Fen planı')
        self.assertEqual(item.message.status, MessageStatus.PENDING)
        self.assertEqual(item.attempt_count, 0)

    def test_retry_restores_pdf_template_after_queue_row_deleted(self):
        msg = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='Ödev planı ektedir.',
            status=MessageStatus.FAILED,
            message_type=MessageType.TEMPLATE,
            source_module='odev',
            source_ref_id='12:plan:ogrenci',
            send_options={
                'template_name': 'odev_plani_ogrenci_v2',
                'template_language': 'tr',
                'template_context': {'hafta_no': '3', 'odev_baslik': 'Matematik'},
            },
        )
        attachment = MessageAttachment.objects.create(
            message=msg,
            mime_type='application/pdf',
            original_name='plan.pdf',
            provider_media_id='stale-media',
        )
        attachment.file.save('plan.pdf', ContentFile(b'%PDF-1.4 test'), save=True)
        retry_failed_message(self.kurum.id, self.conv, msg)
        item = OutboundQueueItem.objects.get(message=msg)
        self.assertEqual(item.send_options['template_name'], 'odev_plani_ogrenci_v2')
        self.assertEqual(item.send_options['template_context']['hafta_no'], '3')
        attachment.refresh_from_db()
        self.assertEqual(attachment.provider_media_id, '')
        msg.refresh_from_db()
        self.assertEqual(msg.status, MessageStatus.PENDING)

    def test_retry_recovers_odev_template_when_options_were_never_stored(self):
        msg = Message.objects.create(
            conversation=self.conv,
            direction=MessageDirection.OUTBOUND,
            body='Ödev raporu ektedir.',
            status=MessageStatus.FAILED,
            message_type=MessageType.TEMPLATE,
            source_module='odev',
            source_ref_id='44:report:veli:9',
        )

        class _Meta:
            name = 'odev_raporu_veli_v2'
            language = 'tr'
            channel_config_id = 'acc-1'

        class _Resolved:
            meta_template = _Meta()

            def meta_usable(self, **kwargs):
                return True

        with patch(
            'apps.communication.application.notification_template_resolver.resolve_binding',
            return_value=_Resolved(),
        ):
            retry_failed_message(self.kurum.id, self.conv, msg)
        item = OutboundQueueItem.objects.get(message=msg)
        self.assertEqual(item.send_options['template_name'], 'odev_raporu_veli_v2')
        self.assertEqual(item.send_options['template_language'], 'tr')

    def test_retry_resets_failed_item(self):
        item = self._item(status=MessageStatus.FAILED, attempts=5)
        retry_queue_item(self.kurum.id, item.id, self.sube.id)
        item.refresh_from_db()
        item.message.refresh_from_db()
        self.assertEqual(item.attempt_count, 0)
        self.assertEqual(item.message.status, MessageStatus.PENDING)

    def test_exhausted_failed_not_in_pending_batch(self):
        self._item(status=MessageStatus.FAILED, attempts=5)
        batch = OutboundQueueRepository.get_pending_batch(limit=10)
        self.assertEqual(batch, [])


class QueueMonitorAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Queue API', kod='QAPI')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='QAPI-M')
        self.user = User.objects.create_user(username='quser', password='x')
        _grant(self.user, 'communication.read', 'communication.bulk', 'communication.manage')
        self.client.force_authenticate(user=self.user)

    def test_list_returns_live_payload(self):
        res = self.client.get(
            '/api/communication/queue/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['scope'], 'live')
        self.assertIn('error_groups', body)
        self.assertIn('failed_archive', body['status_counts'])
