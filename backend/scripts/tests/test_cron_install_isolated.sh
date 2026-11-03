#!/usr/bin/env bash
# İzole dizinde cron kurulumu. Kilit dosyasına ve reddedilen kuruluma dokunulmaz.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INSTALL="$ROOT/backend/scripts/install-lms-cron.sh"
SRC="$ROOT/deploy/cron"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

LOCK_DIR="$TMP/locks"
mkdir -p "$LOCK_DIR"
printf 'lock-marker\n' >"$LOCK_DIR/lms-backup.lock"

DEST="$TMP/cron.d"
mkdir -p "$DEST"
printf 'OLD-LOCKED cron-flock.sh\n' >"$DEST/lms-sistem"

bad_src="$TMP/bad-src"
mkdir -p "$bad_src"
cp "$SRC"/lms-iletisim "$SRC"/lms-yedekleme "$SRC"/lms-backup-gdrive "$bad_src/"
printf '* * * * * lms /var/www/lms/venv/bin/python /var/www/lms/backend/manage.py collect_system_metrics\n' >"$bad_src/lms-sistem"

set +e
LMS_CRON_DIR="$DEST" \
LMS_CRON_SRC_DIR="$bad_src" \
LMS_APP_ROOT="$ROOT" \
LMS_RUN_USER=lms \
  bash "$INSTALL" >"$TMP/bad.out" 2>&1
bad_code=$?
set -e
if [[ "$bad_code" -eq 0 ]]; then
  echo "HATA: kilitsiz sablon kurulumu reddedilmedi" >&2
  cat "$TMP/bad.out" >&2
  exit 1
fi
if [[ "$(cat "$DEST/lms-sistem")" != "OLD-LOCKED cron-flock.sh" ]]; then
  echo "HATA: reddedilen kurulum mevcut cron dosyasini degistirdi" >&2
  exit 1
fi
if [[ "$(cat "$LOCK_DIR/lms-backup.lock")" != "lock-marker" ]]; then
  echo "HATA: reddedilen kurulum kilit dosyasini degistirdi" >&2
  exit 1
fi

LMS_CRON_DIR="$DEST" \
LMS_CRON_SRC_DIR="$SRC" \
LMS_APP_ROOT="$ROOT" \
LMS_RUN_USER=lms \
  bash "$INSTALL" >"$TMP/good.out"

for name in lms-sistem lms-iletisim lms-yedekleme lms-backup-gdrive; do
  if ! grep -q 'cron-flock.sh' "$DEST/$name"; then
    echo "HATA: $name cron-flock.sh icermiyor" >&2
    exit 1
  fi
done
if ! grep -q 'backup-cron-tick.sh' "$DEST/lms-yedekleme"; then
  echo "HATA: yedekleme tick betigini cagirmiyor" >&2
  exit 1
fi
if grep 'manage.py' "$DEST"/* | grep -v 'cron-flock.sh' >/dev/null; then
  echo "HATA: manage.py satiri kilitsiz kuruldu" >&2
  grep 'manage.py' "$DEST"/* >&2
  exit 1
fi
if [[ "$(cat "$LOCK_DIR/lms-backup.lock")" != "lock-marker" ]]; then
  echo "HATA: basarili kurulum kilit dosyasini sildi" >&2
  exit 1
fi

echo "OK cron kurulumu kilitleri korudu"
