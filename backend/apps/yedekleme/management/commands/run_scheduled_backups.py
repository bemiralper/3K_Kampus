from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.yedekleme.domain.models import BackupSchedule, ScheduleFrequency
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
            # Bu dönem içinde zaten çalıştı mı? (dedupe)
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

            # Catch-up: sabit ±1 dk pencere yerine, planlanan saat GEÇTİYSE ve bu
            # dönemde henüz çalışmadıysa tetikle. Böylece cron 1/5/15 dk'da bir
            # koşsa da pencere kaçmaz.
            now_minutes = now.hour * 60 + now.minute
            sched_minutes = schedule.hour * 60 + schedule.minute
            if now_minutes < sched_minutes:
                self.stdout.write('Planlanan saat henüz gelmedi.')
                return

        trigger = schedule.effective_trigger()

        engine = BackupEngine()
        try:
            artifact, job = engine.create_backup(
                kind=schedule.kind or 'full',
                resource_codes=schedule.resource_codes or None,
                trigger=trigger,
                encrypt=bool(schedule.encrypt),
            )
        except Exception as exc:  # noqa: BLE001
            schedule.record_run(status='failed', message=str(exc)[:512])
            raise
        schedule.record_run(
            artifact=artifact,
            status=job.status,
            message=job.error_message or job.message or artifact.filename,
        )
        self.stdout.write(self.style.SUCCESS(f'Yedek oluşturuldu: {artifact.filename}'))

        # Retention: zamanlı yedek sonrası eski yedekleri otomatik temizle.
        try:
            from apps.yedekleme.engine.retention import RetentionService
            purged = RetentionService().purge()
            if purged.get('deleted'):
                self.stdout.write(f'Retention: {purged["deleted"]} eski yedek silindi.')
        except Exception as exc:  # noqa: BLE001
            self.stderr.write(f'Retention uyarısı: {exc}')
