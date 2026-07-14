import shutil
import os


def pg_dump_binary() -> str:
    path = os.environ.get('PG_DUMP') or shutil.which('pg_dump') or 'pg_dump'
    return path


def pg_restore_binary() -> str:
    path = os.environ.get('PG_RESTORE') or shutil.which('pg_restore') or 'pg_restore'
    return path


def pg_dumpall_binary() -> str:
    path = os.environ.get('PG_DUMPALL') or shutil.which('pg_dumpall') or 'pg_dumpall'
    return path


def pg_env(db: dict) -> dict:
    env = os.environ.copy()
    password = db.get('PASSWORD', '')
    if password:
        env['PGPASSWORD'] = password
    return env
