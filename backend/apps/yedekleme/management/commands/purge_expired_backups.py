from django.core.management.base import BaseCommand

from apps.yedekleme.engine.housekeeping import run_housekeeping


class Command(BaseCommand):
    help = (
        '5 günden eski yedekleri, eski log/hata kayıtlarını ve '
        'süresi dolmuş sohbet eki dosyalarını siler.'
    )

    def handle(self, *args, **options):
        result = run_housekeeping()
        backups = result['backups']
        ops = result['operational']
        files = result['attachments']
        self.stdout.write(self.style.SUCCESS(
            f"Yedek silinen: {backups.get('deleted', 0)}. "
            f"Log/hata: metrik={ops.get('metrics', 0)} hata={ops.get('errors', 0)} "
            f"iletişim={ops.get('communication_logs', 0)} webhook={ops.get('webhook_events', 0)} "
            f"yedek_log={ops.get('backup_logs', 0)}. "
            f"Sohbet eki: {files.get('files_deleted', 0)} dosya, "
            f"artık={files.get('orphans_deleted', 0)}."
        ))
