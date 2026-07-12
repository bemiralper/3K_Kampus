"""PostgreSQL status helpers."""

from __future__ import annotations

from django.db import connection


def postgres_status() -> dict:
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT version()')
            version = cur.fetchone()[0]
            cur.execute('SELECT count(*) FROM pg_stat_activity')
            connections = int(cur.fetchone()[0])
            cur.execute("SELECT pg_database_size(current_database())")
            db_size = int(cur.fetchone()[0])
        return {
            'status': 'up',
            'message': 'Bağlantı başarılı',
            'version': version,
            'connections': connections,
            'database_size_bytes': db_size,
            'vendor': connection.vendor,
        }
    except Exception as exc:  # noqa: BLE001
        return {
            'status': 'down',
            'message': str(exc),
            'connections': 0,
            'database_size_bytes': 0,
        }
