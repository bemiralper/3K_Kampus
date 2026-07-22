import os
import stat
import tempfile
from pathlib import Path

from django.test import SimpleTestCase, override_settings

from apps.yedekleme.engine.storage import delete_file, store_file


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
