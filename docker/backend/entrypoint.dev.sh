#!/bin/sh
set -eu

cd /app/backend

echo "[backend-dev] Waiting for PostgreSQL (${DB_HOST:-db}:${DB_PORT:-5432})..."
until python - <<'PY'
import os, sys
import psycopg

conninfo = (
    f"host={os.environ.get('DB_HOST', 'db')} "
    f"port={os.environ.get('DB_PORT', '5432')} "
    f"dbname={os.environ.get('DB_NAME', 'lms_db')} "
    f"user={os.environ.get('DB_USER', 'lms')} "
    f"password={os.environ.get('DB_PASSWORD', 'lms')}"
)
try:
    with psycopg.connect(conninfo, connect_timeout=3):
        sys.exit(0)
except Exception:
    sys.exit(1)
PY
do
  sleep 2
done

echo "[backend-dev] migrate"
python manage.py migrate --noinput

mkdir -p /app/backend/private/backups

echo "[backend-dev] setup_roles"
python manage.py setup_roles

# PDF raporları — image eskiyse veya cache silindiyse Chromium'u tamamla
if ! python - <<'PY'
import os, sys
from pathlib import Path
root = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "/ms-playwright"))
if not root.exists() or not any(root.glob("chromium*")):
    sys.exit(1)
sys.exit(0)
PY
then
  echo "[backend-dev] Playwright Chromium eksik — kuruluyor..."
  python -m playwright install chromium
  python -m playwright install-deps chromium 2>/dev/null || true
fi

if [ "$#" -gt 0 ]; then
  echo "[backend-dev] starting: $*"
  exec "$@"
fi

echo "[backend-dev] runserver on 0.0.0.0:8000"
exec python manage.py runserver 0.0.0.0:8000
