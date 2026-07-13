"""Takılı kalan yedekleme job/artifact kayıtlarını temizler."""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.yedekleme.domain.models import BackupArtifact, BackupJob, BackupStatus, JobPhase


class Command(BaseCommand):
    help = 'RUNNING durumunda kalan eski job/artifact kayıtlarını FAILED olarak işaretler.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--hours',
            type=int,
            default=6,
            help='Bu süreden eski running kayıtlar başarısız sayılır (varsayılan 6)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Değişiklik yazmadan sayıları göster',
        )

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(hours=max(1, int(options['hours'])))
        dry = bool(options['dry_run'])

        jobs = BackupJob.objects.filter(
            status=BackupStatus.RUNNING,
            started_at__lt=cutoff,
        )
        artifacts = BackupArtifact.objects.filter(
            status=BackupStatus.RUNNING,
            started_at__lt=cutoff,
        )

        job_count = jobs.count()
        art_count = artifacts.count()
        self.stdout.write(f'Takılı job: {job_count}, artifact: {art_count} (cutoff={cutoff.isoformat()})')

        if dry:
            return

        msg = f'Stale job cleanup (>{options["hours"]}h)'
        updated_jobs = jobs.update(
            status=BackupStatus.FAILED,
            phase=JobPhase.ERROR,
            progress=100,
            error_message=msg,
            finished_at=timezone.now(),
            message='Zaman aşımı / süreç kesildi',
        )
        updated_arts = artifacts.update(
            status=BackupStatus.FAILED,
            error_message=msg,
            finished_at=timezone.now(),
        )
        self.stdout.write(self.style.SUCCESS(f'Güncellendi — job={updated_jobs}, artifact={updated_arts}'))
