"""Eşzamanlı yedek: ayrı bağlantı, eksik zamanlama satırı, yarım kalan RUNNING.

Uzun dump sırasında zamanlama satırının kilidi tutulmamalı.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import textwrap
import time
from datetime import timedelta
from pathlib import Path

import psycopg
from django.db import connection
from django.db.utils import OperationalError
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupJob,
    BackupKind,
    BackupOperationAction,
    BackupResource,
    BackupSchedule,
    BackupStatus,
    ResourceType,
)
from apps.yedekleme.engine.handlers.base import ExportResult
from apps.yedekleme.engine.orchestrator import BackupEngine


def _db_kwargs():
    db = connection.settings_dict
    if str(db.get('PORT') or '') == '5433':
        raise AssertionError('5433 üretim verisidir; eşzamanlılık testi burada çalışmaz')
    return dict(
        dbname=db['NAME'],
        user=db.get('USER') or '',
        password=db.get('PASSWORD') or '',
        host=db.get('HOST') or 'localhost',
        port=int(db.get('PORT') or 5432),
    )


class _ProbeHandler:
    def __init__(self, on_export):
        self.on_export = on_export

    def export(self, resource, work_dir, log):
        self.on_export()
        work_dir.mkdir(parents=True, exist_ok=True)
        (work_dir / 'meta.json').write_text('{}', encoding='utf-8')
        return ExportResult(files=['meta.json'], meta={}, bytes_written=2)


@override_settings(BACKUP_ENCRYPTION_KEY='')
class BackupConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.override = override_settings(BACKUP_CONFIG={
            'local_root': Path(self._tmp.name),
            'file_roots': [],
            'exclude_patterns': [],
            'retention': {},
        })
        self.override.enable()
        self.addCleanup(self.override.disable)
        BackupResource.objects.create(
            code='test.lock_probe',
            name='Kilit yoklaması',
            resource_type=ResourceType.CONFIGURATION,
            handler_key='probe',
            config={'keys': ['LANGUAGE_CODE']},
            is_active=True,
            priority=1,
        )
        self.exported = False

    def _engine(self, on_export=None):
        handler = _ProbeHandler(on_export or self._mark_exported)
        engine = BackupEngine()
        return engine, handler

    def _mark_exported(self):
        self.exported = True

    def _create(self, handler):
        from unittest import mock
        with mock.patch('apps.yedekleme.engine.orchestrator.get_handler', return_value=handler):
            return BackupEngine().create_backup(
                kind=BackupKind.SELECTED,
                resource_codes=['test.lock_probe'],
                encrypt=False,
            )

    def test_first_run_creates_schedule_row(self):
        BackupSchedule.objects.filter(pk=1).delete()
        self.assertFalse(BackupSchedule.objects.filter(pk=1).exists())
        _engine, handler = self._engine()
        artifact, job = self._create(handler)
        self.assertTrue(self.exported)
        self.assertTrue(BackupSchedule.objects.filter(pk=1).exists())
        self.assertEqual(job.status, BackupStatus.COMPLETED)
        self.assertEqual(artifact.status, BackupStatus.COMPLETED)

    def test_recent_running_without_owner_is_abandoned(self):
        """Beş dakikalık RUNNING satırı, kilit ve nabız yoksa yaşından dolayı tutulmaz."""
        self._use_guard_files()
        art = BackupArtifact.objects.create(
            filename='live.zip',
            storage_key='live/live.zip',
            size_bytes=1,
            checksum='x',
            status=BackupStatus.RUNNING,
            kind=BackupKind.SELECTED,
        )
        job = BackupJob.objects.create(
            artifact=art,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
            result={},
        )
        BackupJob.objects.filter(pk=job.pk).update(started_at=timezone.now() - timedelta(minutes=5))
        _engine, handler = self._engine()
        _artifact, new_job = self._create(handler)
        self.assertTrue(self.exported)
        job.refresh_from_db()
        art.refresh_from_db()
        self.assertEqual(job.status, BackupStatus.FAILED)
        self.assertEqual(art.status, BackupStatus.FAILED)
        self.assertEqual(new_job.status, BackupStatus.COMPLETED)
        self.assertNotEqual(new_job.pk, job.pk)

    def _aged_running(self, *, owner_pid=None):
        art = BackupArtifact.objects.create(
            filename='stale.zip',
            storage_key=f'stale/stale-{time.time_ns()}.zip',
            size_bytes=1,
            checksum='x',
            status=BackupStatus.RUNNING,
            kind=BackupKind.SELECTED,
        )
        job = BackupJob.objects.create(
            artifact=art,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
            result={'owner': {'pid': owner_pid}} if owner_pid else {},
        )
        old = timezone.now() - timedelta(minutes=45)
        BackupJob.objects.filter(pk=job.pk).update(started_at=old)
        BackupArtifact.objects.filter(pk=art.pk).update(started_at=old)
        return art, job

    def _use_guard_files(self):
        previous_lock = os.environ.get('LMS_BACKUP_LOCK')
        previous_beat = os.environ.get('LMS_BACKUP_HEARTBEAT')

        def restore():
            if previous_lock is None:
                os.environ.pop('LMS_BACKUP_LOCK', None)
            else:
                os.environ['LMS_BACKUP_LOCK'] = previous_lock
            if previous_beat is None:
                os.environ.pop('LMS_BACKUP_HEARTBEAT', None)
            else:
                os.environ['LMS_BACKUP_HEARTBEAT'] = previous_beat

        self.addCleanup(restore)
        root = Path(self._tmp.name)
        os.environ['LMS_BACKUP_LOCK'] = str(root / 'lms-backup.lock')
        os.environ['LMS_BACKUP_HEARTBEAT'] = str(root / 'backup.heartbeat')
        (root / 'backup.heartbeat').write_text('pid=1\nbeat=0\n', encoding='utf-8')

    def _hold_lock(self):
        script = textwrap.dedent('''
            import fcntl, os, sys, time
            lock, beat = sys.argv[1], sys.argv[2]
            fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o644)
            fcntl.flock(fd, fcntl.LOCK_EX)
            while True:
                with open(beat, 'w', encoding='utf-8') as fh:
                    fh.write(f'pid={os.getpid()}\\nbeat={int(time.time())}\\n')
                time.sleep(0.2)
        ''')
        proc = subprocess.Popen(
            [sys.executable, '-c', script, os.environ['LMS_BACKUP_LOCK'], os.environ['LMS_BACKUP_HEARTBEAT']],
        )
        self.addCleanup(proc.kill)
        deadline = time.time() + 5
        while time.time() < deadline:
            text = Path(os.environ['LMS_BACKUP_HEARTBEAT']).read_text(encoding='utf-8')
            if f'pid={proc.pid}' in text:
                return proc
            time.sleep(0.05)
        proc.kill()
        self.fail('kilit süreci nabız yazmadı')

    def test_long_active_backup_is_not_failed_by_age(self):
        self._use_guard_files()
        self._hold_lock()
        art, job = self._aged_running()
        _engine, handler = self._engine()
        with self.assertRaises(RuntimeError) as caught:
            self._create(handler)
        self.assertIn('devam eden', str(caught.exception))
        self.assertFalse(self.exported)
        self.assertEqual(BackupEngine().fail_stale_running_jobs(max_age_minutes=30), 0)
        job.refresh_from_db()
        art.refresh_from_db()
        self.assertEqual(job.status, BackupStatus.RUNNING)
        self.assertEqual(art.status, BackupStatus.RUNNING)

    def test_live_owner_pid_blocks_even_without_the_lock_file(self):
        self._use_guard_files()
        sleeper = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
        self.addCleanup(sleeper.kill)
        art, job = self._aged_running(owner_pid=sleeper.pid)
        _engine, handler = self._engine()
        with self.assertRaises(RuntimeError) as caught:
            self._create(handler)
        self.assertIn('devam eden', str(caught.exception))
        self.assertFalse(self.exported)
        job.refresh_from_db()
        art.refresh_from_db()
        self.assertEqual(job.status, BackupStatus.RUNNING)
        self.assertEqual(art.status, BackupStatus.RUNNING)

    def test_abandoned_running_can_start_a_new_backup(self):
        self._use_guard_files()
        finished = subprocess.Popen([sys.executable, '-c', 'import sys; sys.exit(0)'])
        finished.wait(timeout=5)
        art, job = self._aged_running(owner_pid=finished.pid)
        _engine, handler = self._engine()
        _artifact, new_job = self._create(handler)
        self.assertTrue(self.exported)
        job.refresh_from_db()
        art.refresh_from_db()
        self.assertEqual(job.status, BackupStatus.FAILED)
        self.assertEqual(art.status, BackupStatus.FAILED)
        self.assertEqual(new_job.status, BackupStatus.COMPLETED)
        self.assertNotEqual(new_job.pk, job.pk)

    def test_schedule_lock_is_not_held_during_export(self):
        BackupSchedule.objects.get_or_create(pk=1)
        seen = {}

        def on_export():
            self.exported = True
            ext = psycopg.connect(**_db_kwargs(), autocommit=True)
            try:
                with ext.cursor() as cur:
                    cur.execute("SET lock_timeout = '500ms'")
                    cur.execute('SELECT id FROM yedekleme_schedule WHERE id = 1 FOR UPDATE')
                    probe = subprocess.run(
                        [sys.executable, '-c', textwrap.dedent('''
                            import fcntl, os, sys
                            fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o644)
                            try:
                                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            except BlockingIOError:
                                raise SystemExit(1)
                            raise SystemExit(0)
                        '''), os.environ['LMS_BACKUP_LOCK']],
                        check=False,
                    )
                    seen['file_lock_busy'] = probe.returncode == 1
                    cur.execute(
                        """
                        SELECT l.mode
                        FROM pg_locks l
                        JOIN pg_class c ON c.oid = l.relation
                        WHERE c.relname = 'yedekleme_schedule'
                          AND l.pid <> pg_backend_pid()
                          AND l.mode IN (
                            'RowShareLock', 'RowExclusiveLock', 'ShareUpdateExclusiveLock',
                            'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock'
                          )
                        """
                    )
                    seen['modes'] = [row[0] for row in cur.fetchall()]
            finally:
                ext.close()

        _engine, handler = self._engine(on_export)
        self._create(handler)
        self.assertTrue(self.exported)
        self.assertEqual(seen.get('modes'), [])
        self.assertTrue(seen.get('file_lock_busy'))

    def test_second_connection_blocks_on_schedule_row(self):
        BackupSchedule.objects.get_or_create(pk=1)
        holder = psycopg.connect(**_db_kwargs())
        holder.autocommit = False
        try:
            with holder.cursor() as cur:
                cur.execute('SELECT id FROM yedekleme_schedule WHERE id = 1 FOR UPDATE')
            with connection.cursor() as cur:
                cur.execute("SET lock_timeout = '800ms'")
            _engine, handler = self._engine()
            with self.assertRaises(OperationalError):
                self._create(handler)
            self.assertFalse(self.exported)
        finally:
            holder.rollback()
            holder.close()
            with connection.cursor() as cur:
                cur.execute('SET lock_timeout = DEFAULT')
