# Canlıya alma — hızlı referans

Her kod değişikliğinden sonra bu sırayı izleyin.

---

## 1. Mac (local) — kodu GitHub’a gönder

```bash
cd ~/Documents/3k-kampus-lms-main-2   # repo yolu

# Değişiklikleri kontrol et
git status
git diff --stat

# Commit öncesi frontend build (beyaz sayfa önlemi)
cd frontend && npm run build && cd ..

# Commit + push
git add <dosyalar>                    # veya git add -p
git commit -m "Kisa aciklama"
git push origin main
```

PR kullanıyorsanız: branch push → GitHub’da merge → `main` güncellenir.

---

## 2. Sunucu — SSH + deploy

```bash
ssh root@49.13.30.211
# veya: ssh lms@49.13.30.211

cd /var/www/lms

export LMS_APP_ROOT=/var/www/lms
export LMS_BACKEND_SERVICE=lms-backend
export LMS_FRONTEND_SERVICE=lms-frontend

./backend/scripts/deploy-production.sh
```

Script otomatik yapar: `git pull` → migrate → collectstatic → `npm run build` → servis restart.

**Kod zaten çekildiyse** (tekrar pull istemiyorsanız):

```bash
./backend/scripts/deploy-production.sh --no-git
```

---

## 3. Eski deploy script (env hatası alırsanız)

`ALLOWED_HOSTS production ortamında zorunludur` görürseniz — repo henüz güncellenmediyse:

```bash
set -a && source /etc/lms/env && set +a
echo "ALLOWED_HOSTS=$ALLOWED_HOSTS"
./backend/scripts/deploy-production.sh --no-git
```

Güncel `deploy-production.sh` `/etc/lms/env` dosyasını kendisi yükler.

---

## 4. Deploy sonrası kontrol

1. https://app.3kkampus.com açılıyor mu (beyaz sayfa yok)
2. Giriş yapılabiliyor mu
3. Değiştirdiğiniz modül çalışıyor mu

**Beyaz sayfa / dönen spinner:** tarayıcı JS yükleyemiyordur. Sunucuda:

```bash
WEBPACK=$(basename /var/www/lms/frontend/.next/static/chunks/webpack-*.js)
curl -sI "http://127.0.0.1:3000/_next/static/chunks/$WEBPACK" | head -1
# HTTP/1.1 200 OK olmalı — 400 ise .next bozuk, temiz build:
cd /var/www/lms/frontend
sudo systemctl stop lms-frontend
sudo -u lms rm -rf .next
sudo -u lms npm run build
sudo chown -R lms:www-data .next node_modules
sudo systemctl start lms-frontend
```

Servis durumu:

```bash
systemctl status lms-backend lms-frontend --no-pager
journalctl -u lms-frontend -n 30 --no-pager
```

**Django yönetim komutları** (migrate dışında — örn. mali hesap onarımı):

```bash
cd /var/www/lms/backend          # önemli: backend dizininden çalıştırın
set -a && source /etc/lms/env && set +a
export DJANGO_ENV=production
PY=/var/www/lms/venv/bin/python

$PY manage.py fix_tum_mali_hesap_bakiyeleri --diagnose-only
$PY manage.py fix_tum_mali_hesap_bakiyeleri
```

`ModuleNotFoundError: No module named 'apps.kurum'` alırsanız komutu repo kökünden değil,
`cd /var/www/lms/backend` sonrası `manage.py` ile çalıştırın.

---

## 5. Sorun olursa geri al

Son deploy’u geri al (bir commit önce):

```bash
cd /var/www/lms
git log -3 --oneline
git checkout <onceki-commit-hash>
./backend/scripts/deploy-production.sh --no-git
```

Kalıcı geri alma: GitHub’da merge’i **Revert** → sunucuda tekrar `./backend/scripts/deploy-production.sh`.

---

## Bayraklar (deploy script)

| Bayrak | Ne zaman |
|--------|----------|
| `--no-git` | Kod zaten `git pull` ile alındı |
| `--no-frontend` | Sadece backend / migration |
| `--no-restart` | Servisleri yeniden başlatma |
| `--no-pip` | pip install atla |

---

## Tek blok (kopyala-yapıştır — sunucu)

```bash
cd /var/www/lms
export LMS_APP_ROOT=/var/www/lms
export LMS_BACKEND_SERVICE=lms-backend
export LMS_FRONTEND_SERVICE=lms-frontend
./backend/scripts/deploy-production.sh
```
