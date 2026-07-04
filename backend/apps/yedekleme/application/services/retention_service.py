import shutil
from datetime import timedelta
from pathlib import Path

from django.utils import timezone

from apps.yedekleme.application.config import retention_policy
from apps.yedekleme.application.providers.registry import get_remote_storage_provider
from apps.yedekleme.domain.models import BackupArtifact, BackupStatus, BackupTrigger


class RetentionService:
    def purge_expired(self) -> dict:
        policy = retention_policy()
        now = timezone.now()
        deleted = []
        kept = []

        artifacts = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).order_by('-started_at')
        buckets = {
            BackupTrigger.DAILY: policy.get('daily', 7),
            BackupTrigger.WEEKLY: policy.get('weekly', 4),
            BackupTrigger.MONTHLY: policy.get('monthly', 12),
            BackupTrigger.MANUAL: policy.get('manual', 30),
        }

        by_trigger: dict[str, list] = {k: [] for k in buckets}
        for art in artifacts:
            by_trigger.setdefault(art.trigger, []).append(art)

        remote = get_remote_storage_provider()
        for trigger, limit in buckets.items():
            items = by_trigger.get(trigger, [])
            for art in items[limit:]:
                fname = art.filename
                try:
                    remote.delete(art.storage_key)
                except Exception:
                    pass
                art.delete()
                deleted.append(fname)
            kept.extend(items[:limit])

        cutoff_days = policy.get('max_age_days')
        if cutoff_days:
            cutoff = now - timedelta(days=int(cutoff_days))
            for art in BackupArtifact.objects.filter(status=BackupStatus.COMPLETED, started_at__lt=cutoff):
                fname = art.filename
                try:
                    remote.delete(art.storage_key)
                except Exception:
                    pass
                art.delete()
                deleted.append(fname)

        return {'deleted_count': len(deleted), 'deleted': deleted, 'kept_count': len(kept)}
