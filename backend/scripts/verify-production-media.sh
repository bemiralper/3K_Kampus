#!/usr/bin/env bash
# Canlı medya servisi tanı — nginx alias + disk + örnek URL
#
# Sunucuda:
#   export LMS_APP_ROOT=/var/www/lms
#   ./backend/scripts/verify-production-media.sh
#   ./backend/scripts/verify-production-media.sh https://www.3kkampus.com
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${LMS_BACKEND_DIR:-$(dirname "$SCRIPT_DIR")}"
APP_ROOT="${LMS_APP_ROOT:-$(dirname "$BACKEND_DIR")}"
MEDIA_DIR="$BACKEND_DIR/media"
PUBLIC_BASE="${1:-https://www.3kkampus.com}"

echo "[media-check] MEDIA_DIR=$MEDIA_DIR"
if [[ ! -d "$MEDIA_DIR" ]]; then
  echo "[media-check] HATA: media dizini yok — mkdir -p $MEDIA_DIR && chown lms:www-data $MEDIA_DIR"
  exit 1
fi

file_count="$(find "$MEDIA_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "[media-check] Dosya sayısı: $file_count"
if [[ "$file_count" == "0" ]]; then
  echo "[media-check] UYARI: media/ boş — yüklemeler diske yazılmıyor olabilir"
fi

sample="$(find "$MEDIA_DIR" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.webp' \) 2>/dev/null | head -1)"
if [[ -z "$sample" ]]; then
  echo "[media-check] Örnek görsel bulunamadı (henüz yükleme yok)"
  exit 0
fi

rel="${sample#$MEDIA_DIR/}"
url="${PUBLIC_BASE%/}/media/${rel}"
echo "[media-check] Örnek dosya: $sample"
echo "[media-check] Test URL: $url"

if command -v curl >/dev/null 2>&1; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo '000')"
  echo "[media-check] HTTP: $code"
  if [[ "$code" != "200" ]]; then
    echo "[media-check] HATA: nginx /media/ alias veya izin sorunu."
    echo "  Beklenen nginx: location /media/ { alias $MEDIA_DIR/; }"
    echo "  Kontrol: sudo nginx -T | grep -A2 'location /media'"
    exit 1
  fi
  echo "[media-check] OK — medya erişilebilir"
fi
