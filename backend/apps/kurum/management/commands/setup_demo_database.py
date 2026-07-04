"""
Demo PostgreSQL veritabanını oluşturur, migrate eder ve isteğe bağlı demo verisi yükler.

  DJANGO_ENV=demo python manage.py setup_demo_database
  DJANGO_ENV=demo python manage.py setup_demo_database --seed --preset=full
  DJANGO_ENV=demo python manage.py setup_demo_database --recreate
"""
from __future__ import annotations

import psycopg
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


def _db_conn_params(db_name: str | None = None) -> dict:
    db = settings.DATABASES['default']
    return {
        'dbname': db_name or db['NAME'],
        'user': db['USER'],
        'password': db['PASSWORD'] or None,
        'host': db['HOST'],
        'port': db['PORT'],
    }


def ensure_database(db_name: str, recreate: bool = False) -> None:
    admin_db = 'postgres'
    params = _db_conn_params(admin_db)
    with psycopg.connect(**params, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (db_name,))
            exists = cur.fetchone() is not None
            if exists and recreate:
                cur.execute(
                    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()',
                    (db_name,),
                )
                cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
                exists = False
            if not exists:
                cur.execute(f'CREATE DATABASE "{db_name}"')


class Command(BaseCommand):
    help = 'Demo veritabanını (lms_demo_db) oluşturur, migrate eder, isteğe bağlı demo verisi yükler.'

    def add_arguments(self, parser):
        parser.add_argument('--recreate', action='store_true', help='Mevcut demo DB varsa sil ve yeniden oluştur')
        parser.add_argument('--seed', action='store_true', help='Migrate sonrası demo verisi yükle')
        parser.add_argument('--preset', default='full', choices=['full', 'dashboard', 'students'])
        parser.add_argument('--create-admin', action='store_true', help='admin / admin123 superuser oluştur')

    def handle(self, *args, **options):
        if settings.LMS_ENVIRONMENT != 'demo' and not settings.DEMO_DATABASE_ALLOWED:
            raise CommandError(
                'Bu komut DJANGO_ENV=demo ile çalıştırılmalıdır. '
                'Canlı DB üzerinde demo kurulumu engellendi.'
            )

        db_name = settings.DATABASES['default']['NAME']
        self.stdout.write(f'Demo veritabanı: {db_name}')

        ensure_database(db_name, recreate=options['recreate'])
        self.stdout.write(self.style.SUCCESS(f'Veritabanı hazır: {db_name}'))

        call_command('migrate', interactive=False, verbosity=1)
        call_command('setup_roles', verbosity=0)

        if options['create_admin']:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            if not User.objects.filter(username='admin').exists():
                User.objects.create_superuser('admin', 'admin@3kkampus.local', 'admin123')
                self.stdout.write(self.style.SUCCESS('Superuser: admin / admin123'))

        if options['seed']:
            call_command('seed_demo_dashboard', preset=options['preset'], verbosity=1)
            self.stdout.write(self.style.SUCCESS(f'Demo verisi yüklendi (preset={options["preset"]})'))

        self.stdout.write(self.style.SUCCESS(
            f'Tamamlandı. Backend: DJANGO_ENV=demo python manage.py runserver 0.0.0.0:8000'
        ))
