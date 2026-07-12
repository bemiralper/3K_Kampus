from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.yedekleme.domain.models import BackupSchedule, BackupTrigger, ScheduleFrequency
from apps.yedekleme.engine import BackupEngine
from apps.yedekleme.registry import sync_registered_resources


class Command(BaseCommand):
    help = 'Zamanlanmış yedekleri çalıştırır (dakikalık/saatlik cron önerilir).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Saat/dakika ve frekans kontrolünü atla; hemen çalıştır.',
        )

    def handle(self, *args, **options):
        sync_registered_resources()
        schedule = BackupSchedule.get_singleton()
        force = bool(options.get('force'))

        if not force and (not schedule.enabled or schedule.frequency == ScheduleFrequency.OFF):
            self.stdout.write('Otomatik yedekleme kapalı.')
            return

        now = timezone.localtime()
        if not force:
            delta = abs(now.hour * 60 + now.minute - (schedule.hour * 60 + schedule.minute))
            if delta > 1:
                self.stdout.write('Şu an çalışma saati değil.')
                return

            if schedule.last_run_at:
                last = timezone.localtime(schedule.last_run_at)
                if schedule.frequency == ScheduleFrequency.DAILY and last.date() == now.date():
                    self.stdout.write('Bugün zaten çalıştı.')
                    return
                if schedule.frequency == ScheduleFrequency.WEEKLY and last.isocalendar()[:2] == now.isocalendar()[:2]:
                    self.stdout.write('Bu hafta zaten çalıştı.')
                    return
                if schedule.frequency == ScheduleFrequency.MONTHLY and (last.year, last.month) == (now.year, now.month):
                    self.stdout.write('Bu ay zaten çalıştı.')
                    return

        trigger_map = {
            ScheduleFrequency.DAILY: BackupTrigger.DAILY,
            ScheduleFrequency.WEEKLY: BackupTrigger.WEEKLY,
            ScheduleFrequency.MONTHLY: BackupTrigger.MONTHLY,
        }
        if force and (not schedule.enabled or schedule.frequency == ScheduleFrequency.OFF):
            trigger = BackupTrigger.MANUAL
        else:
            trigger = trigger_map.get(schedule.frequency, BackupTrigger.DAILY)

        engine = BackupEngine()
        artifact, _job = engine.create_backup(
            kind=schedule.kind or 'full',
            resource_codes=schedule.resource_codes or None,
            trigger=trigger,
            encrypt=bool(schedule.encrypt),
        )
        schedule.last_run_at = timezone.now()
        schedule.save(update_fields=['last_run_at'])
        self.stdout.write(self.style.SUCCESS(f'Yedek oluşturuldu: {artifact.filename}'))
