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
LOCK_FILE="${LMS_BACKUP_LOCK:-/var/lock/lms-backup.lock}"
START_EPOCH=$(date +%s)

iso_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# Sorgu başarısız olursa Django'ya düşülür. O düşüş de aynı kilidin içinde kalsın;
# aksi halde her 5 dakikada ikinci bir yedek süreci açılır.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$(iso_now) backup-tick skip: onceki calisma suruyor"
  exit 0
fi

finish() {
  local code=$?
  echo "$(iso_now) backup-tick done exit=${code} duration=$(( $(date +%s) - START_EPOCH ))s"
  exit "$code"
}
trap finish EXIT

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
  echo "$(iso_now) backup-tick django basladi"
  "$VENV_PY" manage.py run_scheduled_backups
  local code=$?
  echo "$(iso_now) backup-tick django bitti exit=${code}"
  exit "$code"
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
                 COALESCE(to_char(last_run_at AT TIME ZONE '${TZ_NAME}', 'IYYY-IW'), ''),
                 COALESCE(last_run_status, '')
          FROM yedekleme_schedule WHERE id = 1;" 2>/dev/null || true
  )"
fi

# Sorgu yoksa pencereyi Django karar versin. Yedek atlanmasın.
if [[ -z "$row" ]]; then
  echo "$(iso_now) backup-tick: zamanlama sorgusu bos, Django karar verecek"
  run_django
fi

IFS='|' read -r enabled frequency hour minute last_date last_week last_status <<<"$row"

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

# Aynı dönemde kayıt varsa normalde Django açılmaz. Başarısız deneme bunun
# dışında: last_run_at yazılmış olsa bile bu satır başarı sayılmaz. 15 dakikalık
# bekleme Django komutundadır; burada "bugün çalıştı" deyip çıkmak retry'ı keser.
period_recorded=0
case "$frequency" in
  daily)
    [[ "${last_date:-}" == "$now_date" ]] && period_recorded=1
    ;;
  weekly)
    [[ -n "${last_week:-}" && "$last_week" == "$now_week" ]] && period_recorded=1
    ;;
  monthly)
    [[ -n "${last_date:-}" && "${last_date:0:7}" == "${now_date:0:7}" ]] && period_recorded=1
    ;;
esac

if [[ "$period_recorded" -eq 1 && "${last_status:-}" != "failed" ]]; then
  exit 0
fi

if [[ "$period_recorded" -eq 1 && "${last_status:-}" == "failed" ]]; then
  echo "$(iso_now) backup-tick: son deneme basarisiz, Django yeniden degerlendirecek"
fi

run_django
