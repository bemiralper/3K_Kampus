"""Retention / eski yedek temizliği."""

from __future__ import annotations

import time
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from apps.yedekleme.domain.models import BackupArtifact, BackupSchedule, BackupStatus, BackupTrigger
from apps.yedekleme.engine.storage import WORK_DIR_NAME, delete_file, local_root


class RetentionService:
    def purge(self) -> dict:
        schedule = BackupSchedule.get_singleton()
        retention = (getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('retention') or {}
        deleted = 0

        # Yaş tavanı her zaman uygulanır. GFS (aylık 12, manuel 30) bu süreyi uzatamaz.
        max_age_days = retention.get('max_age_days')
        if max_age_days:
            cutoff = timezone.now() - timedelta(days=int(max_age_days))
            aged = BackupArtifact.objects.exclude(
                status=BackupStatus.RUNNING,
            ).filter(started_at__lt=cutoff)
            deleted += self._delete_artifacts(aged)
            deleted += self._purge_unreferenced_files(int(max_age_days))

        if not schedule.auto_delete_old:
            return {'deleted': deleted, 'age_only': True}

        max_n = schedule.max_artifacts or 10
        completed = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED)

        # Korunacak id'lerin birleşimi — bir yedek herhangi bir sayı kuralına
        # uyuyorsa, yaş tavanının içindeyse silinmez.
        keep_ids: set[int] = set()

        pre_cap = int(retention.get('pre_restore') or 5)
        keep_ids.update(
            completed.filter(trigger=BackupTrigger.PRE_RESTORE)
            .order_by('-started_at')
            .values_list('id', flat=True)[:pre_cap]
        )

        keep_ids.update(
            completed.exclude(trigger=BackupTrigger.PRE_RESTORE)
            .order_by('-started_at')
            .values_list('id', flat=True)[:max_n]
        )

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

        extras = completed.exclude(id__in=keep_ids)
        deleted += self._delete_artifacts(extras)
        return {'deleted': deleted}

    def _delete_artifacts(self, qs) -> int:
        deleted = 0
        for art in qs.iterator():
            try:
                if art.storage_key:
                    delete_file(art.storage_key)
            except Exception:  # noqa: BLE001
                pass
            art.delete()
            deleted += 1
        return deleted

    def _purge_unreferenced_files(self, max_age_days: int) -> int:
        """Kayıtlı olmayan, süresi dolmuş yedek dosyalarını siler (eski içe aktarmalar)."""
        try:
            root = local_root()
        except OSError:
            return 0
        cutoff = time.time() - max_age_days * 86400
        referenced = {
            key for key in BackupArtifact.objects.values_list('storage_key', flat=True) if key
        }
        deleted = 0
        for path in root.rglob('*'):
            if not path.is_file() or WORK_DIR_NAME in path.parts:
                continue
            try:
                if path.stat().st_mtime >= cutoff:
                    continue
            except OSError:
                continue
            rel = path.relative_to(root).as_posix()
            if rel in referenced:
                continue
            try:
                path.unlink()
                deleted += 1
                self._prune_empty(path.parent, root)
            except OSError:
                continue
        return deleted

    @staticmethod
    def _prune_empty(start: Path, stop: Path) -> None:
        current = start
        while current != stop and current.exists():
            try:
                if any(current.iterdir()):
                    break
                current.rmdir()
            except OSError:
                break
            current = current.parent
