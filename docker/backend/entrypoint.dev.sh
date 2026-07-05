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

if [ "$#" -gt 0 ]; then
  echo "[backend-dev] starting: $*"
  exec "$@"
fi

echo "[backend-dev] runserver on 0.0.0.0:8000"
exec python manage.py runserver 0.0.0.0:8000
