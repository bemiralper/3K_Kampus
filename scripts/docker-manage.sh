#!/usr/bin/env bash
# Docker dev backend içinde manage.py — host Homebrew PG'ye gitmez.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${LMS_DOCKER_ENV:-.env.docker}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Eksik: $ENV_FILE — önce ./scripts/docker-dev.sh" >&2
  exit 1
fi

exec docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" exec -T backend python manage.py "$@"
