#!/usr/bin/env bash
# Hafif tick, basarisiz denemeyi basarili gunluk yedek sanmasin.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TICK="$ROOT/backend/scripts/backup-cron-tick.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/flock" <<'EOF'
#!/bin/bash
if [[ "${FLOCK_FAIL:-0}" == "1" ]]; then
  exit 1
fi
exit 0
EOF
cat >"$TMP/psql" <<'EOF'
#!/bin/bash
printf '%s\n' "${TICK_ROW-}"
EOF
cat >"$TMP/python" <<'EOF'
#!/bin/bash
printf '%s\n' "$*" >>"${TICK_INVOKED:?}"
exit 0
EOF
chmod +x "$TMP/flock" "$TMP/psql" "$TMP/python"
mkdir -p "$TMP/app/backend"

export PATH="$TMP:$PATH"
export LMS_APP_ROOT="$TMP/app"
export LMS_ENV_FILE="$TMP/no-such-env"
export LMS_VENV="$TMP/python"
export LMS_BACKUP_LOCK="$TMP/backup.lock"
export DB_NAME=ignored
export DB_USER=ignored
export DB_PASSWORD=
export DB_HOST=127.0.0.1
export DB_PORT=1
export FLOCK_FAIL=0

today="$(TZ=Europe/Istanbul date +%F)"
week="$(TZ=Europe/Istanbul date +%G-%V)"

run_case() {
  local name="$1"
  local row="$2"
  local expect="$3"
  local invoked="$TMP/invoked-$name"
  rm -f "$invoked"
  export TICK_ROW="$row"
  export TICK_INVOKED="$invoked"
  local out code
  set +e
  out="$(bash "$TICK" 2>&1)"
  code=$?
  set -e
  if [[ "$code" -ne 0 ]]; then
    echo "HATA $name cikis $code" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  if [[ "$expect" == yes && ! -f "$invoked" ]]; then
    echo "HATA $name Django cagrilmadi" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  if [[ "$expect" == no && -f "$invoked" ]]; then
    echo "HATA $name Django cagrildi" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  echo "OK $name"
}

run_case completed "1|daily|0|0|${today}|${week}|completed" no
run_case failed "1|daily|0|0|${today}|${week}|failed" yes
run_case empty "" yes
run_case weekly_failed "1|weekly|0|0|${today}|${week}|failed" yes
run_case disabled "0|daily|0|0|${today}|${week}|failed" no

export FLOCK_FAIL=1
run_case lock_busy "1|daily|0|0|${today}|${week}|failed" no

echo "OK tick retry kararlari"
