#!/usr/bin/env bash
# Canlı sunucuya yedekleme cron job'larını kurar (/etc/cron.d/lms-yedekleme).
#
# Kullanım (root, production sunucu):
#   sudo ./backend/scripts/install-backup-cron.sh
#
# Ortam:
#   LMS_APP_ROOT=/var/www/lms
#   LMS_RUN_USER=lms
#   LMS_ENV_FILE=/etc/lms/env
#   LMS_VENV=/var/www/lms/venv/bin/python
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CRON_SRC="${LMS_CRON_SRC:-$REPO_ROOT/deploy/cron/lms-yedekleme}"
CRON_DST="${LMS_CRON_DST:-/etc/cron.d/lms-yedekleme}"
APP_ROOT="${LMS_APP_ROOT:-/var/www/lms}"
RUN_USER="${LMS_RUN_USER:-lms}"
ENV_FILE="${LMS_ENV_FILE:-/etc/lms/env}"
VENV_PY="${LMS_VENV:-$APP_ROOT/venv/bin/python}"
LOG_DIR="${LMS_LOG_DIR:-/var/log/lms}"
LOG_FILE="$LOG_DIR/backups.log"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bu script root olarak çalışmalı: sudo $0" >&2
  exit 1
fi

if [[ ! -f "$CRON_SRC" ]]; then
  echo "Cron şablonu bulunamadı: $CRON_SRC" >&2
  exit 1
fi

if [[ ! -x "$VENV_PY" && ! -f "$VENV_PY" ]]; then
  echo "Uyarı: Python bulunamadı ($VENV_PY) — cron satırlarını kontrol edin." >&2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Uyarı: Ortam dosyası yok ($ENV_FILE). Cron env yükleyemez." >&2
fi

if ! id "$RUN_USER" &>/dev/null; then
  echo "Kullanıcı yok: $RUN_USER" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"
chown "$RUN_USER":"${LMS_RUN_GROUP:-www-data}" "$LOG_FILE" 2>/dev/null || chown "$RUN_USER" "$LOG_FILE"

BACKUP_ROOT="/var/lib/3k/backups"
if [[ -f "$ENV_FILE" ]]; then
  backup_line="$(grep -E '^BACKUP_LOCAL_ROOT=' "$ENV_FILE" | tail -1 || true)"
  if [[ -n "$backup_line" ]]; then
    BACKUP_ROOT="${backup_line#BACKUP_LOCAL_ROOT=}"
    BACKUP_ROOT="${BACKUP_ROOT%\"}"
    BACKUP_ROOT="${BACKUP_ROOT#\"}"
    BACKUP_ROOT="${BACKUP_ROOT%\'}"
    BACKUP_ROOT="${BACKUP_ROOT#\'}"
  fi
fi
mkdir -p "$BACKUP_ROOT"
chown -R "$RUN_USER":"${LMS_RUN_GROUP:-www-data}" "$BACKUP_ROOT"
chmod -R u+rwX,g+rwX "$BACKUP_ROOT"
echo "Yedek depo: $BACKUP_ROOT (sahip: $RUN_USER)"

# Şablondaki yolları ortam değişkenleriyle özelleştir
tmp="$(mktemp)"
sed \
  -e "s|/var/www/lms|$APP_ROOT|g" \
  -e "s|/etc/lms/env|$ENV_FILE|g" \
  -e "s|/var/www/lms/venv/bin/python|$VENV_PY|g" \
  -e "s|/var/log/lms/backups.log|$LOG_FILE|g" \
  -e "s|^\(\* .* \)lms |\1${RUN_USER} |" \
  -e "s|^\(0 4 .* \)lms |\1${RUN_USER} |" \
  "$CRON_SRC" > "$tmp"

# cron.d: dosya root'a ait, izin 644, satır sonunda boş satır olmalı
install -m 644 -o root -g root "$tmp" "$CRON_DST"
rm -f "$tmp"

# Bazı sistemlerde cron.d dosyasında nokta/özel karakter kısıtı — adımız uygun
echo "Kuruldu: $CRON_DST"
echo "Kontrol:"
echo "  sudo cat $CRON_DST"
echo "  sudo tail -f $LOG_FILE"
echo "  sudo -u $RUN_USER bash -lc 'cd $APP_ROOT/backend && set -a && . $ENV_FILE && set +a && $VENV_PY manage.py run_scheduled_backups --force'"
echo
echo "UI: /admin/yedekleme → Otomatik Yedekleme (sıklık + saat) kaydedin."
echo "Cron her dakika bakar; ayarlanan saat±1 dk içinde bir kez yedek alır."
