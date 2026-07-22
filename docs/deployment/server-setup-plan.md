# Canlı Sunucu Kurulum Planı

3K Kampüs LMS'i sıfırdan production sunucusuna kurmak için adım adım plan.

**İlgili dokümanlar:**

- [production-deploy.md](./production-deploy.md) — güncelleme deploy script'i
- [demo-database.md](./demo-database.md) — demo vs canlı veritabanı
- [whatsapp-production-setup.md](./whatsapp-production-setup.md) — WhatsApp / cron / nginx webhook
- [backup-restore.md](./backup-restore.md) — yedekleme

---

## Varsayımlar

| Konu | Değer (örnek) |
|------|----------------|
| OS | Ubuntu 22.04 / 24.04 LTS |
| Sunucu | 2 vCPU, 4 GB RAM, 40 GB SSD |
| Domain | `app.sizinkurum.com` |
| Uygulama kökü | `/var/www/lms` |
| Deploy kullanıcısı | `lms` |
| Veritabanı | PostgreSQL `lms_db` |
| Mimari | Nginx → Next.js (:3000) + Gunicorn/Django (:8000) |

**Önemli:** Canlıya yalnızca **kod + migration** gider. Demo DB (`lms_demo_db`) verisi taşınmaz.

---

## Mimari

```
Tarayıcı
   ↓ HTTPS
 Nginx (:443)
   ├─ /static/, /media/              → disk
   ├─ /api/communication/webhook/    → Django :8000 (doğrudan)
   ├─ /api/communication/events/stream/ → Django :8000 (SSE)
   └─ / (geri kalan)                   → Next.js :3000
                                          ↓ server-side proxy
                                       Django :8000
                                          ↓
                                    PostgreSQL lms_db
```

---

## Faz 1 — Sunucu hazırlığı

### 1.1 SSH ve sistem güncellemesi

```bash
ssh root@SUNUCU_IP

apt update && apt upgrade -y
apt install -y git curl build-essential nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib ufw
```

### 1.2 Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

### 1.3 Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # v20.x beklenir
npm -v
```

### 1.4 Deploy kullanıcısı

```bash
adduser --disabled-password --gecos "" lms
usermod -aG www-data lms

mkdir -p /var/www/lms /var/log/lms /var/lib/3k/backups
chown -R lms:www-data /var/www/lms /var/log/lms /var/lib/3k/backups
mkdir -p /etc/lms
chmod 755 /etc/lms
```

### 1.5 DNS

Domain panelinde **A kaydı**:

```
app.sizinkurum.com  →  SUNUCU_IP
```

---

## Faz 2 — PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER lms_user WITH PASSWORD 'GÜÇLÜ_ŞİFRE';
CREATE DATABASE lms_db OWNER lms_user;
GRANT ALL PRIVILEGES ON DATABASE lms_db TO lms_user;
\q
```

**SSL notu:** `DB_SSLMODE` env ile ayarlanır (varsayılan `require`).

- Managed DB (RDS, Supabase vb.): `DB_SSLMODE=require`
- Aynı sunucudaki PostgreSQL SSL kapalıysa: `DB_SSLMODE=disable`

---

## Faz 3 — Kodu sunucuya al

```bash
su - lms
cd /var/www/lms

git clone https://github.com/KULLANICI/3k-kampus-lms.git .
# veya SSH: git clone git@github.com:KULLANICI/3k-kampus-lms.git .
```

---

## Faz 4 — Python ortamı

```bash
cd /var/www/lms
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn
```

### 4.1 Ortam dosyası `/etc/lms/env`

Root ile oluşturun:

```bash
sudo nano /etc/lms/env
```

```bash
# ── Django ──
DJANGO_ENV=production
SECRET_KEY=BURAYA_RASTGELE_50_KARAKTER
ALLOWED_HOSTS=app.sizinkurum.com,127.0.0.1,localhost

# ── Veritabanı ──
DB_NAME=lms_db
DB_USER=lms_user
DB_PASSWORD=GÜÇLÜ_ŞİFRE
DB_HOST=localhost
DB_PORT=5432
# Aynı sunucu PG (SSL yok): disable | managed DB: require
DB_SSLMODE=disable

# ── Uygulama ──
FRONTEND_URL=https://app.sizinkurum.com
CSRF_TRUSTED_ORIGINS_EXTRA=https://app.sizinkurum.com

# ── WhatsApp (production boot için WHATSAPP_APP_SECRET zorunlu) ──
WHATSAPP_APP_SECRET=gecici-deger-degistirin
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=

# ── E-posta (opsiyonel) ──
EMAIL_HOST=smtp.ornek.com
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=

# ── Yedekleme (opsiyonel) ──
BACKUP_LOCAL_ROOT=/var/lib/3k/backups
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
```

```bash
sudo chown root:lms /etc/lms/env
sudo chmod 640 /etc/lms/env
```

`640` + grup `lms`: systemd `EnvironmentFile` ile okur; cron (`User=lms`) da `source /etc/lms/env` yapabilir. `600 root:root` yalnızca root okur — cron job'ları **Permission denied** ile düşer.

**SECRET_KEY üret:**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

Şablon: `backend/.env.production.example`

---

## Faz 5 — Frontend ortamı

```bash
nano /var/www/lms/frontend/.env.production.local
```

```bash
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

Next.js, tarayıcıdan gelen `/api/...` isteklerini sunucu içinde Django'ya proxy eder.

---

## Faz 6 — İlk Django kurulumu

```bash
cd /var/www/lms
source venv/bin/activate
set -a && source /etc/lms/env && set +a
export DJANGO_ENV=production

cd backend
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py setup_roles
python manage.py createsuperuser
```

Dizin izinleri:

```bash
mkdir -p media staticfiles private/backups
sudo chown -R lms:www-data media staticfiles private
```

---

## Faz 7 — Frontend build

RAM yetersizse önce swap:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Build:

```bash
cd /var/www/lms/frontend
npm ci
npm run build
```

---

## Faz 8 — systemd servisleri

### 8.1 Backend — `/etc/systemd/system/lms-backend.service`

```ini
[Unit]
Description=3K Kampüs LMS Django (Gunicorn)
After=network.target postgresql.service

[Service]
User=lms
Group=www-data
WorkingDirectory=/var/www/lms/backend
EnvironmentFile=/etc/lms/env
Environment=DJANGO_ENV=production
ExecStart=/var/www/lms/venv/bin/gunicorn config.wsgi:application \
  --bind 127.0.0.1:8000 \
  --workers 3 \
  --timeout 120 \
  --access-logfile /var/log/lms/backend-access.log \
  --error-logfile /var/log/lms/backend-error.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8.2 Frontend — `/etc/systemd/system/lms-frontend.service`

```ini
[Unit]
Description=3K Kampüs LMS Next.js
After=network.target lms-backend.service

[Service]
User=lms
Group=www-data
WorkingDirectory=/var/www/lms/frontend
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/var/www/lms/frontend/.env.production.local
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8.3 Başlat

```bash
sudo systemctl daemon-reload
sudo systemctl enable lms-backend lms-frontend
sudo systemctl start lms-backend lms-frontend
sudo systemctl status lms-backend lms-frontend
```

---

## Faz 9 — Nginx

`/etc/nginx/sites-available/lms`:

```nginx
server {
    listen 80;
    server_name app.sizinkurum.com;

    client_max_body_size 50m;

    location /api/communication/webhook/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location /api/communication/events/stream/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /var/www/lms/backend/staticfiles/;
        expires 30d;
    }

    location /media/ {
        alias /var/www/lms/backend/media/;
        expires 7d;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Faz 10 — SSL (HTTPS)

```bash
sudo certbot --nginx -d app.sizinkurum.com
```

Tarayıcı: `https://app.sizinkurum.com`

---

## Faz 11 — Cron işleri

```bash
sudo crontab -e -u lms
```

```cron
# Giden mesaj kuyruğu (WhatsApp/SMS)
* * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py process_communication_queue >> /var/log/lms/comm_queue.log 2>&1

# Zamanlanmış kampanyalar
*/5 * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py process_scheduled_campaigns >> /var/log/lms/campaigns.log 2>&1

# Ödeme hatırlatmaları (günlük 09:00)
0 9 * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py send_payment_reminders --days-ahead=3 >> /var/log/lms/payment_reminders.log 2>&1

# Takvim hatırlatmaları
* * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py process_reminders >> /var/log/lms/reminders.log 2>&1

# Yedekleme (zorunlu — UI ayarı tek başına yetmez; her dakika zaman penceresi kontrolü)
* * * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py run_scheduled_backups >> /var/log/lms/backups.log 2>&1
0 4 * * * cd /var/www/lms/backend && set -a && . /etc/lms/env && set +a && /var/www/lms/venv/bin/python manage.py purge_expired_backups >> /var/log/lms/backups.log 2>&1
```

Tercihen `/etc/cron.d` ile kurun (root):

```bash
sudo ./backend/scripts/install-backup-cron.sh
```

Detay: [backup-restore.md](./backup-restore.md), [whatsapp-production-setup.md](./whatsapp-production-setup.md)

---

## Faz 12 — İlk canlı kurulum (uygulama içi)

- [ ] `https://app.sizinkurum.com` — superuser ile giriş
- [ ] Kurum oluştur
- [ ] Şube oluştur
- [ ] Finans tanımları (mali hesap, gelir/gider kategorileri, ödeme yöntemi)
- [ ] Personel ve roller ata
- [ ] Manuel yedek al (Ayarlar → Yedekleme)

Canlıda **Demo Yönetimi** devre dışıdır (doğru davranış).

---

## Faz 13 — Sonraki güncellemeler

Lokal demo DB'de geliştir → git push → sunucuda:

```bash
export LMS_APP_ROOT=/var/www/lms
export LMS_BACKEND_SERVICE=lms-backend
export LMS_FRONTEND_SERVICE=lms-frontend

cd /var/www/lms
set -a && source /etc/lms/env && set +a

./backend/scripts/deploy-production.sh
```

Script adımları: `git pull` → `pip install` → `migrate` → `collectstatic` → `setup_roles` → `npm ci && npm run build` → servis restart.

Bayraklar: `--no-frontend`, `--no-git`, `--no-restart`, `--no-pip`, `--branch develop`

Detay: [production-deploy.md](./production-deploy.md)

---

## Kontrol listesi

### Kurulum öncesi

- [ ] Domain A kaydı sunucu IP'sine yönlendirildi
- [ ] Git repo erişimi (SSH key veya token)
- [ ] Lokal geliştirme test edildi
- [ ] Migration'lar commit'lendi

### Kurulum sonrası

- [ ] `systemctl status lms-backend` → active
- [ ] `systemctl status lms-frontend` → active
- [ ] `curl -I https://app.sizinkurum.com` → 200
- [ ] Giriş yapılabiliyor
- [ ] Kurum / şube oluşturuldu
- [ ] Static dosyalar yükleniyor (`/static/`)
- [ ] Medya yükleme çalışıyor (`/media/`)
- [ ] Cron satırları eklendi
- [ ] İlk yedek alındı

---

## Sorun giderme

| Belirti | Olası neden | Çözüm |
|---------|-------------|--------|
| Backend başlamıyor | `WHATSAPP_APP_SECRET` boş | `/etc/lms/env` doldur |
| `ImproperlyConfigured` | Eksik env | `backend/.env.production.example` kontrol |
| migrate SSL hatası | `sslmode=require` + local PG | SSL aç veya sslmode ayarla |
| 502 Bad Gateway | Servis down | `journalctl -u lms-backend -f` |
| Giriş / CSRF hatası | HTTPS origin güvenilmiyor | `CSRF_TRUSTED_ORIGINS_EXTRA=https://...` |
| Static 404 | collectstatic / nginx | `collectstatic` + nginx `alias` |
| Frontend build OOM | Düşük RAM | swap ekle veya lokal build + rsync |
| API proxy hatası | Backend URL | `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000` |

**Log komutları:**

```bash
sudo journalctl -u lms-backend -f
sudo journalctl -u lms-frontend -f
tail -f /var/log/lms/backend-error.log
sudo tail -f /var/log/nginx/error.log
```

---

## Ortam özeti

| Ortam | `DJANGO_ENV` | DB | Deploy |
|-------|--------------|-----|--------|
| Lokal geliştirme | `development` | `lms_db` | — |
| Lokal demo | `demo` | `lms_demo_db` | — |
| Canlı | `production` | `lms_db` (sunucu) | `deploy-production.sh` |
| Test | `test` | `test_lms_db` | — |

---

## Repoda ilgili dosyalar

| Dosya | Açıklama |
|-------|----------|
| `backend/scripts/deploy-production.sh` | Güncelleme deploy script'i |
| `backend/scripts/run-demo.sh` | Lokal demo ortamı |
| `backend/.env.production.example` | Canlı env şablonu |
| `backend/.env.demo.example` | Demo env şablonu |
| `backend/config/settings/production.py` | Production Django ayarları |
| `frontend/app/api/[...path]/route.ts` | API proxy (Next → Django) |
