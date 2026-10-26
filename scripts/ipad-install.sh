#!/usr/bin/env bash
# Bağlı iPad'e hazır derlenmiş (Taner-Alper.local adresli) uygulamayı 3 saniyede yükler.
set -euo pipefail

APP_PATH="/tmp/3k-kampus-ios/Build/Products/Debug-iphoneos/3KKamps.app"
DEVICE_ID="00008101-001329CC0E00001E"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Derlenmiş paket bulunamadı, oluşturuluyor..."
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$ROOT/mobile/ios"
  xcodebuild -workspace 3KKamps.xcworkspace -scheme 3KKamps -configuration Debug -destination 'generic/platform=iOS' -allowProvisioningUpdates DEVELOPMENT_TEAM=WA5Y5L8469 CODE_SIGN_STYLE=Automatic -derivedDataPath /tmp/3k-kampus-ios build
fi

xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE_ID" com.kkampus.ogretmen
echo "iPad'e kuruldu ve açıldı (Taner-Alper.local — ev/işyeri IP'sinden bağımsız)."
