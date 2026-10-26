#!/usr/bin/env bash
# Evde ve işyerinde IP değişse bile API (8000) ve Mobil (8081) sunucularını tek komutla başlatır.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

detect_lan_ip() {
  local ip=""
  for iface in en0 en1 bridge100; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done
  echo "Taner-Alper.local"
}

LAN_IP="$(detect_lan_ip)"
MDNS_HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"

if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "API (port 8000) başlatılıyor..."
  (
    cd "$ROOT/backend"
    nohup ./venv/bin/python manage.py runserver 0.0.0.0:8000 >/tmp/3k-kampus-api.log 2>&1 &
  )
fi

echo "=================================================="
echo " 3K Kampüs Mobil Geliştirme"
echo " Yerel IP   : http://${LAN_IP}:8081"
echo " Sabit Adres: http://${MDNS_HOST}:8081"
echo " API        : http://${LAN_IP}:8000"
echo "=================================================="

cd "$ROOT/mobile"
export REACT_NATIVE_PACKAGER_HOSTNAME="${LAN_IP}"
exec ./node_modules/.bin/expo start --host lan --port 8081
