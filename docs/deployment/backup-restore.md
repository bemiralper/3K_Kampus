# Yedekleme ve Geri Yükleme (v2)

> **Format:** Manifest `2.0` (ZIP + opsiyonel AES-256-GCM).  
> **Eski sistem:** Manifest `1.0` / `.tar.gz` yedekleri **desteklenmez** (UI’da listelenmez / geri yüklenmez).

## Mimari

Sistem üç katmanlıdır ve **modül bilmez**:

1. **Backup Engine** (`apps.yedekleme.engine`) — export/ZIP/şifreleme/SHA-256/restore/dry-run/job log
2. **Resource Registry** (`BackupResource` + `register_resources`) — yedeklenebilir kaynak kataloğu
3. **Modules** — yalnızca `backup_resources.py` ile kaynak tanımlar; yedekleme kodu içermez

```
Modül AppConfig.ready
    → register_resources(label, RESOURCES)
    → sync_backup_resources / API sync
    → BackupResource satırları
    → Engine yalnızca registry okur
```

## Yedek türleri

| Tür | Anlamı |
|-----|--------|
| `full` | Varsayılan (`is_default`) aktif kaynaklar |
| `database` | DB kaynakları; `system.database` (pg_dump -Fc) varsa onu tercih eder |
| `files` | Medya / dosya / log / cache |
| `settings` | Configuration kaynakları |
| `selected` | İstekte verilen `resource_codes` |

## Kurulum

```bash
cd backend
python manage.py migrate yedekleme
python manage.py sync_backup_resources
```

### Şifreleme (AES-256-GCM)

```bash
# 32 byte önerilir (base64 veya passphrase; passphrase SHA-256 ile türetilir)
export BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Anahtar yokken `encrypt=true` yedek isteği hata verir.

### Depolama

`BACKUP_LOCAL_ROOT` (varsayılan: `backend/private/backups`).

## Cron (canlı — zorunlu)

UI’da “Günlük 03:00” ayarı **tek başına yedek almaz**. Canlıda cron kurulmalıdır.

### Hızlı kurulum (önerilen)

Sunucuda, repo kökünden **root** olarak:

```bash
cd /var/www/lms
sudo ./backend/scripts/install-backup-cron.sh
```

Bu işlem `/etc/cron.d/lms-yedekleme` dosyasını yazar:

- Her dakika → `run_scheduled_backups` (UI’daki saat±1 dk penceresini yakalar)
- Her gün 04:00 → `purge_expired_backups`

### Doğrulama

```bash
# Cron dosyası
sudo cat /etc/cron.d/lms-yedekleme

# Hemen bir yedek dene
sudo -u lms bash -lc 'cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py run_scheduled_backups --force'

# Log
sudo tail -f /var/log/lms/backups.log
```

UI: **Yedekleme → Otomatik Yedekleme** → sıklık (Günlük/Haftalık/Aylık) + saat/dakika → Kaydet.  
İsterseniz **Şimdi Çalıştır** ile cron beklemeden test edin.

### Manuel crontab (alternatif)

```cron
* * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py run_scheduled_backups >> /var/log/lms/backups.log 2>&1
0 4 * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py purge_expired_backups >> /var/log/lms/backups.log 2>&1
```

Docker (host cron örneği):

```cron
* * * * * docker compose -f /path/to/docker-compose.dev.yml --env-file /path/to/.env.docker exec -T backend python manage.py run_scheduled_backups
```

Manuel test / hemen çalıştır:

```bash
python manage.py run_scheduled_backups --force
# veya UI: Otomatik Yedekleme → Şimdi Çalıştır
# veya API: POST /yedekleme/api/schedule/run/
```

Otomatik ayarlar: Kapalı / Günlük / Haftalık / Aylık, saat-dakika, max yedek, eskiyi sil.

## İndirilen yedeği tekrar yükleme

1. UI → **Geri Yükleme** → “İndirilmiş yedeği yükle” (`.zip` / `.zip.enc`, format v2)
2. Dosya sisteme kaydolur (geçmiş listesine düşer)
3. Analiz → Dry-run → `RESTORE` yazarak geri yükle

API: `POST /yedekleme/api/backups/upload/` (multipart `file`)

## Google Drive yedekleme

Uygulama şu an yedekleri **yerel diske** yazar (`BACKUP_LOCAL_ROOT`). Google Drive için önerilen yol: sunucuda **rclone** ile klasörü Drive’a senkronlamak (motor değiştirilmez).

```bash
# 1) rclone kurulumu + remote (ör. gdrive)
rclone config

# 2) Yedek klasörünü Drive'a kopyala (cron, yedekten ~10 dk sonra)
# Production örnek:
15 3 * * * rclone copy /var/lib/3k/backups gdrive:3k-kampus-backups --include "*.zip" --include "*.zip.enc" --max-age 2d >> /var/log/3k-rclone-backup.log 2>&1

# Docker volume yolu genelde:
# rclone copy /var/lib/docker/volumes/.../backups gdrive:3k-kampus-backups ...
```

Notlar:
- Şifreli yedek (`.zip.enc`) tercih edin; Drive’da da `BACKUP_ENCRYPTION_KEY` olmadan açılamaz.
- Yerel retention (`purge_expired_backups`) ile Drive’daki eski dosyalar otomatik silinmez — Drive tarafında ayrı yaşam döngüsü/manuel temizlik gerekir.
- Native “Drive’a doğrudan API upload” provider henüz yok; ihtiyaç halinde ayrı faz olarak eklenebilir.

## API

Base: `/yedekleme/api/`

| Endpoint | Yetki |
|----------|-------|
| `GET dashboard/` | read |
| `GET/POST resources/`, `PATCH resources/<id>/`, `POST .../deactivate/`, `POST resources/sync/` | read / manage |
| `GET/POST backups/`, `POST backups/upload/` | read / create (+restore upload) |
| `.../preview/`, `.../download/` | read |
| `.../verify/`, `.../analyze/`, `.../dry-run/`, `.../restore/` | restore |
| `DELETE .../delete/`, `GET/PUT schedule/`, `POST schedule/run/`, `GET/PUT settings/`, `POST purge/` | manage / create |
| `GET logs/`, `GET jobs/<id>/` | read |

İzin kodları: `yedekleme.read`, `yedekleme.create`, `yedekleme.restore`, `yedekleme.manage`.

## UI

`/admin/yedekleme` — sekmeler: Genel Durum, Manuel Yedek, Otomatik, Kaynaklar, Geçmiş, Geri Yükleme, Günlükler, Ayarlar.

## Yeni modül ekleme

1. `apps/<modül>/backup_resources.py` içinde `RESOURCES = [ResourceSpec(...)]`
2. `AppConfig.ready` içinde `register_resources(self.label, RESOURCES)`
3. `python manage.py sync_backup_resources`

Motor koduna dokunulmaz.

## Geri yükleme akışı

1. Önizle / Doğrula (SHA-256)
2. Analiz (kaynaklar, ETA, eksik, uyumsuzluk, çakışma)
3. Dry-run (satır/dosya simülasyonu; yan etki yok)
4. `confirm: "RESTORE"` ile geri yükleme

`system.database` tam dump restore: `pg_restore --clean --if-exists` (yıkıcı).

## Geçiş notu

Eski `.tar.gz` artifact kayıtları DB’de kalsa bile v2 motoru onları açmaz. Diskteki eski dosyalar manuel silinebilir.
