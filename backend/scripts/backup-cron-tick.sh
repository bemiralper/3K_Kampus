#!/usr/bin/env bash
# Paneldeki saat gelmişse ve bu dönem yedek alınmadıysa Django'yu bir kez çalıştırır.
# Europe/Istanbul, config.settings TIME_ZONE ile aynıdır.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_ROOT="${LMS_APP_ROOT:-$REPO_ROOT}"
ENV_FILE="${LMS_ENV_FILE:-/etc/lms/env}"
VENV_PY="${LMS_VENV:-$APP_ROOT/venv/bin/python}"
TZ_NAME="Europe/Istanbul"

run_django() {
  cd "$APP_ROOT/backend"
  # shellcheck disable=SC1090
  set -a
  # Ortam dosyası yoksa Django kendi ayarıyla devam etsin.
  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
  fi
  set +a
  exec "$VENV_PY" manage.py run_scheduled_backups
}

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
fi

row=""
if [[ -n "${DB_NAME:-}" && -n "${DB_USER:-}" ]]; then
  row="$(
    PGPASSWORD="${DB_PASSWORD:-}" psql \
      -h "${DB_HOST:-localhost}" \
      -p "${DB_PORT:-5432}" \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -At -F '|' \
      -c "SELECT enabled::int, frequency, hour, minute,
                 COALESCE(to_char(last_run_at AT TIME ZONE '${TZ_NAME}', 'YYYY-MM-DD'), ''),
                 COALESCE(to_char(last_run_at AT TIME ZONE '${TZ_NAME}', 'IYYY-IW'), '')
          FROM yedekleme_schedule WHERE id = 1;" 2>/dev/null || true
  )"
fi

# Sorgu yoksa pencereyi Django karar versin. Yedek atlanmasın.
if [[ -z "$row" ]]; then
  run_django
fi

IFS='|' read -r enabled frequency hour minute last_date last_week <<<"$row"

if ! [[ "${hour:-}" =~ ^[0-9]+$ && "${minute:-}" =~ ^[0-9]+$ ]]; then
  run_django
fi

if [[ "$enabled" != "1" || "$frequency" == "off" || -z "$frequency" ]]; then
  exit 0
fi

now_h="$(TZ=$TZ_NAME date +%H)"
now_m="$(TZ=$TZ_NAME date +%M)"
now_date="$(TZ=$TZ_NAME date +%F)"
now_week="$(TZ=$TZ_NAME date +%G-%V)"
now_min=$((10#$now_h * 60 + 10#$now_m))
sched_min=$((hour * 60 + minute))

if (( now_min < sched_min )); then
  exit 0
fi

case "$frequency" in
  daily)
    [[ "${last_date:-}" == "$now_date" ]] && exit 0
    ;;
  weekly)
    [[ -n "${last_week:-}" && "$last_week" == "$now_week" ]] && exit 0
    ;;
  monthly)
    [[ -n "${last_date:-}" && "${last_date:0:7}" == "${now_date:0:7}" ]] && exit 0
    ;;
esac

run_django
