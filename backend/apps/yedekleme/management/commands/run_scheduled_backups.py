from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.yedekleme.domain.models import BackupKind, BackupSchedule, BackupTrigger, ScheduleFrequency
from apps.yedekleme.engine import BackupEngine
from apps.yedekleme.registry import sync_registered_resources


class Command(BaseCommand):
    help = 'Zamanlanmış yedekleri çalıştırır. Günlük iş paneldeki türü kullanır; medya ayrı cron ile gelir.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Saat/dakika ve frekans kontrolünü atla; hemen çalıştır.',
        )
        parser.add_argument(
            '--kind',
            default='',
            help='Zamanlama türünü ezer (ör. selected). Verilirse saat penceresi de atlanır.',
        )
        parser.add_argument(
            '--resources',
            default='',
            help='Virgülle ayrılmış kaynak kodları (--kind selected ile).',
        )
        parser.add_argument(
            '--trigger',
            default='',
            help='BackupTrigger değeri (ör. weekly).',
        )
        parser.add_argument(
            '--skip-schedule-record',
            action='store_true',
            help='last_run_at yazma. Pazar medya işi günlük veritabanı turunu engellemesin.',
        )

    def handle(self, *args, **options):
        sync_registered_resources()
        schedule = BackupSchedule.get_singleton()
        force = bool(options.get('force'))
        skip_record = bool(options.get('skip_schedule_record'))
        kind_override = (options.get('kind') or '').strip()
        trigger_override = (options.get('trigger') or '').strip()
        resources_raw = (options.get('resources') or '').strip()
        override = bool(kind_override or trigger_override or resources_raw)

        if kind_override and kind_override not in {c.value for c in BackupKind}:
            raise CommandError(f'Geçersiz kind: {kind_override}')
        if trigger_override and trigger_override not in {c.value for c in BackupTrigger}:
            raise CommandError(f'Geçersiz trigger: {trigger_override}')

        if not force and not override and (not schedule.enabled or schedule.frequency == ScheduleFrequency.OFF):
            self.stdout.write('Otomatik yedekleme kapalı.')
            return

        now = timezone.localtime()
        if not force and not override:
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
            # dönemde henüz çalışmadıysa tetikle. Böylece cron 5 dk'da bir
            # koşsa da pencere kaçmaz.
            now_minutes = now.hour * 60 + now.minute
            sched_minutes = schedule.hour * 60 + schedule.minute
            if now_minutes < sched_minutes:
                self.stdout.write('Planlanan saat henüz gelmedi.')
                return

        trigger = trigger_override or schedule.effective_trigger()
        kind = kind_override or schedule.kind or BackupKind.DATABASE
        if resources_raw:
            resource_codes = [code.strip() for code in resources_raw.split(',') if code.strip()]
        else:
            resource_codes = schedule.resource_codes or None

        engine = BackupEngine()
        try:
            artifact, job = engine.create_backup(
                kind=kind,
                resource_codes=resource_codes,
                trigger=trigger,
                encrypt=bool(schedule.encrypt),
            )
        except Exception as exc:  # noqa: BLE001
            if not skip_record:
                schedule.record_run(status='failed', message=str(exc)[:512])
            raise
        if not skip_record:
            schedule.record_run(
                artifact=artifact,
                status=job.status,
                message=job.error_message or job.message or artifact.filename,
            )
        self.stdout.write(self.style.SUCCESS(f'Yedek oluşturuldu: {artifact.filename}'))

        # Yaş sınırı, log temizliği ve eski sohbet ekleri — yedekle aynı turda.
        try:
            from apps.yedekleme.engine.housekeeping import run_housekeeping
            purged = run_housekeeping()
            deleted = (purged.get('backups') or {}).get('deleted') or 0
            files = (purged.get('attachments') or {}).get('files_deleted') or 0
            if deleted or files:
                self.stdout.write(f'Temizlik: {deleted} eski yedek, {files} sohbet eki silindi.')
        except Exception as exc:  # noqa: BLE001
            self.stderr.write(f'Temizlik uyarısı: {exc}')
