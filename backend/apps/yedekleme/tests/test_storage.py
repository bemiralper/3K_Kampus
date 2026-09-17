import os
import stat
import tempfile
import time
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings

from apps.yedekleme.domain.models import BackupArtifact, BackupKind, BackupStatus
from apps.yedekleme.engine.orchestrator import BackupEngine
from apps.yedekleme.engine.storage import (
    WORK_DIR_NAME,
    cleanup_stale_work_dirs,
    delete_file,
    make_work_dir,
    store_file,
    work_root,
)


class BackupStorageDeleteTests(SimpleTestCase):
    def test_delete_readonly_file(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={'local_root': Path(td)}):
                src = Path(td) / 'src.bin'
                src.write_bytes(b'data')
                store_file(src, 'job_1/backup.zip')
                dest = Path(td) / 'job_1/backup.zip'
                os.chmod(dest, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
                delete_file('job_1/backup.zip')
                self.assertFalse(dest.exists())
                self.assertFalse((Path(td) / 'job_1').exists())

    def test_store_sets_group_writable_mode(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={'local_root': Path(td)}):
                src = Path(td) / 'src.bin'
                src.write_bytes(b'data')
                dest = store_file(src, 'job_2/backup.zip')
                mode = dest.stat().st_mode & 0o777
                self.assertEqual(mode, 0o664)


class BackupWorkDirTests(SimpleTestCase):
    def test_make_work_dir_lives_beside_backups(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={'local_root': Path(td)}):
                path = make_work_dir('backup_work_')
                self.assertTrue(path.is_dir())
                self.assertEqual(path.parent, Path(td) / WORK_DIR_NAME)
                self.assertTrue(path.name.startswith('backup_work_'))

    def test_configured_work_root_overrides_default(self):
        with tempfile.TemporaryDirectory() as td:
            local = Path(td) / 'backups'
            custom = Path(td) / 'scratch'
            with override_settings(BACKUP_CONFIG={'local_root': local, 'work_root': custom}):
                self.assertEqual(work_root(), custom)
                path = make_work_dir('backup_out_')
                self.assertEqual(path.parent, custom)

    def test_cleanup_stale_work_dirs_keeps_fresh(self):
        with tempfile.TemporaryDirectory() as td:
            with override_settings(BACKUP_CONFIG={'local_root': Path(td)}):
                stale = make_work_dir('backup_work_')
                fresh = make_work_dir('backup_out_')
                old = time.time() - 5 * 3600
                os.utime(stale, (old, old))
                removed = cleanup_stale_work_dirs(max_age_hours=3)
                self.assertEqual(removed, 1)
                self.assertFalse(stale.exists())
                self.assertTrue(fresh.exists())


class BackupDiskPreflightTests(TestCase):
    def test_preflight_reports_short_free_space(self):
        with tempfile.TemporaryDirectory() as td:
            media = Path(td) / 'media'
            media.mkdir()
            (media / 'photo.jpg').write_bytes(b'x' * 1024)
            with override_settings(BACKUP_CONFIG={
                'local_root': Path(td) / 'backups',
                'file_roots': [media],
                'min_free_bytes': 1024,
            }):
                BackupArtifact.objects.create(
                    filename='old.zip',
                    storage_key='old/old.zip',
                    size_bytes=400 * 1024 * 1024,
                    checksum='x',
                    status=BackupStatus.COMPLETED,
                    kind=BackupKind.FULL,
                )
                usage = mock.Mock(free=100 * 1024 * 1024, total=1024 * 1024 * 1024)
                with mock.patch('apps.yedekleme.engine.orchestrator.shutil.disk_usage', return_value=usage):
                    msg = BackupEngine()._preflight_disk_check()
                self.assertIsNotNone(msg)
                self.assertIn('Yetersiz disk alanı', msg)
                self.assertIn('MB gerekli', msg)
