#!/usr/bin/env bash
# Nginx bakım sayfası snippet'ini /etc/nginx/sites-available/lms içine ekler.
#
# Kullanım (root, production):
#   sudo ./backend/scripts/install-maintenance-nginx.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INCLUDE_SRC="${LMS_MAINTENANCE_INCLUDE:-$REPO_ROOT/deploy/nginx/lms-maintenance.include}"
NGINX_SITE="${LMS_NGINX_SITE:-/etc/nginx/sites-available/lms}"
MARKER="# 3K LMS maintenance mode"
SNIPPET_DST="/etc/nginx/snippets/lms-maintenance.conf"
FLAG_DIR="${LMS_MAINTENANCE_FLAG_DIR:-/var/lib/3k}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Root olarak çalıştırın: sudo $0" >&2
  exit 1
fi

if [[ ! -f "$INCLUDE_SRC" ]]; then
  echo "Snippet bulunamadı: $INCLUDE_SRC" >&2
  exit 1
fi

if [[ ! -f "$NGINX_SITE" ]]; then
  echo "Nginx site config yok: $NGINX_SITE" >&2
  echo "LMS_NGINX_SITE=/path/to/site ile belirtin." >&2
  exit 1
fi

mkdir -p "$FLAG_DIR"
mkdir -p /etc/nginx/snippets
install -m 644 "$INCLUDE_SRC" "$SNIPPET_DST"

if grep -qF "$MARKER" "$NGINX_SITE"; then
  echo "Zaten kurulu: $NGINX_SITE"
else
  tmp="$(mktemp)"
  awk -v marker="$MARKER" -v snippet="    include $SNIPPET_DST; $marker" '
    /server_name/ && !done {
      print
      print snippet
      done=1
      next
    }
    { print }
  ' "$NGINX_SITE" > "$tmp"
  install -m 644 "$tmp" "$NGINX_SITE"
  rm -f "$tmp"
  echo "Eklendi: $NGINX_SITE → include $SNIPPET_DST"
fi

nginx -t
systemctl reload nginx
echo "Bakım modu nginx hazır. Deploy script flag dosyası ile 503 + bilgi sayfası gösterir."
