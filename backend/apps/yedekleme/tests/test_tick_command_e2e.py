"""backup-cron-tick.sh başarısız kaydı Django komutuna bırakır.

Komut 15 dakikadan önce yeni yedek açmaz; süre dolunca küçük seçili yedeği alır.
Housekeeping bu testte kapalıdır: sohbet eki ve operasyon temizliği çalışmaz.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import timedelta
from pathlib import Path

from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupKind,
    BackupResource,
    BackupSchedule,
    BackupStatus,
    ResourceType,
    ScheduleFrequency,
)


def _assert_isolated_test_db():
    db = connection.settings_dict
    if str(db.get('PORT') or '') == '5433':
        raise AssertionError('5433 üretim verisidir')
    if not str(db.get('NAME') or '').startswith('test_'):
        raise AssertionError('izole test veritabanı değil')
    return db


class TickCommandEndToEndTests(TransactionTestCase):
    def test_failed_tick_reaches_command_and_respects_backoff(self):
        db = _assert_isolated_test_db()
        now = timezone.localtime()
        soon = now - timedelta(minutes=5)
        ready = now - timedelta(minutes=20)
        if soon.date() != now.date() or ready.date() != now.date():
            self.skipTest('gece yarısına yakın: aynı gün 20 dk geriye gidilemiyor')

        BackupResource.objects.create(
            code='test.tick_settings',
            name='Tick ayarı',
            resource_type=ResourceType.CONFIGURATION,
            handler_key='configuration',
            config={'keys': ['LANGUAGE_CODE']},
            is_active=True,
            priority=1,
        )
        schedule = BackupSchedule.get_singleton()
        schedule.enabled = True
        schedule.frequency = ScheduleFrequency.DAILY
        schedule.hour = 0
        schedule.minute = 0
        schedule.kind = BackupKind.SELECTED
        schedule.resource_codes = ['test.tick_settings']
        schedule.encrypt = False
        schedule.last_run_status = 'failed'
        schedule.last_run_at = soon
        schedule.last_run_message = 'onceki'
        schedule.save()

        repo = Path(__file__).resolve().parents[4]
        tick = repo / 'backend' / 'scripts' / 'backup-cron-tick.sh'
        today = now.date().isoformat()
        week = f'{now.isocalendar().year}-W{now.isocalendar().week:02d}'

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            backup_root = root / 'backups'
            backup_root.mkdir()
            invoked = root / 'invoked'
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            (bin_dir / 'flock').write_text('#!/bin/bash\nexit 0\n', encoding='utf-8')
            (bin_dir / 'psql').write_text(
                '#!/bin/bash\nprintf "%s\\n" "${TICK_ROW-}"\n',
                encoding='utf-8',
            )
            wrapper = root / 'python-wrap'
            wrapper.write_text(
                f"#!{sys.executable}\n"
                "import os, sys\n"
                "os.environ['DJANGO_ENV'] = 'test'\n"
                "os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'\n"
                f"backend = {str(repo / 'backend')!r}\n"
                "sys.path.insert(0, backend)\n"
                "os.chdir(backend)\n"
                "with open(os.environ['TICK_INVOKED'], 'a', encoding='utf-8') as fh:\n"
                "    fh.write('called\\n')\n"
                "import django\n"
                "django.setup()\n"
                "from unittest.mock import patch\n"
                "from django.core.management import call_command\n"
                "with patch('apps.yedekleme.engine.housekeeping.run_housekeeping', return_value={}):\n"
                "    call_command('run_scheduled_backups')\n",
                encoding='utf-8',
            )
            os.chmod(bin_dir / 'flock', 0o755)
            os.chmod(bin_dir / 'psql', 0o755)
            os.chmod(wrapper, 0o755)

            def run_tick(row: str):
                env = os.environ.copy()
                env.update({
                    'PATH': f'{bin_dir}{os.pathsep}{env.get("PATH", "")}',
                    'DJANGO_ENV': 'test',
                    'LMS_TEST_DB_NAME': db['NAME'],
                    'LMS_APP_ROOT': str(repo),
                    'LMS_ENV_FILE': str(root / 'no-such-env'),
                    'LMS_VENV': str(wrapper),
                    'LMS_BACKUP_LOCK': str(root / 'backup.lock'),
                    'LMS_BACKUP_HEARTBEAT': str(root / 'backup.heartbeat'),
                    'BACKUP_LOCAL_ROOT': str(backup_root),
                    'BACKUP_ENCRYPTION_KEY': '',
                    'DB_NAME': 'ignored',
                    'DB_USER': 'ignored',
                    'DB_PASSWORD': '',
                    'DB_HOST': '127.0.0.1',
                    'DB_PORT': '1',
                    'TICK_ROW': row,
                    'TICK_INVOKED': str(invoked),
                    'FLOCK_FAIL': '0',
                })
                return subprocess.run(
                    ['bash', str(tick)],
                    cwd=str(repo / 'backend'),
                    env=env,
                    text=True,
                    capture_output=True,
                    timeout=180,
                    check=False,
                )

            before = BackupArtifact.objects.count()
            invoked.write_text('', encoding='utf-8')
            early = run_tick(f'1|daily|0|0|{today}|{week}|failed')
            self.assertEqual(early.returncode, 0, early.stderr + early.stdout)
            self.assertIn('called', invoked.read_text(encoding='utf-8'))
            self.assertIn('kısa süre', early.stdout + early.stderr)
            self.assertEqual(BackupArtifact.objects.count(), before)
            schedule.refresh_from_db()
            self.assertEqual(schedule.last_run_status, 'failed')

            schedule.last_run_at = ready
            schedule.last_run_status = 'failed'
            schedule.save()
            invoked.write_text('', encoding='utf-8')
            done = run_tick(f'1|daily|0|0|{today}|{week}|failed')
            self.assertEqual(done.returncode, 0, done.stderr + done.stdout)
            self.assertEqual(invoked.read_text(encoding='utf-8').count('called'), 1)
            schedule.refresh_from_db()
            self.assertEqual(schedule.last_run_status, BackupStatus.COMPLETED)
            self.assertGreater(BackupArtifact.objects.count(), before)
            self.assertTrue(any(backup_root.rglob('*.zip')))

            invoked.write_text('', encoding='utf-8')
            skipped = run_tick(f'1|daily|0|0|{today}|{week}|completed')
            self.assertEqual(skipped.returncode, 0, skipped.stderr + skipped.stdout)
            self.assertEqual(invoked.read_text(encoding='utf-8'), '')
