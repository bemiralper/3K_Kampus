# Docker ile çalıştırma

Native kurulum (venv, Homebrew PostgreSQL, systemd) **değişmeden** kalır. Docker dosyaları repoya eklenmiştir; isteğe bağlı kullanılır.

| Ortam | Dosya | Env |
|-------|-------|-----|
| Geliştirme | [`docker-compose.dev.yml`](../../docker-compose.dev.yml) | `.env.docker` |
| Canlı | [`docker-compose.prod.yml`](../../docker-compose.prod.yml) | `.env.production.docker` |

Detaylı rehber: bu dosya.

---

## Development (Mac / local)

### Önkoşul

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) kurulu
- Port **3000**, **8000**, **5433** boş (native dev çalışıyorsa durdurun)

### İlk kurulum

```bash
cd /path/to/3k-kampus-lms-main-2
cp .env.docker.example .env.docker
./scripts/docker-dev.sh
```

Veya:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.docker up --build
```

- Uygulama: http://localhost:3000
- Backend (doğrudan): http://localhost:8000
- PostgreSQL (host): `localhost:5433` (Mac Homebrew PG ile çakışmaz)

Admin:

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py createsuperuser
```

### Demo profile (opsiyonel)

```bash
docker compose -f docker-compose.dev.yml exec backend env DJANGO_ENV=demo python manage.py setup_demo_database --seed --create-admin
```

### Celery (opsiyonel)

```bash
docker compose -f docker-compose.dev.yml --profile workers up --build
```

### PDF raporları (Playwright)

Gelir/Gider, Cari ve Gün Sonu PDF dışa aktarma **Chromium** gerektirir. Backend image build sırasında
`playwright install chromium` otomatik çalışır (`docker/backend/Dockerfile`).

Image yeniden build:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.docker build --no-cache backend
```

Eski image kullanıyorsanız container içinde:

```bash
docker compose -f docker-compose.dev.yml exec backend python -m playwright install chromium
docker compose -f docker-compose.dev.yml exec backend python -m playwright install-deps chromium
```

Native (Docker dışı) kurulum:

```bash
./backend/scripts/install-playwright.sh
```

---

## Production (Docker)

**Önerilen:** PostgreSQL host'ta kalsın (`DB_HOST=host.docker.internal`). Registry gerekmez — sunucuda build.

### İlk kurulum

```bash
cp .env.production.docker.example .env.production.docker
# SECRET_KEY, DB_*, WHATSAPP_APP_SECRET, ALLOWED_HOSTS doldurun

./scripts/docker-prod-deploy.sh
```

HTTP: `http://SUNUCU:8080` (varsayılan; host nginx ile çakışmaması için). Cutover sonrası `LMS_DOCKER_HTTP_PORT=80` veya host nginx → container proxy.

### PostgreSQL container içinde (alternatif)

```bash
# .env.production.docker içinde DB_HOST=db
docker compose -f docker-compose.prod.yml --env-file .env.production.docker --profile bundled-db up -d --build
```

---

## Native vs Docker

| | Native (mevcut) | Docker dev |
|--|-----------------|------------|
| PG | Homebrew `:5432` | Container `:5433` |
| Backend | `backend/venv` | Container |
| Frontend | `npm run dev` | Container |
| Veri | `lms_db` (Mac) | Ayrı volume — **senkron değil** |

Canlı Hetzner systemd deploy: [`production-deploy.md`](./production-deploy.md) — Docker prod'a geçene kadar aynen kullanılır.

---

## Sık komutlar

```bash
# Dev log
docker compose -f docker-compose.dev.yml logs -f backend frontend

# Dev durdur (veri kalır)
docker compose -f docker-compose.dev.yml down

# Dev DB sıfırla
docker compose -f docker-compose.dev.yml down -v

# Backend test (container içinde)
docker compose -f docker-compose.dev.yml exec backend env DJANGO_ENV=test python manage.py test apps/finans/tests
```

---

## Bilinen kısıtlar

- **Playwright/PDF** — dev image'da Chromium yok; PDF export container'da çalışmayabilir.
- **Port çakışması** — Docker ve native aynı anda 3000/8000 kullanamaz.
- **Production WHATSAPP_APP_SECRET** — boş bırakılırsa backend başlamaz (`production.py`).
