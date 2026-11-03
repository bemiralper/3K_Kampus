"""Pazar medya komutu günlük zamanlama kaydını ezmez."""

from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

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

    def _open_daily(self, *, status: str, minutes_ago: int):
        schedule = BackupSchedule.get_singleton()
        schedule.enabled = True
        schedule.frequency = 'daily'
        schedule.hour = 0
        schedule.minute = 0
        schedule.last_run_at = timezone.now() - timedelta(minutes=minutes_ago)
        schedule.last_run_status = status
        schedule.save()
        return schedule

    def test_failed_daily_run_retries_after_backoff(self):
        self._open_daily(status='failed', minutes_ago=20)
        job = mock.Mock(status='completed', error_message='', message='ok')
        with mock.patch(
            'apps.yedekleme.management.commands.run_scheduled_backups.BackupEngine'
        ) as engine, mock.patch(
            'apps.yedekleme.engine.housekeeping.run_housekeeping',
            return_value={'backups': {}, 'attachments': {}},
        ):
            engine.return_value.create_backup.return_value = (mock.Mock(filename='a.zip'), job)
            with mock.patch.object(BackupSchedule, 'record_run'):
                call_command('run_scheduled_backups')
        self.assertTrue(engine.return_value.create_backup.called)

    def test_failed_daily_run_waits_out_the_backoff(self):
        self._open_daily(status='failed', minutes_ago=5)
        with mock.patch(
            'apps.yedekleme.management.commands.run_scheduled_backups.BackupEngine'
        ) as engine:
            call_command('run_scheduled_backups')
        engine.return_value.create_backup.assert_not_called()

    def test_completed_daily_run_is_not_repeated(self):
        self._open_daily(status='completed', minutes_ago=30)
        with mock.patch(
            'apps.yedekleme.management.commands.run_scheduled_backups.BackupEngine'
        ) as engine:
            call_command('run_scheduled_backups')
        engine.return_value.create_backup.assert_not_called()
