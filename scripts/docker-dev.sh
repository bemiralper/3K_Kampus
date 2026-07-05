#!/usr/bin/env bash
# Docker development — native venv/npm kurulumunu değiştirmez.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${LMS_DOCKER_ENV:-.env.docker}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Oluşturuluyor: $ENV_FILE (.env.docker.example'dan)"
  cp .env.docker.example "$ENV_FILE"
fi

exec docker compose -f docker-compose.dev.yml --env-file "$ENV_FILE" up --build "$@"
