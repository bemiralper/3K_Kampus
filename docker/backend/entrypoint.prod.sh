#!/bin/sh
set -eu

cd /app/backend

if [ -n "${DB_HOST:-}" ]; then
  echo "[backend-prod] Waiting for PostgreSQL (${DB_HOST}:${DB_PORT:-5432})..."
  until python - <<'PY'
import os, sys
import psycopg

conninfo = (
    f"host={os.environ['DB_HOST']} "
    f"port={os.environ.get('DB_PORT', '5432')} "
    f"dbname={os.environ.get('DB_NAME', 'lms_db')} "
    f"user={os.environ.get('DB_USER', 'lms')} "
    f"password={os.environ.get('DB_PASSWORD', '')}"
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
fi

echo "[backend-prod] migrate"
python manage.py migrate --noinput

mkdir -p /app/backend/private/backups

echo "[backend-prod] collectstatic"
python manage.py collectstatic --noinput

echo "[backend-prod] setup_roles"
python manage.py setup_roles

echo "[backend-prod] starting: $*"
exec "$@"
