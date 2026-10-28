"""Günlük ve manuel yedekler 5 günde silinir. Haftalık medya 21 güne kadar kalır."""

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
                old = _artifact('aged.zip', trigger=BackupTrigger.MANUAL)
                kept = _artifact('weekly.zip', trigger=BackupTrigger.WEEKLY)
                expired_media = _artifact('weekly-old.zip', trigger=BackupTrigger.WEEKLY)
                BackupArtifact.objects.filter(pk=old.pk).update(
                    started_at=timezone.now() - timedelta(days=8),
                )
                BackupArtifact.objects.filter(pk=kept.pk).update(
                    started_at=timezone.now() - timedelta(days=8),
                )
                BackupArtifact.objects.filter(pk=expired_media.pk).update(
                    started_at=timezone.now() - timedelta(days=22),
                )
                result = RetentionService().purge()
        self.assertTrue(result.get('age_only'))
        self.assertFalse(BackupArtifact.objects.filter(pk=old.pk).exists())
        self.assertTrue(BackupArtifact.objects.filter(pk=kept.pk).exists())
        self.assertFalse(BackupArtifact.objects.filter(pk=expired_media.pk).exists())

    def test_weekly_media_keeps_two_newest_inside_twenty_one_days(self):
        schedule = BackupSchedule.get_singleton()
        schedule.auto_delete_old = True
        schedule.max_artifacts = 1
        schedule.save(update_fields=['auto_delete_old', 'max_artifacts'])
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
                newest = _artifact('w1.zip', trigger=BackupTrigger.WEEKLY)
                middle = _artifact('w2.zip', trigger=BackupTrigger.WEEKLY)
                oldest = _artifact('w3.zip', trigger=BackupTrigger.WEEKLY)
                manual = _artifact('m.zip', trigger=BackupTrigger.MANUAL)
                for name in ('w1.zip', 'w2.zip', 'w3.zip', 'm.zip'):
                    (root / name).write_bytes(b'x')
                now = timezone.now()
                BackupArtifact.objects.filter(pk=newest.pk).update(started_at=now - timedelta(days=1))
                BackupArtifact.objects.filter(pk=middle.pk).update(started_at=now - timedelta(days=3))
                BackupArtifact.objects.filter(pk=oldest.pk).update(started_at=now - timedelta(days=6))
                BackupArtifact.objects.filter(pk=manual.pk).update(started_at=now - timedelta(days=6))

                RetentionService().purge()

        self.assertTrue(BackupArtifact.objects.filter(pk=newest.pk).exists())
        self.assertTrue(BackupArtifact.objects.filter(pk=middle.pk).exists())
        self.assertFalse(BackupArtifact.objects.filter(pk=oldest.pk).exists())
        self.assertFalse(BackupArtifact.objects.filter(pk=manual.pk).exists())

    def test_files_kind_survives_five_day_cap(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td),
                'retention': {'max_age_days': 5, 'daily': 7, 'manual': 30},
            }):
                media = _artifact('media.zip', trigger=BackupTrigger.DAILY)
                media.kind = BackupKind.FILES
                media.save(update_fields=['kind'])
                BackupArtifact.objects.filter(pk=media.pk).update(
                    started_at=timezone.now() - timedelta(days=6),
                )
                RetentionService().purge()
        self.assertTrue(BackupArtifact.objects.filter(pk=media.pk).exists())
