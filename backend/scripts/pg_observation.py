#!/usr/bin/env python3
"""PostgreSQL yavaş sorgu gözlemi. Üretimde kendiliğinden çalışmaz.

capture etkin değeri, kaynağını ve kaynak dosyasını kaydeder.
rollback bu değerleri ALTER SYSTEM SET ile geri yazar, reload eder ve
pg_settings sonucunu kayıtla karşılaştırır. Karşılaştırma tutmazsa çıkar.
RESET bu geri dönüşün parçası değildir: auto.conf satırını silmek, dosyadan
veya önceki ALTER SYSTEM değerinden farklı bir varsayılana düşebilir.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from datetime import datetime, timezone

NAMES = (
    'log_min_duration_statement',
    'log_lock_waits',
    'log_statement',
)


def _psql(sql: str) -> str:
    command = shlex.split(os.environ.get('PG_OBSERVATION_PSQL', 'psql'))
    env = os.environ.copy()
    result = subprocess.run(
        command + ['-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql],
        check=False,
        text=True,
        capture_output=True,
        env=env,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit(result.returncode or 1)
    return result.stdout


def _quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def capture_settings() -> list[dict]:
    names = ', '.join(_quote(name) for name in NAMES)
    sql = (
        'SELECT name, setting, COALESCE(unit, \'\'), source, '
        'COALESCE(sourcefile, \'\'), COALESCE(sourceline::text, \'\'), '
        'boot_val, reset_val, pending_restart::text '
        'FROM pg_settings WHERE name IN (' + names + ') ORDER BY name'
    )
    rows = []
    for line in _psql(sql).splitlines():
        parts = line.split('|')
        if len(parts) < 9:
            continue
        rows.append({
            'name': parts[0],
            'setting': parts[1],
            'unit': parts[2],
            'source': parts[3],
            'sourcefile': parts[4],
            'sourceline': parts[5],
            'boot_val': parts[6],
            'reset_val': parts[7],
            'pending_restart': parts[8] == 't' or parts[8] == 'true',
        })
    found = {row['name'] for row in rows}
    missing = [name for name in NAMES if name not in found]
    if missing:
        raise SystemExit(f'pg_settings satırı yok: {", ".join(missing)}')
    return rows


def write_snapshot(path: str) -> None:
    payload = {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'settings': capture_settings(),
    }
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write('\n')


def load_snapshot(path: str) -> list[dict]:
    with open(path, encoding='utf-8') as handle:
        payload = json.load(handle)
    rows = payload.get('settings') or []
    if not rows:
        raise SystemExit(f'anlık görüntü boş: {path}')
    return rows


def rollback(path: str) -> None:
    """Kayıttaki etkin değeri geri yazar ve yeniden okuyarak doğrular."""
    expected = load_snapshot(path)
    for row in expected:
        _psql(f'ALTER SYSTEM SET {row["name"]} = {_quote(row["setting"])}')
    _psql('SELECT pg_reload_conf()')
    current = {row['name']: row for row in capture_settings()}
    mismatches = []
    for row in expected:
        seen = current.get(row['name'])
        if not seen or seen['setting'] != row['setting']:
            mismatches.append((row, seen))
    if mismatches:
        for row, seen in mismatches:
            actual = seen['setting'] if seen else 'yok'
            source = seen['source'] if seen else 'yok'
            sys.stderr.write(
                f'{row["name"]}: beklenen etkin değer {row["setting"]} '
                f'(kaynak {row["source"]} {row["sourcefile"]}:{row["sourceline"]}), '
                f'şimdi {actual} (kaynak {source})\n'
            )
        raise SystemExit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description='PostgreSQL gözlem anlık görüntüsü ve geri dönüş')
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    if args.capture == args.rollback:
        parser.error('yalnızca --capture veya --rollback')
    if args.capture:
        write_snapshot(args.snapshot)
        return
    rollback(args.snapshot)


if __name__ == '__main__':
    main()
