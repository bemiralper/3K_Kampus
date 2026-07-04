import subprocess
from pathlib import Path

from django.conf import settings

from apps.yedekleme.infrastructure.pg_tools import pg_env, pg_dump_binary


class DatabaseBackupService:
    def dump(self, dest_path: Path) -> dict:
        db = settings.DATABASES['default']
        env = pg_env(db)
        cmd = [
            pg_dump_binary(),
            '-Fc',
            '--no-owner',
            '--no-acl',
            '-h', db.get('HOST', 'localhost'),
            '-p', str(db.get('PORT', 5432)),
            '-U', db.get('USER', ''),
            '-d', db.get('NAME', ''),
            '-f', str(dest_path),
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or 'pg_dump başarısız')
        return {
            'engine': db.get('ENGINE', ''),
            'name': db.get('NAME', ''),
            'format': 'custom',
            'size_bytes': dest_path.stat().st_size,
        }
