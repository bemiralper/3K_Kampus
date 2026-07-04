# Platform Yedekleme ve Geri Yükleme

Platform geneli (tüm kurumlar) yedekleme sistemi. Super admin veya `yedekleme.*` izinlerine sahip kullanıcılar erişebilir.

## Bileşenler

| Bileşen | Açıklama |
|---------|----------|
| PostgreSQL dump | `pg_dump -Fc` ile custom format |
| Medya dosyaları | `MEDIA_ROOT` (varsayılan `backend/media`) |
| Arşiv | `.tar.gz` + `manifest.json` + `checksums.sha256` |
| Depolama | `backend/private/backups` (web erişimine kapalı) |

## Ortam Değişkenleri

```bash
BACKUP_LOCAL_ROOT=/var/lib/3k/backups
BACKUP_REMOTE_PROVIDER=local          # local | s3 | gcs (Faz 2)
BACKUP_ENCRYPTION_PROVIDER=none       # none (Faz 2: age/gpg)
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
BACKUP_RETENTION_MANUAL=30
```

## Cron

```cron
# Her saat başı zamanlanmış yedek kontrolü
0 * * * * cd /app/backend && DJANGO_ENV=production python manage.py run_scheduled_backups

# Her gece 04:00 retention temizliği
0 4 * * * cd /app/backend && DJANGO_ENV=production python manage.py purge_expired_backups
```

## API

Base URL: `/yedekleme/api/`

| Endpoint | Method | İzin |
|----------|--------|------|
| `dashboard/` | GET | yedekleme.read |
| `artifacts/` | GET | yedekleme.read |
| `artifacts/create/` | POST | yedekleme.create |
| `artifacts/<id>/download/` | GET | yedekleme.read |
| `artifacts/<id>/validate/` | POST | yedekleme.restore |
| `artifacts/<id>/restore/` | POST | yedekleme.restore (body: `{"confirm":"RESTORE"}`) |
| `artifacts/<id>/delete/` | DELETE | yedekleme.manage |
| `schedule/` | GET/PUT | read / manage |
| `logs/` | GET | yedekleme.read |

## Geri Yükleme Uyarısı

Geri yükleme mevcut veritabanını `--clean --if-exists` ile değiştirir ve medya klasörünü üzerine yazar. Üretimde işlem öncesi mutlaka yedek alın.

## Frontend

`/admin/yedekleme` — özet, geçmiş, zamanlama, geri yükleme sihirbazı, işlem logları.

## Test

```bash
cd backend && DJANGO_ENV=test python manage.py test apps/yedekleme/tests
```

## Faz 2 (iskelet hazır)

- `S3RemoteStorageProvider`, `GCSRemoteStorageProvider`
- Gerçek şifreleme provider (age/GPG)
- `.tar.zst` sıkıştırma (zstandard)
