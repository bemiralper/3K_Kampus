#!/usr/bin/env bash
# Son deploy öncesi commit'e geri dön ve yeniden deploy et.
#
# Kullanım (sunucuda):
#   export LMS_APP_ROOT=/var/www/lms
#   export LMS_BACKEND_SERVICE=lms-backend
#   export LMS_FRONTEND_SERVICE=lms-frontend
#   ./backend/scripts/rollback-production.sh
#
# Belirli commit/etiket:
#   ./backend/scripts/rollback-production.sh deploy-backup-20260706-014500
#   ./backend/scripts/rollback-production.sh abc1234
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${LMS_APP_ROOT:-$(dirname "$(dirname "$SCRIPT_DIR")")}"
ROLLBACK_FILE="${LMS_ROLLBACK_FILE:-/var/lib/3k/last-deploy-sha}"

TARGET="${1:-}"

if [[ -z "$TARGET" && -f "$ROLLBACK_FILE" ]]; then
  TARGET="$(sed -n '1p' "$ROLLBACK_FILE")"
  TAG="$(sed -n '2p' "$ROLLBACK_FILE")"
  echo "[rollback] Kayıtlı nokta: ${TAG:-?} ($TARGET)"
fi

if [[ -z "$TARGET" ]]; then
  echo "[rollback] HATA: Geri alınacak commit bulunamadı." >&2
  echo "Kullanım: $0 <commit-hash|deploy-backup-etiketi>" >&2
  exit 1
fi

cd "$APP_ROOT"
if [[ ! -d .git ]]; then
  echo "[rollback] HATA: Git repo yok: $APP_ROOT" >&2
  exit 1
fi

echo "[rollback] checkout $TARGET"
git fetch origin
git checkout "$TARGET"

export LMS_APP_ROOT="$APP_ROOT"
exec "$SCRIPT_DIR/deploy-production.sh" --no-git
