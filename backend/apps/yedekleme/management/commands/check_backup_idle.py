"""Deploy öncesi: çalışan yedek varsa çıkar, hiçbir satırı değiştirmez."""

from django.core.management.base import BaseCommand

from apps.yedekleme.domain.models import BackupJob, BackupStatus
from apps.yedekleme.engine.run_guard import (
    backup_owner_alive,
    owner_pid_from_result,
    process_alive,
)


class Command(BaseCommand):
    help = 'RUNNING yedek veya canlı kilit varsa 2 ile çıkar. Kayıt kapatılmaz.'

    def handle(self, *args, **options):
        blockers = []
        if backup_owner_alive():
            blockers.append('yedek kilidi veya nabzı canlı')
        for job in BackupJob.objects.filter(status=BackupStatus.RUNNING).order_by('id'):
            pid = owner_pid_from_result(job.result)
            if pid is None:
                blockers.append(
                    f'iş {job.id} sahibi belirsiz (eski kod); otomatik kapatılmaz, tamamlanması beklenir'
                )
            elif process_alive(pid):
                blockers.append(f'iş {job.id} aktif, pid {pid}')
            else:
                blockers.append(
                    f'iş {job.id} kayıtta RUNNING, pid {pid} yok; süreç bittiyse panelden iptal edin'
                )
        if blockers:
            self.stderr.write('Deploy beklemeli. Aktif veya belirsiz yedek:\n')
            for line in blockers:
                self.stderr.write(f'- {line}\n')
            raise SystemExit(2)
        self.stdout.write('Aktif yedek yok.\n')
