#!/usr/bin/env python3
"""Gözlem geri dönüşü kayıtlı etkin değeri yazar ve tutmazsa başarısız olur."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'backend' / 'scripts' / 'pg_observation.py'


FAKE = textwrap.dedent(r'''
import os, sys
from pathlib import Path
log = Path(os.environ["PG_FAKE_LOG"])
sql = ""
if "-c" in sys.argv:
    sql = sys.argv[sys.argv.index("-c") + 1]
with log.open("a", encoding="utf-8") as handle:
    handle.write(sql + "\n")
import re
if re.search(r"(?i)(^|;)\s*(alter\s+system\s+)?reset\b", sql):
    sys.stderr.write("RESET kullanildi\n")
    raise SystemExit(3)
base = "\n".join([
    "log_lock_waits|on||configuration file|/etc/postgresql/18/main/conf.d/log.conf|8|off|off|f",
    "log_min_duration_statement|-1|ms|default|||-1|-1|f",
    "log_statement|none||configuration file|/etc/postgresql/18/main/postgresql.conf|412|none|none|f",
])
if sql.startswith("SELECT name"):
    text = log.read_text(encoding="utf-8")
    altered = "ALTER SYSTEM SET log_lock_waits" in text
    if altered and os.environ.get("PG_FAKE_MISMATCH") == "1":
        base = base.replace("log_lock_waits|on|", "log_lock_waits|off|", 1)
    elif altered and "ALTER SYSTEM SET log_lock_waits = 'on'" not in text:
        base = base.replace("log_lock_waits|on|", "log_lock_waits|off|", 1)
    sys.stdout.write(base + "\n")
raise SystemExit(0)
''')


class ObservationRollbackTests(unittest.TestCase):
    def _run(self, *args: str, mismatch: bool = False) -> subprocess.CompletedProcess[str]:
        fake = self.tmp / 'psql'
        fake.write_text('#!/usr/bin/env python3\n' + FAKE, encoding='utf-8')
        fake.chmod(0o755)
        env = os.environ.copy()
        env['PG_OBSERVATION_PSQL'] = str(fake)
        env['PG_FAKE_LOG'] = str(self.tmp / 'sql.log')
        env['PG_FAKE_MISMATCH'] = '1' if mismatch else '0'
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            cwd=str(ROOT),
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.snapshot = self.tmp / 'pg.json'

    def test_capture_records_value_and_source(self):
        result = self._run('--snapshot', str(self.snapshot), '--capture')
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(self.snapshot.read_text(encoding='utf-8'))
        by_name = {row['name']: row for row in payload['settings']}
        self.assertEqual(by_name['log_lock_waits']['setting'], 'on')
        self.assertEqual(by_name['log_lock_waits']['source'], 'configuration file')
        self.assertEqual(by_name['log_lock_waits']['sourcefile'], '/etc/postgresql/18/main/conf.d/log.conf')
        self.assertEqual(by_name['log_lock_waits']['sourceline'], '8')
        self.assertEqual(by_name['log_min_duration_statement']['setting'], '-1')
        self.assertEqual(by_name['log_min_duration_statement']['source'], 'default')

    def test_rollback_sets_recorded_value_and_checks_it(self):
        self._run('--snapshot', str(self.snapshot), '--capture')
        (self.tmp / 'sql.log').write_text('', encoding='utf-8')
        result = self._run('--snapshot', str(self.snapshot), '--rollback')
        self.assertEqual(result.returncode, 0, result.stderr)
        sql = (self.tmp / 'sql.log').read_text(encoding='utf-8')
        self.assertIn("ALTER SYSTEM SET log_lock_waits = 'on'", sql)
        self.assertIn("ALTER SYSTEM SET log_min_duration_statement = '-1'", sql)
        self.assertIn('SELECT pg_reload_conf()', sql)
        self.assertNotRegex(sql, r'(?i)(^|\n)\s*(ALTER SYSTEM\s+)?RESET\b')

    def test_rollback_fails_when_effective_value_differs(self):
        self._run('--snapshot', str(self.snapshot), '--capture')
        (self.tmp / 'sql.log').write_text('', encoding='utf-8')
        result = self._run('--snapshot', str(self.snapshot), '--rollback', mismatch=True)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn('log_lock_waits', result.stderr)
        self.assertIn('on', result.stderr)
        self.assertIn('off', result.stderr)


if __name__ == '__main__':
    unittest.main()
