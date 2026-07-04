import shutil
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.utils import timezone as dj_timezone

from apps.yedekleme.application.providers.registry import get_encryption_provider, get_remote_storage_provider
from apps.yedekleme.application.services.archive_service import ArchiveService
from apps.yedekleme.application.services.database_backup import DatabaseBackupService
from apps.yedekleme.application.services.filesystem_backup import FilesystemBackupService
from apps.yedekleme.application.services.manifest_service import ManifestService
from apps.yedekleme.domain.models import BackupArtifact, BackupStatus, BackupTrigger
from apps.yedekleme.infrastructure.pg_tools import pg_env, pg_restore_binary


class BackupOrchestrator:
    def __init__(self):
        self.db_service = DatabaseBackupService()
        self.fs_service = FilesystemBackupService()
        self.manifest_service = ManifestService()
        self.archive_service = ArchiveService()

    def run(
        self,
        *,
        trigger: str = BackupTrigger.MANUAL,
        user=None,
        include_logs: bool = False,
    ) -> BackupArtifact:
        backup_id = str(uuid.uuid4())
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        filename = f'3k-backup_{ts}_{backup_id[:8]}.tar.gz'
        storage_key = f'{ts}_{backup_id[:8]}/{filename}'

        artifact = BackupArtifact.objects.create(
            filename=filename,
            storage_key=storage_key,
            status=BackupStatus.RUNNING,
            trigger=trigger,
            created_by=user,
            components={'include_logs': include_logs},
        )
        started = dj_timezone.now()
        work_dir = Path(tempfile.mkdtemp(prefix='3k-backup-'))
        try:
            db_path = work_dir / 'database.dump'
            db_info = self.db_service.dump(db_path)
            fs_info = self.fs_service.collect(work_dir / 'files')
            if include_logs:
                self._copy_logs(work_dir / 'logs')
            manifest = self.manifest_service.build(
                backup_id=backup_id,
                db_info=db_info,
                fs_info=fs_info,
                include_logs=include_logs,
            )
            self.manifest_service.write_manifest(work_dir, manifest)
            self.manifest_service.write_checksums(work_dir)

            staging_archive = work_dir / filename
            archive_meta = self.archive_service.create_archive(work_dir, staging_archive)

            encrypted_path = work_dir / f'{filename}.enc'
            get_encryption_provider().encrypt(str(staging_archive), str(encrypted_path))

            remote = get_remote_storage_provider()
            remote.store(str(encrypted_path if encrypted_path.exists() else staging_archive), storage_key)

            finished = dj_timezone.now()
            duration_ms = int((finished - started).total_seconds() * 1000)
            artifact.status = BackupStatus.COMPLETED
            artifact.size_bytes = archive_meta['size_bytes']
            artifact.checksum = archive_meta['checksum']
            artifact.components = {
                'database': db_info,
                'filesystem': fs_info,
                'include_logs': include_logs,
            }
            artifact.finished_at = finished
            artifact.duration_ms = duration_ms
            artifact.save()
            return artifact
        except Exception as exc:
            artifact.status = BackupStatus.FAILED
            artifact.error_message = str(exc)[:2000]
            artifact.finished_at = dj_timezone.now()
            artifact.save(update_fields=['status', 'error_message', 'finished_at'])
            raise
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    @staticmethod
    def _copy_logs(dest: Path) -> None:
        log_dir = getattr(settings, 'LOG_DIR', None)
        if not log_dir:
            return
        src = Path(log_dir)
        if src.exists():
            shutil.copytree(src, dest, dirs_exist_ok=True)


class RestoreService:
    CONFIRM_TOKEN = 'RESTORE'

    def __init__(self):
        self.manifest_service = ManifestService()
        self.archive_service = ArchiveService()

    def validate_only(self, artifact: BackupArtifact) -> dict:
        work_dir = Path(tempfile.mkdtemp(prefix='3k-restore-validate-'))
        try:
            archive_path = self._fetch_artifact(artifact, work_dir)
            extract_dir = work_dir / 'extracted'
            self._decrypt_and_extract(archive_path, extract_dir)
            manifest = self.manifest_service.validate(extract_dir)
            return {'valid': True, 'manifest': manifest}
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def restore(self, artifact: BackupArtifact, *, confirm: str) -> dict:
        if confirm != self.CONFIRM_TOKEN:
            raise ValueError(f'Onay metni "{self.CONFIRM_TOKEN}" olmalıdır')
        work_dir = Path(tempfile.mkdtemp(prefix='3k-restore-'))
        try:
            archive_path = self._fetch_artifact(artifact, work_dir)
            extract_dir = work_dir / 'extracted'
            self._decrypt_and_extract(archive_path, extract_dir)
            manifest = self.manifest_service.validate(extract_dir)
            self._restore_database(extract_dir / 'database.dump')
            self._restore_files(extract_dir / 'files')
            return {'restored': True, 'manifest': manifest}
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    def _fetch_artifact(self, artifact: BackupArtifact, work_dir: Path) -> Path:
        local = work_dir / artifact.filename
        get_remote_storage_provider().fetch(artifact.storage_key, str(local))
        return local

    def _decrypt_and_extract(self, archive_path: Path, extract_dir: Path) -> None:
        decrypted = archive_path.with_suffix('')
        if archive_path.suffix == '.enc' or str(archive_path).endswith('.tar.gz.enc'):
            get_encryption_provider().decrypt(str(archive_path), str(decrypted))
            self.archive_service.extract(decrypted, extract_dir)
        else:
            self.archive_service.extract(archive_path, extract_dir)

    def _restore_database(self, dump_path: Path) -> None:
        if not dump_path.exists():
            raise ValueError('database.dump bulunamadı')
        db = settings.DATABASES['default']
        env = pg_env(db)
        cmd = [
            pg_restore_binary(),
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '-h', db.get('HOST', 'localhost'),
            '-p', str(db.get('PORT', 5432)),
            '-U', db.get('USER', ''),
            '-d', db.get('NAME', ''),
            str(dump_path),
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, check=False)
        if result.returncode != 0 and 'warnings ignored' not in (result.stderr or '').lower():
            raise RuntimeError(result.stderr.strip() or 'pg_restore başarısız')

    def _restore_files(self, files_dir: Path) -> None:
        if not files_dir.exists():
            return
        from apps.yedekleme.application.config import file_roots
        roots = file_roots()
        for child in files_dir.iterdir():
            if not child.is_dir():
                continue
            matched = None
            for root in roots:
                if Path(root).name == child.name:
                    matched = Path(root)
                    break
            if matched is None and len(roots) == 1:
                matched = Path(roots[0])
            if matched is None:
                continue
            if matched.exists():
                shutil.rmtree(matched)
            shutil.copytree(child, matched)
