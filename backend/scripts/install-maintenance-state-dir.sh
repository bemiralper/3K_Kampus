#!/usr/bin/env bash
# /var/lib/3k — bakım modu flag, rollback kaydı ve yedekler için yazma izni.
#
# Kullanım (root, production):
#   export LMS_BACKEND_SERVICE=lms-backend
#   sudo ./backend/scripts/install-maintenance-state-dir.sh
set -euo pipefail

STATE_DIR="${LMS_STATE_DIR:-/var/lib/3k}"
RUN_GROUP="${LMS_RUN_GROUP:-www-data}"
BACKEND_SERVICE="${LMS_BACKEND_SERVICE:-lms-backend}"
RUN_USER="${LMS_RUN_USER:-lms}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Root olarak çalıştırın: sudo $0" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  unit_user="$(systemctl show "$BACKEND_SERVICE" -p User --value 2>/dev/null || true)"
  if [[ -n "$unit_user" && "$unit_user" != "root" ]]; then
    RUN_USER="$unit_user"
  fi
fi

if ! id "$RUN_USER" &>/dev/null 2>&1; then
  echo "Backend kullanıcısı bulunamadı: $RUN_USER" >&2
  echo "LMS_RUN_USER=... veya geçerli LMS_BACKEND_SERVICE ayarlayın." >&2
  exit 1
fi

mkdir -p "$STATE_DIR" "${STATE_DIR}/backups"
chown "$RUN_USER:$RUN_GROUP" "$STATE_DIR" "${STATE_DIR}/backups"
chmod 775 "$STATE_DIR" "${STATE_DIR}/backups"

if [[ -f "${STATE_DIR}/maintenance.enable" ]]; then
  chown "$RUN_USER:$RUN_GROUP" "${STATE_DIR}/maintenance.enable"
fi

echo "OK: $STATE_DIR → $RUN_USER:$RUN_GROUP (775)"
echo "Backend servisi: $BACKEND_SERVICE (User=$RUN_USER)"
echo "Panelden bakım modu aç/kapat artık çalışmalı."
