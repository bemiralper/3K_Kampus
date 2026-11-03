#!/usr/bin/env bash
# Dört cron şablonunu kilit denetiminden geçirip kurar.
#
# manage.py satırı cron-flock.sh içermiyorsa kurulum durur ve hedefteki
# mevcut dosyalar olduğu gibi kalır. Kilit dosyalarına (/var/lock/lms-*.lock)
# dokunulmaz; yeniden kurulum çalışan bir kilidi silmez.
#
# Üretim (root):
#   sudo ./backend/scripts/install-lms-cron.sh
#
# İzole deneme:
#   LMS_CRON_DIR=/tmp/cron-test LMS_CRON_SRC_DIR=... ./backend/scripts/install-lms-cron.sh
#
# Ortam:
#   LMS_APP_ROOT=/var/www/lms
#   LMS_RUN_USER=lms
#   LMS_ENV_FILE=/etc/lms/env
#   LMS_VENV=/var/www/lms/venv/bin/python
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CRON_SRC_DIR="${LMS_CRON_SRC_DIR:-$REPO_ROOT/deploy/cron}"
CRON_DST_DIR="${LMS_CRON_DIR:-/etc/cron.d}"
APP_ROOT="${LMS_APP_ROOT:-/var/www/lms}"
RUN_USER="${LMS_RUN_USER:-lms}"
ENV_FILE="${LMS_ENV_FILE:-/etc/lms/env}"
VENV_PY="${LMS_VENV:-$APP_ROOT/venv/bin/python}"

FILES=(lms-sistem lms-iletisim lms-yedekleme lms-backup-gdrive)

if [[ "$CRON_DST_DIR" == "/etc/cron.d" && "$(id -u)" -ne 0 ]]; then
  echo "Hedef /etc/cron.d ise root gerekir: sudo $0" >&2
  exit 1
fi

assert_locked() {
  local file="$1"
  local base line
  base="$(basename "$file")"
  if [[ ! -f "$file" ]]; then
    echo "Cron şablonu yok: $file" >&2
    return 1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && continue
    if [[ "$line" == *"manage.py"* && "$line" != *"cron-flock.sh"* ]]; then
      echo "Kilit yok, kurulmadı ($base): $line" >&2
      return 1
    fi
  done <"$file"
  if [[ "$base" == "lms-yedekleme" ]]; then
    if ! grep -q 'backup-cron-tick.sh' "$file"; then
      echo "Yedek zamanlaması backup-cron-tick.sh çağırmıyor: $base" >&2
      return 1
    fi
  fi
  if ! grep -q 'cron-flock.sh' "$file"; then
    echo "cron-flock.sh yok: $base" >&2
    return 1
  fi
  return 0
}

stage="$(mktemp -d)"
cleanup() {
  rm -rf "$stage"
}
trap cleanup EXIT

failed=0
for name in "${FILES[@]}"; do
  src="$CRON_SRC_DIR/$name"
  if [[ ! -f "$src" ]]; then
    echo "Cron şablonu yok: $src" >&2
    failed=1
    continue
  fi
  # Python yolu, kök yolundan önce değişmeli. Aksi halde kök değişince
  # /var/www/lms/venv/... kalıbı bir daha eşleşmez.
  sed \
    -e "s|/var/www/lms/venv/bin/python|$VENV_PY|g" \
    -e "s|/etc/lms/env|$ENV_FILE|g" \
    -e "s|/var/www/lms|$APP_ROOT|g" \
    -e "s| lms | ${RUN_USER} |g" \
    "$src" >"$stage/$name"
  if ! assert_locked "$stage/$name"; then
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  echo "Kurulum reddedildi. Mevcut cron dosyaları ve kilitler değiştirilmedi: $CRON_DST_DIR" >&2
  exit 1
fi

mkdir -p "$CRON_DST_DIR"
for name in "${FILES[@]}"; do
  dest="$CRON_DST_DIR/$name"
  tmp_dest="$CRON_DST_DIR/.$name.lms-new"
  cp "$stage/$name" "$tmp_dest"
  chmod 644 "$tmp_dest"
  mv -f "$tmp_dest" "$dest"
done

tick="$APP_ROOT/backend/scripts/backup-cron-tick.sh"
flock_bin="$APP_ROOT/backend/scripts/cron-flock.sh"
if [[ -f "$tick" ]]; then
  chmod 755 "$tick" || true
fi
if [[ -f "$flock_bin" ]]; then
  chmod 755 "$flock_bin" || true
fi

echo "Cron kilitleri kuruldu: $CRON_DST_DIR"
echo "Kilit dosyaları silinmedi."
