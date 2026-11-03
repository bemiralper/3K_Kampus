#!/usr/bin/env bash
# Tekrarlayan cron işi. Önceki çalışma sürüyorsa bu tur atlanır (beklemez).
#
# Kullanım:
#   cron-flock.sh <kilit-adı> <log-dosyası> -- komut...
#
# Kilit: /var/lock/lms-<kilit-adı>.lock
# Loga yazar: skip (çakışma) veya done (çıkış kodu ve süre, saniye).
# Komutun kendi çıktısı aynı loga eklenir. PYTHONUNBUFFERED açıktır;
# yönetim komutu ölürse başlangıç satırı tamponda kaybolmasın.
set -u

if [[ $# -lt 4 || "${3:-}" != "--" ]]; then
  echo "kullanim: cron-flock.sh <kilit-adi> <log-dosyasi> -- komut..." >&2
  exit 2
fi

name="$1"
log="$2"
shift 3

lock_dir="${LMS_LOCK_DIR:-/var/lock}"
lock="$lock_dir/lms-${name}.lock"
state_dir="${LMS_CRON_STATE_DIR:-/var/log/lms/cron-state}"
mkdir -p -- "$(dirname -- "$log")"

iso_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

# Nabız dosyası yazılamazsa iş yine de çalışır. Dosya silinmez; üzerine yazılır.
write_state() {
  local file="$1"
  local body="$2"
  mkdir -p -- "$state_dir" 2>/dev/null || return 0
  [[ -w "$state_dir" ]] || return 0
  printf '%s\n' "$body" >"$state_dir/$file" 2>/dev/null || true
}

# Aynı kilit tutulurken skip zamanı yenilenmez. Nabız, takılmanın başını gösterir.
# Başarılı tur done dosyasını günceller; skip dosyası silinmez.
note_skip() {
  local skip_file="$state_dir/${name}.skip"
  local done_file="$state_dir/${name}.done"
  mkdir -p -- "$state_dir" 2>/dev/null || return 0
  if [[ -f "$skip_file" && -f "$done_file" ]]; then
    local skip_ts done_ts
    skip_ts="$(awk '{print $1; exit}' "$skip_file" 2>/dev/null || echo 0)"
    done_ts="$(awk '{print $1; exit}' "$done_file" 2>/dev/null || echo 0)"
    if [[ "$skip_ts" =~ ^[0-9]+$ && "$done_ts" =~ ^[0-9]+$ && "$skip_ts" -gt "$done_ts" ]]; then
      return 0
    fi
  elif [[ -f "$skip_file" && ! -f "$done_file" ]]; then
    return 0
  fi
  write_state "${name}.skip" "$(date +%s)"
}

exec 9>"$lock"
if ! flock -n 9; then
  printf '%s skip lock=%s onceki-calisma-suruyor\n' "$(iso_now)" "$name" >>"$log"
  note_skip
  exit 0
fi

export PYTHONUNBUFFERED=1
start=$(date +%s)
set +e
"$@" >>"$log" 2>&1
code=$?
set -e
end=$(date +%s)
printf '%s done lock=%s exit=%s duration=%ss\n' "$(iso_now)" "$name" "$code" "$((end - start))" >>"$log"
write_state "${name}.done" "$(date +%s) ${code}"
exit "$code"
