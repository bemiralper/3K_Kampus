from django.core.management.base import BaseCommand

from apps.yedekleme.application.services.audit_service import log_backup_operation
from apps.yedekleme.application.services.retention_service import RetentionService
from apps.yedekleme.domain.models import BackupOperationAction


class Command(BaseCommand):
    help = 'Süresi dolmuş yedekleri temizler (retention policy).'

    def handle(self, *args, **options):
        result = RetentionService().purge_expired()
        log_backup_operation(
            user=None,
            action=BackupOperationAction.PURGE,
            metadata=result,
        )
        self.stdout.write(self.style.SUCCESS(f"Silinen: {result['deleted_count']}"))
