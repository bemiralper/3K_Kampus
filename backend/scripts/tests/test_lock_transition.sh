#!/usr/bin/env bash
# Eski cron kilidi ile yeni cron-flock.sh aynı dosyayı kullanır.
# Eski süreç kilidi tutarken yeni betik aynı işi başlatmaz.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NEW="$ROOT/backend/scripts/cron-flock.sh"
TICK="$ROOT/backend/scripts/backup-cron-tick.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 - <<'PY' "$NEW" "$TICK" "$ROOT/deploy/cron"
import re, sys
from pathlib import Path
new, tick, cron_dir = map(Path, sys.argv[1:])
new_text = new.read_text(encoding='utf-8')
tick_text = tick.read_text(encoding='utf-8')
if 'lms-${name}.lock' not in new_text:
    raise SystemExit('yeni cron-flock kilit kalibi canli betikle ayni degil')
if '/var/lock/lms-backup.lock' not in tick_text:
    raise SystemExit('tick kilit dosyasi canli tick ile ayni degil')
expected = {
    'lms-sistem': ['system-metrics', 'olcme-publish'],
    'lms-iletisim': [
        'comm-queue', 'comm-sla', 'comm-campaigns',
        'comm-payment-reminders', 'comm-purge', 'comm-archive',
    ],
    'lms-yedekleme': ['backup', 'backup'],
    'lms-backup-gdrive': ['backup-gdrive'],
}
for name, locks in expected.items():
    text = (cron_dir / name).read_text(encoding='utf-8')
    found = re.findall(r'cron-flock\.sh\s+(\S+)', text)
    if found != locks:
        raise SystemExit(f'{name} kilit adlari {found} != {locks}')
if 'backup-cron-tick.sh' not in (cron_dir / 'lms-yedekleme').read_text(encoding='utf-8'):
    raise SystemExit('yedek tick ayni backup kilidine bagli degil')
print('kalip ayni')
PY

cat >"$TMP/flock" <<'EOF'
#!/usr/bin/env python3
import fcntl, os, sys
fd = int(sys.argv[-1])
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit(1)
raise SystemExit(0)
EOF
chmod +x "$TMP/flock"

start_holder() {
  python3 -c 'import fcntl,os,sys,time; fd=os.open(sys.argv[1], os.O_RDWR|os.O_CREAT, 0o644); fcntl.flock(fd, fcntl.LOCK_EX); time.sleep(30)' "$1" &
}

# Canli betigin sabitledigi ad: /var/lock/lms-<ad>.lock
# Yeni betik varsayilan dizini /var/lock. Test ayni dizini kullanir.
LOCK_DIR="$TMP/var-lock"
mkdir -p "$LOCK_DIR"
export PATH="$TMP:$PATH"
export LMS_LOCK_DIR="$LOCK_DIR"
export LMS_CRON_STATE_DIR="$TMP/state"

for name in system-metrics olcme-publish comm-queue comm-sla comm-campaigns comm-payment-reminders comm-purge comm-archive backup backup-gdrive; do
  lock="$LOCK_DIR/lms-${name}.lock"
  marker="$TMP/started-$name"
  rm -f "$marker"
  start_holder "$lock"
  pid=$!
  sleep 0.2
  bash "$NEW" "$name" "$TMP/$name.log" -- touch "$marker" >"$TMP/out-$name" 2>&1 || true
  if [[ -f "$marker" ]]; then
    echo "HATA: eski kilit varken yeni betik $name isi baslatti" >&2
    kill "$pid" 2>/dev/null || true
    exit 1
  fi
  if ! grep -q 'skip' "$TMP/$name.log"; then
    echo "HATA: $name skip yazmadi" >&2
    kill "$pid" 2>/dev/null || true
    exit 1
  fi
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  echo "OK $name"
done

# Tick de ayni backup kilidini kullanir.
backup_lock="$LOCK_DIR/../tick-lock/lms-backup.lock"
mkdir -p "$(dirname "$backup_lock")"
# Canli ve yeni tick varsayilanı birebir /var/lock/lms-backup.lock.
# Burada LMS_BACKUP_LOCK ile ayni dosyayi gosterip eski tutucuyu oraya koyariz.
tick_lock="$LOCK_DIR/lms-backup.lock"
start_holder "$tick_lock"
pid=$!
sleep 0.2
cat >"$TMP/python" <<'EOF'
#!/bin/bash
echo invoked >"${TICK_INVOKED:?}"
exit 0
EOF
chmod +x "$TMP/python"
export LMS_BACKUP_LOCK="$tick_lock"
export LMS_APP_ROOT="$TMP/app"
export LMS_ENV_FILE="$TMP/no-env"
export LMS_VENV="$TMP/python"
export DB_NAME=ignored DB_USER=ignored DB_PASSWORD= DB_HOST=127.0.0.1 DB_PORT=1
export TICK_ROW='1|daily|0|0|2000-01-01|2000-01|failed'
export TICK_INVOKED="$TMP/tick-invoked"
mkdir -p "$TMP/app/backend"
bash "$TICK" >"$TMP/tick.out" 2>&1 || true
if [[ -f "$TMP/tick-invoked" ]]; then
  echo "HATA: eski backup kilidi varken tick Django baslatti" >&2
  kill "$pid" 2>/dev/null || true
  exit 1
fi
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
echo "OK backup tick ayni kilit"
echo "OK gecis"
