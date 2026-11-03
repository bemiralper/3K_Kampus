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

assert_same_locks() {
  local flock_bin="$SCRIPT_DIR/cron-flock.sh"
  local tick="$SCRIPT_DIR/backup-cron-tick.sh"
  local rendered name found
  if [[ ! -f "$flock_bin" || ! -f "$tick" ]]; then
    echo "Kilit betiği yok: $flock_bin veya $tick" >&2
    return 1
  fi
  if ! grep -F -q 'LMS_LOCK_DIR:-/var/lock' "$flock_bin"; then
    echo "cron-flock.sh varsayılan kilit dizini /var/lock değil" >&2
    return 1
  fi
  if ! grep -F -q 'lms-${name}.lock' "$flock_bin"; then
    echo "cron-flock.sh kilit adı lms-<iş>.lock değil" >&2
    return 1
  fi
  if ! grep -F -q '/var/lock/lms-backup.lock' "$tick"; then
    echo "tick kilidi /var/lock/lms-backup.lock değil" >&2
    return 1
  fi
  if grep -q 'LMS_LOCK_DIR=' "$stage"/*; then
    echo "Cron dosyası kilit dizinini değiştiriyor" >&2
    return 1
  fi
  python3 - "$stage" <<'PY'
import re, sys
from pathlib import Path
stage = Path(sys.argv[1])
expected = {
    "lms-sistem": ["system-metrics", "olcme-publish"],
    "lms-iletisim": [
        "comm-queue", "comm-sla", "comm-campaigns",
        "comm-payment-reminders", "comm-purge", "comm-archive",
    ],
    "lms-yedekleme": ["backup", "backup"],
    "lms-backup-gdrive": ["backup-gdrive"],
}
for name, locks in expected.items():
    text = (stage / name).read_text(encoding="utf-8")
    found = re.findall(r"cron-flock\.sh\s+(\S+)", text)
    if found != locks:
        raise SystemExit(f"{name} kilit adlari {found} != {locks}")
if "backup-cron-tick.sh" not in (stage / "lms-yedekleme").read_text(encoding="utf-8"):
    raise SystemExit("tick ayni backup kilidine bagli degil")
print("kilit yollari canli adlarla ayni")
PY
}

if [[ "$failed" -ne 0 ]]; then
  echo "Kurulum reddedildi. Mevcut cron dosyaları ve kilitler değiştirilmedi: $CRON_DST_DIR" >&2
  exit 1
fi
if ! assert_same_locks; then
  echo "Kurulum reddedildi. Mevcut cron dosyaları ve kilitler değiştirilmedi: $CRON_DST_DIR" >&2
  exit 1
fi

mkdir -p "$CRON_DST_DIR"
rollback_dir="$(mktemp -d)"
for name in "${FILES[@]}"; do
  dest="$CRON_DST_DIR/$name"
  if [[ -f "$dest" ]]; then
    cp -p "$dest" "$rollback_dir/$name"
  else
    : >"$rollback_dir/$name.missing"
  fi
done
restore_cron() {
  local name dest
  for name in "${FILES[@]}"; do
    dest="$CRON_DST_DIR/$name"
    if [[ -f "$rollback_dir/$name" ]]; then
      mv -f "$rollback_dir/$name" "$dest"
    elif [[ -f "$rollback_dir/$name.missing" ]]; then
      rm -f "$dest"
    fi
  done
}
for name in "${FILES[@]}"; do
  dest="$CRON_DST_DIR/$name"
  tmp_dest="$CRON_DST_DIR/.$name.lms-new"
  if ! cp "$stage/$name" "$tmp_dest"; then
    echo "Cron yazılamadı, önceki dosyalar geri konuyor: $name" >&2
    restore_cron
    exit 1
  fi
  chmod 644 "$tmp_dest"
  if ! mv -f "$tmp_dest" "$dest"; then
    echo "Cron yerine konamadı, önceki dosyalar geri konuyor: $name" >&2
    rm -f "$tmp_dest"
    restore_cron
    exit 1
  fi
done
rm -rf "$rollback_dir"

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
