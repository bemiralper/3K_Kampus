#!/usr/bin/env bash
# Demo ortamı: ayrı PostgreSQL veritabanı (lms_demo_db)
set -euo pipefail
cd "$(dirname "$0")/.."

export DJANGO_ENV=demo
export DB_NAME="${DB_NAME:-lms_demo_db}"

if [[ "${1:-}" == "--setup" ]]; then
  python manage.py setup_demo_database --seed --create-admin "${@:2}"
  exit 0
fi

if [[ "${1:-}" == "--migrate" ]]; then
  python manage.py migrate
  exit 0
fi

python manage.py runserver 0.0.0.0:8000
