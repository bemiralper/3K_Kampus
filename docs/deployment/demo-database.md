# Demo veritabanı (ayrı PostgreSQL)

Geliştirme ve demo testleri **canlı veritabanından ayrı** bir PostgreSQL DB üzerinde yapılır.
Kod ve migration'lar git ile canlıya alınır; **demo verisi canlıya kopyalanmaz**.

| Ortam | `DJANGO_ENV` | Varsayılan DB |
|-------|--------------|---------------|
| Geliştirme (gerçek veri) | `development` | `lms_db` |
| Demo / deneme | `demo` | `lms_demo_db` |
| Canlı | `production` | env `DB_NAME` |
| Test | `test` | `test_lms_db` |

## İlk kurulum

```bash
cd backend
sudo pg_ctlcluster 16 main start   # gerekirse

# Demo DB oluştur + migrate + demo verisi + admin
DJANGO_ENV=demo python manage.py setup_demo_database --seed --create-admin

# veya script ile
chmod +x scripts/run-demo.sh
./scripts/run-demo.sh --setup
```

Superuser ( `--create-admin` ile): `admin` / `admin123`

## Günlük kullanım

**Terminal 1 — demo backend:**
```bash
cd backend
DJANGO_ENV=demo python manage.py runserver 0.0.0.0:8000
# veya: ./scripts/run-demo.sh
```

**Terminal 2 — frontend:**
```bash
cd frontend
npm run dev
```

Ayarlar → **Demo Yönetimi** ekranından demo paketleri oluşturulabilir.
Bu işlemler yalnızca `DJANGO_ENV=demo` iken çalışır; canlı ortamda API 403 döner.

## Canlıya geçiş (workflow)

1. Demo DB'de özelliği geliştirin ve test edin.
2. Değişiklikleri commit / merge edin.
3. Canlı sunucuda deploy script'i çalıştırın (kod + migration; demo verisi taşınmaz):

   ```bash
   export LMS_APP_ROOT=/var/www/lms
   export LMS_BACKEND_SERVICE=lms-backend
   export LMS_FRONTEND_SERVICE=lms-frontend
   ./backend/scripts/deploy-production.sh
   ```

   Detay: [production-deploy.md](./production-deploy.md)

4. Demo verisini canlıya taşımayın. Canlı kurum/şube/finans tanımları canlı DB'de kalır.

## Demo DB'yi sıfırlama

```bash
# Yalnızca etiketli demo kayıtları (UI veya API)
# Ayarlar → Demo Yönetimi → Demo Temizle (PURGE-DEMO)

# Tüm operasyonel veri; kurum + finans tanımları korunur (demo DB'de)
DJANGO_ENV=demo python manage.py reset_app_data --preserve-finans-tanimlari --noinput

# DB'yi baştan kur
DJANGO_ENV=demo python manage.py setup_demo_database --recreate --seed --create-admin
```

## Ortam değişkenleri

Örnek: `backend/.env.demo.example`

```bash
export DJANGO_ENV=demo
export DB_NAME=lms_demo_db
```

`development` ortamında (`lms_db`) demo seed/purge **kapalıdır** — yanlışlıkla canlı veriye demo eklenmesin diye.
