"""5 günden eski yedekler sayı kotası ne olursa olsun silinir."""

import os
import tempfile
import time
from datetime import timedelta
from pathlib import Path

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupKind,
    BackupSchedule,
    BackupStatus,
    BackupTrigger,
)
from apps.yedekleme.engine.retention import RetentionService


def _artifact(name: str, *, trigger: str, status: str = BackupStatus.COMPLETED) -> BackupArtifact:
    return BackupArtifact.objects.create(
        filename=name,
        storage_key=name,
        size_bytes=1,
        checksum='x',
        status=status,
        kind=BackupKind.FULL,
        trigger=trigger,
    )


class RetentionAgeTests(TestCase):
    def test_deletes_backups_older_than_five_days_despite_manual_quota(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with override_settings(BACKUP_CONFIG={
                'local_root': root,
                'retention': {
                    'daily': 7,
                    'weekly': 4,
                    'monthly': 12,
                    'manual': 30,
                    'pre_restore': 5,
                    'max_age_days': 5,
                },
            }):
                old = _artifact('old.zip', trigger=BackupTrigger.MANUAL)
                recent = _artifact('recent.zip', trigger=BackupTrigger.MANUAL)
                running = _artifact('running.zip', trigger=BackupTrigger.DAILY, status=BackupStatus.RUNNING)
                (root / 'old.zip').write_bytes(b'old')
                (root / 'recent.zip').write_bytes(b'new')
                (root / 'running.zip').write_bytes(b'run')
                orphan = root / 'import_old' / 'leftover.zip'
                orphan.parent.mkdir()
                orphan.write_bytes(b'left')
                old_ts = time.time() - 8 * 86400
                os.utime(orphan, (old_ts, old_ts))
                BackupArtifact.objects.filter(pk=old.pk).update(
                    started_at=timezone.now() - timedelta(days=6),
                )
                BackupArtifact.objects.filter(pk=running.pk).update(
                    started_at=timezone.now() - timedelta(days=10),
                )

                result = RetentionService().purge()

                self.assertGreaterEqual(result['deleted'], 1)
                self.assertFalse(BackupArtifact.objects.filter(pk=old.pk).exists())
                self.assertFalse((root / 'old.zip').exists())
                self.assertTrue(BackupArtifact.objects.filter(pk=recent.pk).exists())
                self.assertTrue((root / 'recent.zip').exists())
                self.assertTrue(BackupArtifact.objects.filter(pk=running.pk).exists())
                self.assertTrue((root / 'running.zip').exists())
                self.assertFalse(orphan.exists())

    def test_age_cap_runs_when_count_cleanup_is_off(self):
        schedule = BackupSchedule.get_singleton()
        schedule.auto_delete_old = False
        schedule.save(update_fields=['auto_delete_old'])
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td),
                'retention': {'max_age_days': 5, 'manual': 30},
            }):
                old = _artifact('aged.zip', trigger=BackupTrigger.WEEKLY)
                BackupArtifact.objects.filter(pk=old.pk).update(
                    started_at=timezone.now() - timedelta(days=8),
                )
                result = RetentionService().purge()
        self.assertTrue(result.get('age_only'))
        self.assertFalse(BackupArtifact.objects.filter(pk=old.pk).exists())
