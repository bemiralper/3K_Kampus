# Canlı deploy

Demo DB'de geliştirdikten sonra canlıya **yalnızca kod ve migration** alınır. Demo verisi taşınmaz.

| Ortam | DB | Deploy |
|-------|-----|--------|
| Demo | `lms_demo_db` | Yok (lokal) |
| Canlı | `lms_db` | Bu rehber |

Demo workflow: [demo-database.md](./demo-database.md)

**İlk kurulum (sıfırdan sunucu):** [server-setup-plan.md](./server-setup-plan.md)

---

## Hızlı deploy

Sunucuda (varsayılan kök: `/var/www/lms`):

```bash
export LMS_APP_ROOT=/var/www/lms
export LMS_BACKEND_SERVICE=lms-backend    # systemd unit adınız
export LMS_FRONTEND_SERVICE=lms-frontend  # veya LMS_PM2_APP=lms-frontend

# Ortam değişkenleri yüklü olsun (SECRET_KEY, DB_*, WHATSAPP_* …)
source /etc/lms/env   # örnek

cd "$LMS_APP_ROOT"
./backend/scripts/deploy-production.sh
```

Script sırasıyla:

1. `git pull` (dal: `main`, `LMS_GIT_BRANCH` ile değiştirilebilir)
2. `pip install -r requirements.txt`
3. `migrate --noinput`
4. `collectstatic --noinput`
5. `setup_roles` (yeni izinler — idempotent)
6. `npm ci` + `npm run build` (frontend)
7. `systemctl restart` veya `pm2 reload`

### Bayraklar

| Bayrak | Etki |
|--------|------|
| `--no-git` | Kod zaten güncellendi |
| `--no-frontend` | Sadece backend güncelle |
| `--no-restart` | Servisleri yeniden başlatma |
| `--no-pip` | Bağımlılık kurulumunu atla |
| `--branch develop` | Farklı dal çek |

Örnek — yalnızca migration:

```bash
./backend/scripts/deploy-production.sh --no-git --no-frontend --no-restart
# veya doğrudan:
cd backend && DJANGO_ENV=production python manage.py migrate
```

---

## Ortam değişkenleri

Örnek dosya: `backend/.env.production.example`

Zorunlular (`production.py`):

- `SECRET_KEY`, `ALLOWED_HOSTS`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`
- `WHATSAPP_APP_SECRET` (webhook imza doğrulama)

Deploy script ek değişkenleri:

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `LMS_APP_ROOT` | script'in bir üst dizini | Repo kökü |
| `LMS_BACKEND_DIR` | `$APP_ROOT/backend` | Django |
| `LMS_FRONTEND_DIR` | `$APP_ROOT/frontend` | Next.js |
| `LMS_VENV` | `$APP_ROOT/venv/bin/python` | Python yolu |
| `LMS_GIT_BRANCH` | `main` | Pull dalı |
| `LMS_BACKEND_SERVICE` | — | systemd backend unit |
| `LMS_FRONTEND_SERVICE` | — | systemd frontend unit |
| `LMS_PM2_APP` | — | pm2 kullanıyorsanız |

---

## systemd örneği

`/etc/systemd/system/lms-backend.service`:

```ini
[Unit]
Description=3K Kampüs LMS Django
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=/var/www/lms/backend
EnvironmentFile=/etc/lms/env
ExecStart=/var/www/lms/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/lms-frontend.service`:

```ini
[Unit]
Description=3K Kampüs LMS Next.js
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/lms/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable lms-backend lms-frontend
```

Nginx, SSL ve WhatsApp cron: [whatsapp-production-setup.md](./whatsapp-production-setup.md)

---

## İş akışı özeti

```
[Lokal demo DB]  geliştir + test
       ↓
     git push
       ↓
[Canlı sunucu]   deploy-production.sh
       ↓
     migrate → canlı lms_db şeması güncellenir
     demo verisi taşınmaz
```

---

## Sorun giderme

| Sorun | Çözüm |
|-------|--------|
| `ImproperlyConfigured: WHATSAPP_APP_SECRET` | `/etc/lms/env` içinde secret tanımlayın |
| migrate SSL hatası | `DB_HOST` cloud DB ise `sslmode=require` production'da açık |
| collectstatic izin hatası | `staticfiles/` dizinine www-data yazma izni |
| frontend build OOM | Sunucuda swap artırın veya lokal build + rsync |
| Servis restart yok | `LMS_BACKEND_SERVICE` / `LMS_PM2_APP` export edin |

Yedekleme deploy öncesi: [backup-restore.md](./backup-restore.md)
