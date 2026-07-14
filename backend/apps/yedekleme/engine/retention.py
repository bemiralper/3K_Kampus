"""Retention / eski yedek temizliği."""

from __future__ import annotations

from apps.yedekleme.domain.models import BackupArtifact, BackupSchedule, BackupStatus, BackupTrigger
from apps.yedekleme.engine.storage import delete_file


class RetentionService:
    def purge(self) -> dict:
        schedule = BackupSchedule.get_singleton()
        if not schedule.auto_delete_old:
            return {'deleted': 0, 'skipped': True}

        from django.conf import settings

        max_n = schedule.max_artifacts or 10
        retention = (getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('retention') or {}
        completed = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED)

        # Korunacak (silinmeyecek) id'lerin BİRLEŞİMİ — bir yedek herhangi bir
        # kurala göre korunuyorsa silinmez (güvenli taraf).
        keep_ids: set[int] = set()

        # Restore öncesi güvenlik yedekleri global cap'e dahil DEĞİL — ayrı,
        # daha güvenli bir sınırla korunur (varsayılan son 5).
        pre_cap = int(retention.get('pre_restore') or 5)
        keep_ids.update(
            completed.filter(trigger=BackupTrigger.PRE_RESTORE)
            .order_by('-started_at')
            .values_list('id', flat=True)[:pre_cap]
        )

        # Global cap: pre_restore hariç en yeni max_n.
        keep_ids.update(
            completed.exclude(trigger=BackupTrigger.PRE_RESTORE)
            .order_by('-started_at')
            .values_list('id', flat=True)[:max_n]
        )

        # GFS: tetikleyici bazlı kapasiteler (birleşime eklenir).
        for trigger, key in [
            (BackupTrigger.DAILY, 'daily'),
            (BackupTrigger.WEEKLY, 'weekly'),
            (BackupTrigger.MONTHLY, 'monthly'),
            (BackupTrigger.MANUAL, 'manual'),
        ]:
            limit = retention.get(key)
            if not limit:
                continue
            keep_ids.update(
                completed.filter(trigger=trigger)
                .order_by('-started_at')
                .values_list('id', flat=True)[: int(limit)]
            )

        deleted = 0
        for art in completed.exclude(id__in=keep_ids):
            try:
                delete_file(art.storage_key)
            except Exception:  # noqa: BLE001
                pass
            art.delete()
            deleted += 1
        return {'deleted': deleted}
