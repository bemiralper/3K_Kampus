import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

MANIFEST_VERSION = '1.0'


class ManifestService:
    def build(self, *, backup_id: str, db_info: dict, fs_info: dict, include_logs: bool) -> dict:
        return {
            'version': MANIFEST_VERSION,
            'backup_id': backup_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'platform': '3k-kampus-lms',
            'django_version': self._django_version(),
            'database': db_info,
            'filesystem': fs_info,
            'include_logs': include_logs,
            'settings_snapshot': {
                'debug': settings.DEBUG,
                'media_root': str(settings.MEDIA_ROOT),
                'allowed_hosts': list(getattr(settings, 'ALLOWED_HOSTS', [])),
            },
        }

    def write_manifest(self, work_dir: Path, manifest: dict) -> Path:
        path = work_dir / 'manifest.json'
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        return path

    def write_checksums(self, work_dir: Path) -> Path:
        checksums = {}
        for path in sorted(work_dir.rglob('*')):
            if path.is_file() and path.name != 'checksums.sha256':
                rel = path.relative_to(work_dir).as_posix()
                checksums[rel] = self._sha256(path)
        out = work_dir / 'checksums.sha256'
        lines = [f'{digest}  {rel}\n' for rel, digest in sorted(checksums.items())]
        out.write_text(''.join(lines), encoding='utf-8')
        return out

    def validate(self, work_dir: Path) -> dict:
        manifest_path = work_dir / 'manifest.json'
        if not manifest_path.exists():
            raise ValueError('manifest.json bulunamadı')
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest.get('version') != MANIFEST_VERSION:
            raise ValueError(f"Desteklenmeyen manifest sürümü: {manifest.get('version')}")
        checksums_path = work_dir / 'checksums.sha256'
        if not checksums_path.exists():
            raise ValueError('checksums.sha256 bulunamadı')
        errors = []
        for line in checksums_path.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            digest, rel = line.split('  ', 1)
            file_path = work_dir / rel
            if not file_path.exists():
                errors.append(f'Eksik dosya: {rel}')
                continue
            if self._sha256(file_path) != digest:
                errors.append(f'Bozuk dosya: {rel}')
        if errors:
            raise ValueError('; '.join(errors))
        return manifest

    @staticmethod
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open('rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _django_version() -> str:
        import django
        return django.get_version()
