"""Pazar medya komutu günlük zamanlama kaydını ezmez."""

from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from apps.yedekleme.domain.models import BackupSchedule


class ScheduleCommandTests(TestCase):
    def test_skip_schedule_record_does_not_touch_last_run(self):
        schedule = BackupSchedule.get_singleton()
        schedule.last_run_at = None
        schedule.last_run_status = ''
        schedule.last_run_message = ''
        schedule.save(update_fields=['last_run_at', 'last_run_status', 'last_run_message'])

        job = mock.Mock(status='completed', error_message='', message='ok')
        with mock.patch(
            'apps.yedekleme.management.commands.run_scheduled_backups.BackupEngine'
        ) as engine, mock.patch(
            'apps.yedekleme.engine.housekeeping.run_housekeeping',
            return_value={'backups': {}, 'attachments': {}},
        ):
            engine.return_value.create_backup.return_value = (mock.Mock(), job)
            call_command(
                'run_scheduled_backups',
                '--kind', 'selected',
                '--resources', 'system.media',
                '--trigger', 'weekly',
                '--skip-schedule-record',
            )

        schedule.refresh_from_db()
        self.assertIsNone(schedule.last_run_at)
        kwargs = engine.return_value.create_backup.call_args.kwargs
        self.assertEqual(kwargs['kind'], 'selected')
        self.assertEqual(kwargs['resource_codes'], ['system.media'])
        self.assertEqual(kwargs['trigger'], 'weekly')
