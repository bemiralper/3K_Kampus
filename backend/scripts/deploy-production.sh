#!/usr/bin/env bash
# Canlı deploy: git pull → pip (opsiyonel) → migrate → collectstatic → frontend build → servis restart
#
# Kullanım (sunucuda, repo kökünden veya backend/scripts/):
#   export LMS_APP_ROOT=/var/www/lms
#   export LMS_BACKEND_SERVICE=lms-backend
#   export LMS_FRONTEND_SERVICE=lms-frontend
#   ./backend/scripts/deploy-production.sh
#
# Bayraklar:
#   --no-git        git pull atla (kod zaten güncellendi)
#   --no-frontend   npm build atla
#   --no-restart    systemctl restart atla
#   --no-pip        requirements.txt kurulumunu atla
#   --branch main   çekilecek dal
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${LMS_BACKEND_DIR:-$(dirname "$SCRIPT_DIR")}"
APP_ROOT="${LMS_APP_ROOT:-$(dirname "$BACKEND_DIR")}"
FRONTEND_DIR="${LMS_FRONTEND_DIR:-$APP_ROOT/frontend}"
REQUIREMENTS="${LMS_REQUIREMENTS:-$APP_ROOT/requirements.txt}"

if [[ -n "${LMS_VENV:-}" ]]; then
  PYTHON="$LMS_VENV"
elif [[ -x "$APP_ROOT/venv/bin/python" ]]; then
  PYTHON="$APP_ROOT/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "Python bulunamadı. LMS_VENV veya $APP_ROOT/venv/bin/python ayarlayın." >&2
  exit 1
fi

PIP="${LMS_PIP:-${PYTHON%python}pip}"
if [[ ! -x "$PIP" ]]; then
  PIP="$PYTHON -m pip"
fi

export DJANGO_ENV=production

SKIP_GIT=false
SKIP_FRONTEND=false
SKIP_RESTART=false
SKIP_PIP=false
GIT_BRANCH="${LMS_GIT_BRANCH:-main}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-git) SKIP_GIT=true ;;
    --no-frontend) SKIP_FRONTEND=true ;;
    --no-restart) SKIP_RESTART=true ;;
    --no-pip) SKIP_PIP=true ;;
    --branch)
      GIT_BRANCH="${2:?--branch için dal adı gerekli}"
      shift
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Bilinmeyen argüman: $1 (--help)" >&2
      exit 1
      ;;
  esac
  shift
done

log() { printf '[deploy] %s\n' "$*"; }

# systemd EnvironmentFile gibi: set -a ile tüm değişkenleri export et
LMS_ENV_FILE="${LMS_ENV_FILE:-/etc/lms/env}"
if [[ -f "$LMS_ENV_FILE" ]]; then
  log "Ortam dosyası yükleniyor: $LMS_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$LMS_ENV_FILE"
  set +a
else
  log "Uyarı: $LMS_ENV_FILE bulunamadı"
fi

if [[ -z "${ALLOWED_HOSTS:-}" ]]; then
  cat >&2 <<EOF
[deploy] HATA: ALLOWED_HOSTS tanımlı değil.

Deploy öncesi ortam dosyasını yükleyin:
  set -a && source /etc/lms/env && set +a

Dosyada örnek satır:
  ALLOWED_HOSTS=app.3kkampus.com,127.0.0.1,localhost

Sonra tekrar:
  ./backend/scripts/deploy-production.sh --no-git
EOF
  exit 1
fi

log "APP_ROOT=$APP_ROOT"
log "BACKEND=$BACKEND_DIR"
log "PYTHON=$PYTHON"
log "DJANGO_ENV=$DJANGO_ENV"

cd "$APP_ROOT"

ROLLBACK_FILE="${LMS_ROLLBACK_FILE:-/var/lib/3k/last-deploy-sha}"
PRE_DEPLOY_SHA=""
PRE_DEPLOY_TAG=""

if [[ "$SKIP_GIT" != true ]]; then
  if [[ -d .git ]]; then
    PRE_DEPLOY_SHA="$(git rev-parse HEAD)"
    PRE_DEPLOY_TAG="deploy-backup-$(date +%Y%m%d-%H%M%S)"
    log "Geri alma noktası: $PRE_DEPLOY_TAG ($PRE_DEPLOY_SHA)"
    git tag "$PRE_DEPLOY_TAG" "$PRE_DEPLOY_SHA" 2>/dev/null || log "Uyarı: etiket oluşturulamadı (yetki?)"
    mkdir -p "$(dirname "$ROLLBACK_FILE")" 2>/dev/null || true
    if { echo "$PRE_DEPLOY_SHA"; echo "$PRE_DEPLOY_TAG"; } > "$ROLLBACK_FILE" 2>/dev/null; then
      log "Rollback kaydı: $ROLLBACK_FILE"
    elif { echo "$PRE_DEPLOY_SHA"; echo "$PRE_DEPLOY_TAG"; } > "$APP_ROOT/.last-deploy-sha" 2>/dev/null; then
      ROLLBACK_FILE="$APP_ROOT/.last-deploy-sha"
      log "Rollback kaydı: $ROLLBACK_FILE"
    fi
    log "Git: fetch + checkout $GIT_BRANCH + pull"
    git fetch origin
    git checkout "$GIT_BRANCH"
    git pull --ff-only origin "$GIT_BRANCH"
  else
    log "Git repo yok — pull atlandı"
  fi
else
  log "Git pull atlandı (--no-git)"
fi

if [[ "$SKIP_PIP" != true && -f "$REQUIREMENTS" ]]; then
  log "Python bağımlılıkları: $REQUIREMENTS"
  if [[ "$PIP" == *"-m pip"* ]]; then
    $PYTHON -m pip install -r "$REQUIREMENTS"
  else
    "$PIP" install -r "$REQUIREMENTS"
  fi
else
  log "pip kurulumu atlandı"
fi

cd "$BACKEND_DIR"

log "migrate"
"$PYTHON" manage.py migrate --noinput

log "collectstatic"
"$PYTHON" manage.py collectstatic --noinput

log "setup_roles (izin seed — idempotent)"
"$PYTHON" manage.py setup_roles

if [[ "$SKIP_FRONTEND" != true && -d "$FRONTEND_DIR" ]]; then
  log "frontend build: $FRONTEND_DIR"
  cd "$FRONTEND_DIR"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build
else
  log "frontend build atlandı"
fi

if [[ "$SKIP_RESTART" != true ]]; then
  restarted=false
  if [[ -n "${LMS_BACKEND_SERVICE:-}" ]]; then
    log "restart backend: $LMS_BACKEND_SERVICE"
    sudo systemctl restart "$LMS_BACKEND_SERVICE"
    restarted=true
  fi
  if [[ -n "${LMS_FRONTEND_SERVICE:-}" ]]; then
    log "restart frontend: $LMS_FRONTEND_SERVICE"
    sudo systemctl restart "$LMS_FRONTEND_SERVICE"
    restarted=true
  fi
  if [[ -n "${LMS_PM2_APP:-}" ]]; then
    log "pm2 reload: $LMS_PM2_APP"
    pm2 reload "$LMS_PM2_APP"
    restarted=true
  fi
  if [[ "$restarted" != true ]]; then
    log "Servis restart atlandı — LMS_BACKEND_SERVICE, LMS_FRONTEND_SERVICE veya LMS_PM2_APP tanımlayın"
  fi
else
  log "Servis restart atlandı (--no-restart)"
fi

log "Deploy tamamlandı."
if [[ -n "${PRE_DEPLOY_SHA:-}" ]]; then
  log "Geri alma: git checkout $PRE_DEPLOY_SHA && ./backend/scripts/deploy-production.sh --no-git"
  log "veya etiket: git checkout $PRE_DEPLOY_TAG"
fi
