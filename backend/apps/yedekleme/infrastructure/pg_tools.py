import shutil
import os


def pg_dump_binary() -> str:
    return os.environ.get('PG_DUMP', 'pg_dump')


def pg_restore_binary() -> str:
    return os.environ.get('PG_RESTORE', 'pg_restore')


def pg_env(db: dict) -> dict:
    env = os.environ.copy()
    password = db.get('PASSWORD', '')
    if password:
        env['PGPASSWORD'] = password
    return env
