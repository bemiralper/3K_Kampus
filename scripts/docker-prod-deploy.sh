#!/usr/bin/env bash
# Docker production deploy — sunucuda build + up (registry gerekmez).
# Mevcut deploy-production.sh ile paralel; systemd kurulumunu otomatik kapatmaz.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${LMS_DOCKER_ENV:-.env.production.docker}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Hata: $ENV_FILE yok. cp .env.production.docker.example $ENV_FILE" >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

echo "==> Build"
"${COMPOSE[@]}" build

echo "==> Up"
"${COMPOSE[@]}" up -d

echo "==> Migrate (idempotent)"
"${COMPOSE[@]}" exec -T backend python manage.py migrate --noinput

echo "==> setup_roles (idempotent)"
"${COMPOSE[@]}" exec -T backend python manage.py setup_roles

echo "Deploy tamamlandı. HTTP port: ${LMS_DOCKER_HTTP_PORT:-8080}"
