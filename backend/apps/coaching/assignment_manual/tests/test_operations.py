import tempfile
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from . import test_assignment_create_evaluate as fixtures
from ..models import AssignmentOperation, ManualAssignment
from ..operations import process_operation


@override_settings(ASSIGNMENT_OPERATION_LEDGER_ENABLED=True)
class NotifyOperationTests(TestCase):
    def setUp(self):
        fixtures.AssignmentCreateEvaluateTest.setUp(self)
        self.storage = tempfile.TemporaryDirectory()
        self.addCleanup(self.storage.cleanup)
        setting = override_settings(MEDIA_ROOT=self.storage.name, CELERY_BROKER_URL='')
        setting.enable()
        self.addCleanup(setting.disable)
        self.student.telefon = '05551112233'
        self.student.save(update_fields=['telefon'])
        self.assignment = ManualAssignment.objects.create(
            student=self.student, coach=self.coach, title='Operation',
            due_date=timezone.now()+timezone.timedelta(days=5), status='ASSIGNED',
        )
        self.url = f'/api/coaching/manual-assignments/assignments/{self.assignment.pk}/notify-send/'

    def submit(self, key='one', **extra):
        return self.client.post(self.url, {
            'async': True, 'idempotency_key': key, 'notify_type': 'plan',
            'include_student': True, 'veli_ids': [], **extra,
        }, format='json')

    def test_duplicate_job_is_one_operation(self):
        a, b = self.submit(), self.submit()
        self.assertEqual(a.status_code, 202, a.data)
        self.assertEqual(a.data['data']['job_id'], b.data['data']['job_id'])
        self.assertEqual(AssignmentOperation.objects.count(), 1)
        conflict = self.submit(orientation='landscape')
        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(self.submit(key='new-intent').status_code, 202)

    @override_settings(CELERY_BROKER_URL='redis://test.invalid')
    @patch('apps.coaching.assignment_manual.tasks.process_assignment_operation.apply_async', side_effect=ConnectionError('mock'))
    def test_broker_error_keeps_committed_job_for_cron(self, submit):
        with self.assertLogs('apps.coaching.assignment_manual.operations', level='ERROR'):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.submit()
        self.assertEqual(response.status_code, 202, response.data)
        job = AssignmentOperation.objects.get(pk=response.data['data']['job_id'])
        self.assertEqual(job.status, 'PENDING')
        submit.assert_called_once()

    @patch('apps.coaching.assignment_manual.report_pdf_service.render_assignment_plan_pdf', return_value=b'%PDF'+b'x'*3000)
    @patch('apps.coaching.assignment_manual.notification_service.AssignmentNotificationService.send')
    def test_process_reuses_completed_job(self, send, render):
        send.return_value = {'sent': 1, 'skipped': 0, 'errors': [], 'sent_details': []}
        result = self.submit()
        job_id = result.data['data']['job_id']
        self.assertEqual(process_operation(job_id)['status'], 'QUEUED')
        self.assertEqual(process_operation(job_id)['status'], 'QUEUED')
        render.assert_called_once()
        send.assert_called_once()

    @patch('apps.coaching.assignment_manual.report_pdf_service.render_assignment_plan_pdf', side_effect=RuntimeError('mock'))
    @patch('apps.coaching.assignment_manual.notification_service.AssignmentNotificationService.send')
    def test_render_error_persists_failure_without_sending(self, send, render):
        job_id = self.submit().data['data']['job_id']
        self.assertEqual(process_operation(job_id)['status'], 'FAILED')
        send.assert_not_called()

    @patch('apps.coaching.assignment_manual.report_pdf_service.render_assignment_plan_pdf', return_value=b'%PDF'+b'x'*3000)
    @patch('apps.coaching.assignment_manual.notification_service.AssignmentNotificationService.send')
    def test_explicit_retry_reuses_valid_pdf_and_operation(self, send, render):
        send.side_effect = [RuntimeError('mock failure before queue commit'), {'sent': 1, 'skipped': 0, 'errors': []}]
        job_id = self.submit().data['data']['job_id']
        self.assertEqual(process_operation(job_id)['status'], 'FAILED')
        retry = self.submit(retry=True)
        self.assertEqual(retry.data['data']['job_id'], job_id)
        self.assertEqual(process_operation(job_id)['status'], 'QUEUED')
        render.assert_called_once()

    def test_status_requires_assignment_access_and_actor(self):
        job_id = self.submit().data['data']['job_id']
        url = self.url.replace('notify-send/', 'notify-job/')
        result = self.client.get(url, {'job_id': job_id})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['data']['status'], 'PENDING')

    def test_actor_removal_preserves_history_but_prevents_delivery(self):
        job_id = self.submit().data['data']['job_id']
        self.coach.delete()
        operation = AssignmentOperation.objects.get(pk=job_id)
        self.assertIsNone(operation.actor_id)
        self.assertEqual(process_operation(job_id)['status'], 'FAILED')

    def test_assignment_removal_preserves_operation_history(self):
        job_id = self.submit().data['data']['job_id']
        self.assignment.delete()
        operation = AssignmentOperation.objects.get(pk=job_id)
        self.assertIsNone(operation.assignment_id)
        self.assertEqual(process_operation(job_id)['status'], 'FAILED')

    @patch('apps.coaching.assignment_manual.report_pdf_service.render_assignment_plan_pdf', return_value=b'%PDF'+b'x'*3000)
    @patch('apps.communication.application.communication_service.process_queue_item')
    def test_real_local_enqueue_is_idempotent_and_never_contacts_provider(self, provider, render):
        from apps.communication.domain.models import Conversation, Message, OutboundQueueItem
        from apps.communication.domain.enums import Channel
        Conversation.objects.create(
            kurum=self.kurum, sube=self.sube, ogrenci=self.student,
            channel=Channel.WHATSAPP, contact_phone='+905551112233',
            last_customer_message_at=timezone.now(),
        )
        job_id = self.submit().data['data']['job_id']
        first = process_operation(job_id)
        self.assertEqual(first['status'], 'QUEUED', first)
        process_operation(job_id)
        self.assertEqual(Message.objects.filter(source_module='odev').count(), 1)
        self.assertEqual(OutboundQueueItem.objects.count(), 1)
        provider.assert_not_called()
