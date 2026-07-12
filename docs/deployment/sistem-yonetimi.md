# Sistem Yönetimi (System Center)

SSH olmadan sunucu durumu, servisler, loglar, arka plan görevleri ve sistem sağlığını `/admin/sistem-yonetimi` üzerinden izleyin.

## Yetkiler

| Kod | Açıklama |
|-----|----------|
| `sistem_yonetimi.read` | Panel görüntüleme |
| `sistem_yonetimi.manage` | Görev çalıştırma, ayar, log indirme |
| `sistem_yonetimi.ops` | Servis start/stop/restart |
| `sistem.admin` | Tüm yetkiler (bypass) |

`bilgi_islem` rolüne read+manage+ops atanır. Seed: `python manage.py setup_roles`.

## API

`/sistem-yonetimi/api/` — dashboard, health, services, logs, errors, jobs, audit, timeline, performance, storage, settings.

## Metrik cron

```bash
sudo cp deploy/cron/lms-sistem /etc/cron.d/lms-sistem
sudo chmod 644 /etc/cron.d/lms-sistem
```

Komut: `collect_system_metrics` → CPU/RAM/disk/PG örnekleri.

## Servis kontrolü (bare-metal)

1. Helper kur:
```bash
sudo install -m 0755 deploy/sistem/lms-systemctl-helper /usr/local/sbin/lms-systemctl-helper
```
2. Sudoers (`/etc/sudoers.d/lms-sistem`):
```
lms ALL=(root) NOPASSWD: /usr/local/sbin/lms-systemctl-helper
```
3. Uygulama helper’ı `sudo` ile çağırmıyorsa, Gunicorn kullanıcısının `systemctl` yetkisi veya helper’ın setuid/sudo zinciri gerekir. Önerilen: Django tarafında `SISTEM_SYSTEMCTL_HELPER` ve ops kullanıcısına özel sudo.

Allowlist unit’ler: `postgresql`, `nginx`, `lms-backend`, `lms-frontend`.

Kritik işlemlerde UI onay metni ister: `YENIDEN_BASLAT` / `DURDUR` / `BASLAT`.

## Docker / geliştirme

`SISTEM_DOCKER_MODE` veya `/.dockerenv` algılanır; `systemctl` yoksa servis durumu TCP probe ile tahmin edilir, ops kapalı kalabilir (`SISTEM_OPS_ENABLED=0`).

Log path’leri host’ta `/var/log/lms/`; container içinde yoksa Log Merkezi “dosya yok” gösterir — volume mount önerilir.

## Ortam değişkenleri

| Değişken | Anlam |
|----------|--------|
| `SISTEM_OPS_ENABLED` | `0` ise ops kapalı |
| `SISTEM_DOCKER_MODE` | Zorla docker modu |
| `SISTEM_LOG_DIR` | Log kökü (default `/var/log/lms`) |
| `SISTEM_SYSTEMCTL_HELPER` | Helper yolu |

## Log izinleri

`lms` kullanıcısı `/var/log/lms/*.log` ve mümkünse `/var/log/nginx/error.log` okuyabilmeli.
