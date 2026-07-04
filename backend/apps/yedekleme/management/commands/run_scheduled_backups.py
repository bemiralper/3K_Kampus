from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.yedekleme.application.services.backup_orchestrator import BackupOrchestrator
from apps.yedekleme.domain.models import BackupSchedule, BackupTrigger


class Command(BaseCommand):
    help = 'Zamanlanmış platform yedeklerini çalıştırır (cron).'

    def handle(self, *args, **options):
        schedule = BackupSchedule.get_singleton()
        if not schedule.enabled:
            self.stdout.write('Zamanlama kapalı — atlandı.')
            return
        if not self._is_due(schedule):
            self.stdout.write('Henüz çalışma zamanı değil — atlandı.')
            return
        trigger = schedule.frequency
        if trigger == BackupTrigger.MANUAL:
            trigger = BackupTrigger.DAILY
        artifact = BackupOrchestrator().run(trigger=trigger, include_logs=schedule.include_logs)
        schedule.last_run_at = timezone.now()
        schedule.save(update_fields=['last_run_at'])
        self.stdout.write(self.style.SUCCESS(f'Yedek tamamlandı: {artifact.filename}'))

    def _is_due(self, schedule: BackupSchedule) -> bool:
        now = timezone.localtime()
        if schedule.last_run_at:
            last = timezone.localtime(schedule.last_run_at)
            if schedule.frequency == BackupTrigger.DAILY and now.date() == last.date():
                return False
            if schedule.frequency == BackupTrigger.WEEKLY and (now - last) < timedelta(days=7):
                return False
            if schedule.frequency == BackupTrigger.MONTHLY and now.month == last.month and now.year == last.year:
                return False
        return now.hour >= schedule.hour and (now.hour > schedule.hour or now.minute >= schedule.minute)
