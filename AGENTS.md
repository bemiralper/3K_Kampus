# AGENTS.md

## Cursor Cloud specific instructions

This repo is a multi-tenant LMS ("3K Kampüs LMS"): a **Django 4.2 + PostgreSQL** backend
and a **Next.js 14 (App Router)** frontend.

### Which backend is the real one
There are two Django entrypoints in the tree. Only one is current:
- **Use `backend/` with `config.settings`** (run via `backend/manage.py`). This is the full,
  frontend-integrated backend (URLs in `backend/config/urls.py`: `/auth/`, `/api/coaching/`,
  `/api/ogrenci-kayit/`, `kurum-yonetimi/api/`, etc.). `config.settings` defaults to
  `config.settings.development` via `DJANGO_ENV` (`development`/`demo`/`test`/`production`).
- The root `manage.py` + `core/settings.py` is **legacy** and does not load as-is; ignore it.

### Services & how to run them (dev mode)
- **PostgreSQL** must be running first. It is not auto-started on a fresh boot:
  `sudo pg_ctlcluster 16 main start`
  DB config (from `config/settings/development.py`): db `lms_db`, user `taner` (no password),
  host `localhost:5432`. Local TCP auth is set to `trust` in `pg_hba.conf`. Tests use `test_lms_db`.
- **Demo database** (separate from live data): `DJANGO_ENV=demo`, default DB `lms_demo_db`.
  Setup: `cd backend && DJANGO_ENV=demo python manage.py setup_demo_database --seed --create-admin`
  Run: `DJANGO_ENV=demo python manage.py runserver 0.0.0.0:8000` or `./scripts/run-demo.sh`.
  Demo seed/purge API is blocked unless `DEMO_DATABASE_ALLOWED=True` (demo env only).
  See [docs/deployment/demo-database.md](docs/deployment/demo-database.md).
- **Production deploy:** `./backend/scripts/deploy-production.sh` — git pull, migrate, collectstatic, frontend build, service restart. See [docs/deployment/production-deploy.md](docs/deployment/production-deploy.md).
- **Backend** (port 8000), from `backend/`:
  `python manage.py migrate` then `python manage.py runserver 0.0.0.0:8000`
- **Frontend** (port 3000), from `frontend/`: `npm run dev`
  The frontend proxies API calls same-origin via `app/api/[...path]/route.ts` to `http://localhost:8000`.

### Non-obvious gotchas
- **Browser login over http:** `development.py` uses `SESSION_COOKIE_SAMESITE='Lax'` and
  `CSRF_COOKIE_SAMESITE='Lax'` so cookies work on plain `http://localhost`. Do not set
  `SameSite=None` without `Secure=True` — Chrome rejects those cookies and breaks login/session.
- **Running Django tests:** the `apps` package under `backend/apps/` is a namespace package
  (no `__init__.py`), which breaks dotted test labels. Use the **filesystem-path form**, e.g.
  `DJANGO_ENV=test python manage.py test apps/finans/tests` (NOT `apps.finans.tests`).
  Do NOT add `backend/apps/__init__.py` — it changes import resolution.
- **`apps.rapor` stub:** `config/settings/base.py` lists `apps.rapor` in `INSTALLED_APPS`, but the
  module does not ship in the repo (reporting actually lives in `apps.finans`). A minimal empty app
  package exists at `backend/apps/rapor/` so the backend can boot; leave it in place.
- **Missing dependency:** `python-dateutil` is imported (e.g. `apps.takvim`) but was absent from
  the original `requirements.txt`; it is now listed there and in the startup update script.

### Lint / test / build commands
- Backend tests: `cd backend && DJANGO_ENV=test python manage.py test apps/finans/tests` (37 tests).
- Frontend lint: `cd frontend && npm run lint` (note: a pre-existing config error about an
  undefined `@typescript-eslint/no-var-requires` rule causes a non-zero exit; this is not an env issue).
- Frontend build: `cd frontend && npm run build`; dev: `npm run dev`.

### Hello-world sanity check (no browser needed)
Create an institution through the running backend and confirm it persists:
`curl -X POST localhost:8000/kurum-yonetimi/api/kurum/ -H 'Content-Type: application/json' -d '{"ad":"Demo","kod":"DEMO"}'`
then `curl localhost:8000/api/legacy/index/` should report an increased `total_kurumlar`.

### WhatsApp / İletişim cron (Faz 4–5)

Background workers are management commands by default; optional Celery + Redis when `CELERY_BROKER_URL` is set.

| Command | Purpose | Suggested cron |
|---------|---------|----------------|
| `python manage.py process_communication_queue` | Sends queued WhatsApp/SMS outbound messages | Every 1 min |
| `python manage.py send_payment_reminders` | Enqueues overdue/upcoming taksit reminders (`--days-ahead=3`, `--dry-run`) | Daily 09:00 |

Run from `backend/` with appropriate `DJANGO_ENV`. Module hooks (görüşme, ödev, sınav, devamsızlık) enqueue only; delivery requires `process_communication_queue` (cron) or Celery worker.

**Celery (optional):** Set `CELERY_BROKER_URL` + `CELERY_RESULT_BACKEND` (Redis). Start `celery -A config worker -l info`. Campaign confirm and manual payment reminders dispatch `communication.process_outbound_queue` async. Without Redis/Celery, cron fallback above is sufficient.

**Production setup:** See [docs/deployment/server-setup-plan.md](docs/deployment/server-setup-plan.md) — ilk sunucu kurulum planı; [docs/deployment/production-deploy.md](docs/deployment/production-deploy.md) — güncelleme deploy script'i.

**Local dev (incoming messages):** See [docs/deployment/whatsapp-local-dev.md](docs/deployment/whatsapp-local-dev.md) — ngrok tunnel to `backend:8000`, Meta webhook callback.
