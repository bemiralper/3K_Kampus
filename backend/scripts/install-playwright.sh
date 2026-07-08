#!/usr/bin/env bash
# Playwright Chromium — PDF raporları (Gelir/Gider, Cari, Gün Sonu) için gerekli.
# pip install playwright yeterli değil; tarayıcı binary ayrı indirilir.
#
# Kullanım:
#   ./backend/scripts/install-playwright.sh
#   LMS_VENV=/var/www/lms/venv/bin/python ./backend/scripts/install-playwright.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
APP_ROOT="$(dirname "$BACKEND_DIR")"

if [[ -n "${LMS_VENV:-}" ]]; then
  PYTHON="$LMS_VENV"
elif [[ -x "$BACKEND_DIR/venv/bin/python" ]]; then
  PYTHON="$BACKEND_DIR/venv/bin/python"
elif [[ -x "$APP_ROOT/venv/bin/python" ]]; then
  PYTHON="$APP_ROOT/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
else
  echo "Python bulunamadı." >&2
  exit 1
fi

echo "[playwright] Python: $PYTHON"
"$PYTHON" -m pip show playwright >/dev/null 2>&1 || {
  echo "[playwright] playwright pip paketi yok — requirements.txt kuruluyor..."
  "$PYTHON" -m pip install -r "$APP_ROOT/requirements.txt"
}

echo "[playwright] Chromium indiriliyor..."
"$PYTHON" -m playwright install chromium

if [[ "$(uname -s)" == "Linux" ]]; then
  echo "[playwright] Linux sistem bağımlılıkları (install-deps)..."
  if [[ "$(id -u)" -eq 0 ]]; then
    "$PYTHON" -m playwright install-deps chromium
  else
    echo "[playwright] install-deps root gerektirebilir: sudo $PYTHON -m playwright install-deps chromium"
    "$PYTHON" -m playwright install-deps chromium 2>/dev/null || true
  fi
fi

echo "[playwright] Doğrulama..."
"$PYTHON" - <<'PY'
from apps.communication.application.html_to_pdf import render_html_to_pdf

html = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h1>Playwright PDF Test</h1>
<p>Gelir gider ve cari rapor PDF dışa aktarma bu Chromium ile çalışır.</p>
<table><tr><th>Durum</th><td>OK</td></tr></table>
</body></html>"""
pdf = render_html_to_pdf(html)
assert pdf.startswith(b"%PDF"), "geçersiz PDF"
print(f"[playwright] PDF test OK ({len(pdf)} bayt)")
PY

echo "[playwright] Kurulum tamam."
