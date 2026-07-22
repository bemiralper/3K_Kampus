#!/usr/bin/env bash
# Yedekleme bildirimleri için SMTP ayarlarını /etc/lms/env dosyasına ekler.
#
# Kullanım (root, production):
#   sudo ./backend/scripts/configure-backup-email.sh
#
# Ortam değişkenleri ile (etkileşimsiz):
#   sudo EMAIL_HOST=smtp.gmail.com EMAIL_HOST_USER=you@gmail.com \
#     EMAIL_HOST_PASSWORD=app-password DEFAULT_FROM_EMAIL=you@gmail.com \
#     ./backend/scripts/configure-backup-email.sh
set -euo pipefail

ENV_FILE="${LMS_ENV_FILE:-/etc/lms/env}"
BACKEND_SERVICE="${LMS_BACKEND_SERVICE:-lms-backend}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Root olarak çalıştırın: sudo $0" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Ortam dosyası yok: $ENV_FILE" >&2
  exit 1
fi

prompt() {
  local var="$1" label="$2" default="${3:-}" secret="${4:-false}"
  if [[ -n "${!var:-}" ]]; then
    return 0
  fi
  if [[ "$secret" == true ]]; then
    read -r -s -p "$label: " val
    echo
  else
    read -r -p "$label${default:+ [$default]}: " val
    val="${val:-$default}"
  fi
  printf -v "$var" '%s' "$val"
}

EMAIL_HOST="${EMAIL_HOST:-}"
EMAIL_PORT="${EMAIL_PORT:-587}"
EMAIL_HOST_USER="${EMAIL_HOST_USER:-}"
EMAIL_HOST_PASSWORD="${EMAIL_HOST_PASSWORD:-}"
DEFAULT_FROM_EMAIL="${DEFAULT_FROM_EMAIL:-}"

prompt EMAIL_HOST "SMTP sunucu (ör. smtp.gmail.com)" "smtp.gmail.com"
prompt EMAIL_PORT "SMTP port" "587"
prompt EMAIL_HOST_USER "SMTP kullanıcı (e-posta)"
prompt EMAIL_HOST_PASSWORD "SMTP şifre (Gmail: uygulama şifresi — normal şifre çalışmaz)" "" true
DEFAULT_FROM_EMAIL="${DEFAULT_FROM_EMAIL:-$EMAIL_HOST_USER}"

if [[ -z "$EMAIL_HOST" || -z "$EMAIL_HOST_USER" || -z "$EMAIL_HOST_PASSWORD" ]]; then
  echo "EMAIL_HOST, EMAIL_HOST_USER ve EMAIL_HOST_PASSWORD zorunlu." >&2
  exit 1
fi

upsert_env() {
  local key="$1" value="$2" file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    if [[ "${EMAIL_SECTION_ADDED:-0}" -eq 0 ]]; then
      printf '\n# E-posta (yedekleme bildirimleri)\n' >> "$file"
      EMAIL_SECTION_ADDED=1
    fi
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

upsert_env EMAIL_HOST "$EMAIL_HOST" "$ENV_FILE"
upsert_env EMAIL_PORT "$EMAIL_PORT" "$ENV_FILE"
upsert_env EMAIL_HOST_USER "$EMAIL_HOST_USER" "$ENV_FILE"
upsert_env EMAIL_HOST_PASSWORD "$EMAIL_HOST_PASSWORD" "$ENV_FILE"
upsert_env DEFAULT_FROM_EMAIL "$DEFAULT_FROM_EMAIL" "$ENV_FILE"

chmod 640 "$ENV_FILE"
chown root:lms "$ENV_FILE"

echo "Kaydedildi: $ENV_FILE"
echo "Backend yeniden başlatılıyor: $BACKEND_SERVICE"
systemctl restart "$BACKEND_SERVICE"

echo
echo "Panel: Yedekleme → Ayarlar → bildirimleri aç → Test maili gönder"
echo
echo "SMTP test (sunucu):"
echo "  sudo -u lms bash -lc 'cd /var/www/lms/backend && set -a && . $ENV_FILE && set +a && /var/www/lms/venv/bin/python manage.py shell -c \"from django.core.mail import send_mail; send_mail(\\\"3K test\\\",\\\"OK\\\",None,[\\\"$EMAIL_HOST_USER\\\"],fail_silently=False)\"'"
