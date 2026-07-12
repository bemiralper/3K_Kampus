"""Retention / eski yedek temizliği."""

from __future__ import annotations

from apps.yedekleme.domain.models import BackupArtifact, BackupSchedule, BackupStatus, BackupTrigger
from apps.yedekleme.engine.storage import delete_file


class RetentionService:
    def purge(self) -> dict:
        schedule = BackupSchedule.get_singleton()
        deleted = 0
        if not schedule.auto_delete_old:
            return {'deleted': 0, 'skipped': True}

        max_n = schedule.max_artifacts or 10
        # Global cap across completed artifacts
        qs = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).order_by('-started_at')
        keep_ids = list(qs.values_list('id', flat=True)[:max_n])
        to_delete = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).exclude(id__in=keep_ids)

        # Also per-trigger caps from BACKUP_CONFIG for scheduled ones
        from django.conf import settings
        retention = (getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('retention') or {}
        for trigger, key in [
            (BackupTrigger.DAILY, 'daily'),
            (BackupTrigger.WEEKLY, 'weekly'),
            (BackupTrigger.MONTHLY, 'monthly'),
            (BackupTrigger.MANUAL, 'manual'),
        ]:
            limit = retention.get(key)
            if not limit:
                continue
            ids = list(
                BackupArtifact.objects.filter(status=BackupStatus.COMPLETED, trigger=trigger)
                .order_by('-started_at')
                .values_list('id', flat=True)[: int(limit)]
            )
            to_delete = to_delete | BackupArtifact.objects.filter(
                status=BackupStatus.COMPLETED, trigger=trigger,
            ).exclude(id__in=ids)

        seen = set()
        for art in to_delete.distinct():
            if art.id in seen or art.id in keep_ids:
                continue
            seen.add(art.id)
            try:
                delete_file(art.storage_key)
            except Exception:  # noqa: BLE001
                pass
            art.delete()
            deleted += 1
        return {'deleted': deleted}
