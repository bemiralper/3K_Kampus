"""Harici (masaüstü) yedek dosyasını sisteme içe aktarır."""
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from django.utils import timezone as dj_timezone

from apps.yedekleme.application.config import get_backup_config
from apps.yedekleme.application.providers.registry import get_encryption_provider, get_remote_storage_provider
from apps.yedekleme.application.services.archive_service import ArchiveService
from apps.yedekleme.application.services.manifest_service import ManifestService
from apps.yedekleme.domain.models import BackupArtifact, BackupStatus, BackupTrigger


class BackupImportService:
    """İndirilmiş .tar.gz yedeklerini BackupArtifact olarak kaydeder."""

    def __init__(self):
        self.manifest_service = ManifestService()
        self.archive_service = ArchiveService()

    def import_file(self, uploaded_file, *, user=None) -> BackupArtifact:
        filename = self._sanitize_filename(getattr(uploaded_file, 'name', '') or '')
        max_bytes = int(get_backup_config().get('upload_max_bytes', 2 * 1024 ** 3))
        size = int(getattr(uploaded_file, 'size', 0) or 0)
        if size <= 0:
            raise ValueError('Boş dosya yüklenemez.')
        if size > max_bytes:
            raise ValueError(
                f'Dosya çok büyük ({size} byte). '
                f'İzin verilen üst sınır: {max_bytes} byte.'
            )

        backup_id = str(uuid.uuid4())
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        storage_key = f'import_{ts}_{backup_id[:8]}/{filename}'
        work_dir = Path(tempfile.mkdtemp(prefix='3k-backup-import-'))
        started = dj_timezone.now()
        try:
            local_path = work_dir / filename
            with local_path.open('wb') as dest:
                for chunk in uploaded_file.chunks():
                    dest.write(chunk)

            extract_dir = work_dir / 'extracted'
            self._decrypt_and_extract(local_path, extract_dir)
            manifest = self.manifest_service.validate(extract_dir)

            checksum = self.archive_service._sha256(local_path)
            get_remote_storage_provider().store(str(local_path), storage_key)

            finished = dj_timezone.now()
            duration_ms = int((finished - started).total_seconds() * 1000)
            artifact = BackupArtifact.objects.create(
                filename=filename,
                storage_key=storage_key,
                size_bytes=local_path.stat().st_size,
                checksum=checksum,
                status=BackupStatus.COMPLETED,
                trigger=BackupTrigger.MANUAL,
                created_by=user,
                components={
                    'imported': True,
                    'manifest_backup_id': manifest.get('backup_id'),
                },
                finished_at=finished,
                duration_ms=duration_ms,
            )
            return artifact
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        base = Path(name).name.strip()
        if not base:
            raise ValueError('Geçersiz dosya adı.')
        if '..' in base or '/' in base or '\\' in base:
            raise ValueError('Geçersiz dosya adı.')
        lowered = base.lower()
        if lowered.endswith('.tar.gz.enc') or lowered.endswith('.tar.gz'):
            return base
        raise ValueError('Yalnızca .tar.gz veya .tar.gz.enc yedek dosyaları kabul edilir.')

    def _decrypt_and_extract(self, archive_path: Path, extract_dir: Path) -> None:
        if archive_path.suffix == '.enc' or str(archive_path).endswith('.tar.gz.enc'):
            decrypted = Path(str(archive_path)[:-4]) if str(archive_path).endswith('.enc') else archive_path.with_suffix('')
            get_encryption_provider().decrypt(str(archive_path), str(decrypted))
            self.archive_service.extract(decrypted, extract_dir)
        else:
            self.archive_service.extract(archive_path, extract_dir)
