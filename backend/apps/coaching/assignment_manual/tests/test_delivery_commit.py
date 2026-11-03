from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, override_settings

from apps.communication.application.celery_dispatch import schedule_outbound_after_commit


class DeliveryCommitTests(TestCase):
    @override_settings(CELERY_BROKER_URL='redis://test.invalid')
    @patch('apps.communication.tasks.process_outbound_queue_task.apply_async')
    def test_only_dispatches_after_commit(self, submit):
        with self.captureOnCommitCallbacks(execute=True):
            with transaction.atomic():
                schedule_outbound_after_commit()
                submit.assert_not_called()
        submit.assert_called_once_with(retry=False)

    @override_settings(CELERY_BROKER_URL='redis://test.invalid')
    @patch('apps.communication.tasks.process_outbound_queue_task.apply_async')
    def test_rollback_does_not_dispatch(self, submit):
        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    schedule_outbound_after_commit()
                    raise ValueError('rollback')
            except ValueError:
                pass
        submit.assert_not_called()

    @override_settings(CELERY_BROKER_URL='')
    @patch('apps.communication.application.outbound_processor.process_pending_batch')
    def test_no_broker_never_consumes_queue(self, consume):
        with self.captureOnCommitCallbacks(execute=True):
            schedule_outbound_after_commit()
        consume.assert_not_called()

    @override_settings(CELERY_BROKER_URL='redis://test.invalid')
    @patch('apps.communication.tasks.process_outbound_queue_task.apply_async', side_effect=ConnectionError)
    def test_broker_error_does_not_undo_commit(self, submit):
        with self.assertLogs('apps.communication.application.celery_dispatch', level='ERROR'):
            with self.captureOnCommitCallbacks(execute=True):
                schedule_outbound_after_commit()
        submit.assert_called_once()
