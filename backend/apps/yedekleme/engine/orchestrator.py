"""Backup / restore orchestrator — modül bilmez, yalnızca Resource Registry okur."""

from __future__ import annotations

import json
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import django
from django.conf import settings
from django.utils import timezone as dj_tz

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupJob,
    BackupKind,
    BackupOperationAction,
    BackupOperationLog,
    BackupStatus,
    BackupTrigger,
    JobPhase,
)
from apps.yedekleme.engine import encryption as enc
from apps.yedekleme.engine.archive import create_zip, extract_zip, sha256_file, verify_checksums, write_checksums
from apps.yedekleme.engine.handlers import get_handler
from apps.yedekleme.engine.handlers.base import DryRunReport, JobLog, RestoreAnalysis
from apps.yedekleme.engine.selection import resolve_resources
from apps.yedekleme.engine.storage import delete_file, fetch_file, store_file


MANIFEST_VERSION = '2.0'


def _now():
    return dj_tz.now()


class BackupEngine:
    def __init__(self, user=None, ip_address=None):
        self.user = user
        self.ip_address = ip_address

    def _log(self, *, action, artifact=None, job=None, step='', success=True, error_message='', metadata=None, duration_ms=None):
        BackupOperationLog.objects.create(
            user=self.user,
            ip_address=self.ip_address,
            action=action,
            artifact=artifact,
            job=job,
            step=step,
            success=success,
            error_message=error_message or '',
            metadata=metadata or {},
            duration_ms=duration_ms,
        )

    def _update_job(self, job: BackupJob, *, phase=None, progress=None, message=None, status=None, result=None, error=None):
        if phase is not None:
            job.phase = phase
        if progress is not None:
            job.progress = progress
        if message is not None:
            job.message = message
        if status is not None:
            job.status = status
        if result is not None:
            job.result = result
        if error is not None:
            job.error_message = error
        if status in (BackupStatus.COMPLETED, BackupStatus.FAILED, BackupStatus.CANCELLED):
            job.finished_at = _now()
        job.save()

    def create_backup(
        self,
        *,
        kind: str = BackupKind.FULL,
        resource_codes: list[str] | None = None,
        trigger: str = BackupTrigger.MANUAL,
        encrypt: bool | None = None,
        compress: bool = True,
    ) -> tuple[BackupArtifact, BackupJob]:
        resources = resolve_resources(kind, resource_codes)
        codes = [r.code for r in resources]

        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        uid = uuid.uuid4().hex[:8]
        filename = f'3k-backup_{ts}_{uid}.zip'
        storage_key = f'{ts}_{uid}/{filename}'

        artifact = BackupArtifact.objects.create(
            filename=filename,
            storage_key=storage_key,
            status=BackupStatus.RUNNING,
            kind=kind,
            trigger=trigger,
            resource_codes=codes,
            created_by=self.user,
            format_version=MANIFEST_VERSION,
        )
        job = BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.CREATE,
            status=BackupStatus.RUNNING,
            phase=JobPhase.PREPARING,
            progress=5,
            message='Yedek başlıyor',
            created_by=self.user,
        )
        self._log(action=BackupOperationAction.CREATE, artifact=artifact, job=job, step='Yedek başladı', metadata={'kind': kind, 'resources': codes})

        do_encrypt = bool(encrypt) if encrypt is not None else False
        if do_encrypt and not enc.encryption_key_available():
            artifact.status = BackupStatus.FAILED
            artifact.error_message = 'Şifreleme istendi ancak BACKUP_ENCRYPTION_KEY yok'
            artifact.finished_at = _now()
            artifact.save()
            self._update_job(job, phase=JobPhase.ERROR, progress=100, status=BackupStatus.FAILED, error=artifact.error_message)
            raise RuntimeError(artifact.error_message)

        work = Path(tempfile.mkdtemp(prefix='backup_work_'))
        out_dir = None
        started = _now()
        try:
            payload_root = work / 'payload'
            payload_root.mkdir(parents=True)
            resource_manifest = []
            total = len(resources) or 1

            def write_fn(**kwargs):
                self._log(
                    action=BackupOperationAction.CREATE,
                    artifact=artifact,
                    job=job,
                    step=kwargs.get('step', ''),
                    success=kwargs.get('success', True),
                    error_message=kwargs.get('error_message', ''),
                    metadata=kwargs.get('metadata') or {},
                )

            log = JobLog(write_fn)

            for idx, resource in enumerate(resources):
                self._update_job(
                    job,
                    phase=JobPhase.EXPORTING,
                    progress=10 + int(70 * idx / total),
                    message=f'Kaynak dışa aktarılıyor: {resource.code}',
                )
                log.info('Tablolar/dosyalar okunuyor', resource=resource.code)
                handler = get_handler(resource.handler_key)
                rdir = payload_root / resource.code.replace('/', '_')
                result = handler.export(resource, rdir, log)
                resource_manifest.append({
                    'code': resource.code,
                    'name': resource.name,
                    'type': resource.resource_type,
                    'handler': resource.handler_key,
                    'encrypt_flag': resource.encrypt,
                    'compress_flag': resource.compress,
                    'restorable': resource.is_restorable,
                    'files': result.files,
                    'meta': result.meta,
                    'bytes': result.bytes_written,
                })

            self._update_job(job, phase=JobPhase.COMPRESSING, progress=82, message='ZIP oluşturuluyor')
            log.info('Dosyalar sıkıştırılıyor')

            manifest = {
                'version': MANIFEST_VERSION,
                'backup_id': uid,
                'kind': kind,
                'created_at': started.isoformat(),
                'django_version': django.get_version(),
                'resources': resource_manifest,
                'encrypted': False,
                'key_fingerprint': enc.key_fingerprint() if do_encrypt else None,
            }
            (work / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')

            # checksums for payload + manifest
            files_for_hash = [work / 'manifest.json']
            for p in payload_root.rglob('*'):
                if p.is_file():
                    files_for_hash.append(p)
            write_checksums(work, files_for_hash)
            log.info('SHA oluşturuldu')

            out_dir = Path(tempfile.mkdtemp(prefix='backup_out_'))
            zip_path = out_dir / filename
            create_zip(work, zip_path, compress=compress)
            log.info('ZIP oluşturuldu', path=str(zip_path))

            final_path = zip_path
            final_name = filename
            final_key = storage_key
            if do_encrypt:
                self._update_job(job, phase=JobPhase.ENCRYPTING, progress=90, message='AES-256 şifreleme')
                enc_name = filename + '.enc'
                enc_path = out_dir / enc_name
                enc.encrypt_file(zip_path, enc_path)
                final_path = enc_path
                final_name = enc_name
                final_key = f'{ts}_{uid}/{enc_name}'
                artifact.encrypted = True
                log.info('Şifreleme tamamlandı')

            self._update_job(job, phase=JobPhase.HASHING, progress=94, message='SHA-256 hesaplanıyor')
            checksum = sha256_file(final_path)
            size = final_path.stat().st_size

            self._update_job(job, phase=JobPhase.STORING, progress=97, message='Depolamaya yazılıyor')
            store_file(final_path, final_key)

            finished = _now()
            duration = int((finished - started).total_seconds() * 1000)
            artifact.filename = final_name
            artifact.storage_key = final_key
            artifact.size_bytes = size
            artifact.checksum = checksum
            artifact.status = BackupStatus.COMPLETED
            artifact.manifest = manifest
            artifact.finished_at = finished
            artifact.duration_ms = duration
            artifact.save()

            self._update_job(
                job,
                phase=JobPhase.DONE,
                progress=100,
                status=BackupStatus.COMPLETED,
                message='Başarılı',
                result={'checksum': checksum, 'size_bytes': size},
            )
            self._log(
                action=BackupOperationAction.CREATE,
                artifact=artifact,
                job=job,
                step='Başarılı',
                duration_ms=duration,
                metadata={'checksum': checksum, 'size_bytes': size},
            )
            return artifact, job
        except Exception as exc:  # noqa: BLE001
            artifact.status = BackupStatus.FAILED
            artifact.error_message = str(exc)
            artifact.finished_at = _now()
            artifact.save()
            self._update_job(
                job,
                phase=JobPhase.ERROR,
                progress=100,
                status=BackupStatus.FAILED,
                message='Hata',
                error=str(exc),
            )
            self._log(
                action=BackupOperationAction.CREATE,
                artifact=artifact,
                job=job,
                step='Hata',
                success=False,
                error_message=str(exc),
            )
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
            if out_dir is not None:
                shutil.rmtree(out_dir, ignore_errors=True)

    def _extract_artifact(self, artifact: BackupArtifact, work: Path) -> Path:
        src = fetch_file(artifact.storage_key)
        archive = work / 'archive.bin'
        shutil.copy2(src, archive)
        zip_path = work / 'backup.zip'
        if artifact.encrypted or str(artifact.filename).endswith('.enc'):
            enc.decrypt_file(archive, zip_path)
        else:
            zip_path = archive if archive.suffix == '.zip' else zip_path
            if zip_path != archive:
                shutil.copy2(archive, zip_path)
        extract_dir = work / 'extracted'
        extract_zip(zip_path if zip_path.suffix == '.zip' else archive, extract_dir)
        # If we copied raw zip as archive.bin, try extract that
        if not (extract_dir / 'manifest.json').exists():
            try:
                extract_zip(archive, extract_dir)
            except Exception:
                pass
        return extract_dir

    def verify(self, artifact: BackupArtifact) -> dict:
        work = Path(tempfile.mkdtemp(prefix='backup_verify_'))
        job = BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.VERIFY,
            status=BackupStatus.RUNNING,
            phase=JobPhase.ANALYZING,
            progress=10,
            created_by=self.user,
        )
        try:
            # Outer file checksum
            src = fetch_file(artifact.storage_key)
            actual = sha256_file(src)
            outer_ok = (not artifact.checksum) or actual == artifact.checksum
            extract_dir = self._extract_artifact(artifact, work)
            manifest_path = extract_dir / 'manifest.json'
            if not manifest_path.exists():
                raise RuntimeError('manifest.json bulunamadı — bozuk veya uyumsuz yedek (v2 gerekli)')
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if str(manifest.get('version')) != MANIFEST_VERSION:
                raise RuntimeError(f'Desteklenmeyen format: {manifest.get("version")} (beklenen {MANIFEST_VERSION})')
            ok, errors = verify_checksums(extract_dir)
            result = {
                'valid': outer_ok and ok,
                'outer_checksum_ok': outer_ok,
                'payload_checksum_ok': ok,
                'errors': errors if not ok else [],
                'manifest': manifest,
            }
            self._update_job(job, phase=JobPhase.DONE, progress=100, status=BackupStatus.COMPLETED, result=result, message='Doğrulama tamam')
            self._log(action=BackupOperationAction.VERIFY, artifact=artifact, job=job, step='Doğrulama', metadata=result, success=result['valid'])
            return result
        except Exception as exc:  # noqa: BLE001
            self._update_job(job, phase=JobPhase.ERROR, progress=100, status=BackupStatus.FAILED, error=str(exc))
            self._log(action=BackupOperationAction.VERIFY, artifact=artifact, job=job, step='Hata', success=False, error_message=str(exc))
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def preview(self, artifact: BackupArtifact) -> dict:
        work = Path(tempfile.mkdtemp(prefix='backup_preview_'))
        try:
            extract_dir = self._extract_artifact(artifact, work)
            manifest = json.loads((extract_dir / 'manifest.json').read_text(encoding='utf-8'))
            self._log(action=BackupOperationAction.PREVIEW, artifact=artifact, step='Önizleme', metadata={'resources': len(manifest.get('resources') or [])})
            return {
                'artifact_id': artifact.id,
                'filename': artifact.filename,
                'kind': artifact.kind,
                'size_bytes': artifact.size_bytes,
                'checksum': artifact.checksum,
                'encrypted': artifact.encrypted,
                'manifest': manifest,
            }
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def analyze(self, artifact: BackupArtifact) -> dict:
        from apps.yedekleme.domain.models import BackupResource

        work = Path(tempfile.mkdtemp(prefix='backup_analyze_'))
        job = BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.ANALYZE,
            status=BackupStatus.RUNNING,
            phase=JobPhase.ANALYZING,
            created_by=self.user,
        )
        try:
            extract_dir = self._extract_artifact(artifact, work)
            manifest = json.loads((extract_dir / 'manifest.json').read_text(encoding='utf-8'))
            analyses: list[dict] = []
            total_eta = 0.0
            missing_all = []
            incompat_all = []
            conflicts_all = []
            payload = extract_dir / 'payload'
            for entry in manifest.get('resources') or []:
                code = entry['code']
                try:
                    resource = BackupResource.objects.get(code=code)
                except BackupResource.DoesNotExist:
                    analyses.append({'resource_code': code, 'present': False, 'missing_files': ['registry'], 'incompatibilities': ['Kaynak registryde yok']})
                    missing_all.append(code)
                    continue
                handler = get_handler(resource.handler_key)
                rdir = payload / code.replace('/', '_')
                analysis: RestoreAnalysis = handler.analyze_restore(resource, rdir)
                analyses.append(analysis.__dict__)
                total_eta += analysis.estimated_seconds
                missing_all.extend(analysis.missing_files)
                incompat_all.extend(analysis.incompatibilities)
                conflicts_all.extend(analysis.conflicts)

            result = {
                'artifact_id': artifact.id,
                'resources': analyses,
                'estimated_seconds': round(total_eta, 1),
                'size_bytes': artifact.size_bytes,
                'missing_files': missing_all,
                'incompatibilities': incompat_all,
                'conflicts': conflicts_all,
                'manifest': manifest,
            }
            self._update_job(job, phase=JobPhase.DONE, progress=100, status=BackupStatus.COMPLETED, result=result)
            self._log(action=BackupOperationAction.ANALYZE, artifact=artifact, job=job, step='Analiz', metadata={'eta': total_eta})
            return result
        except Exception as exc:  # noqa: BLE001
            self._update_job(job, phase=JobPhase.ERROR, status=BackupStatus.FAILED, error=str(exc), progress=100)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def dry_run(self, artifact: BackupArtifact) -> dict:
        from apps.yedekleme.domain.models import BackupResource

        work = Path(tempfile.mkdtemp(prefix='backup_dry_'))
        job = BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.DRY_RUN,
            status=BackupStatus.RUNNING,
            phase=JobPhase.DRY_RUN,
            created_by=self.user,
        )
        try:
            extract_dir = self._extract_artifact(artifact, work)
            manifest = json.loads((extract_dir / 'manifest.json').read_text(encoding='utf-8'))
            payload = extract_dir / 'payload'
            reports = []
            agg = {
                'tables_changed': [],
                'rows_to_delete': 0,
                'rows_to_insert': 0,
                'rows_to_update': 0,
                'files_to_add': 0,
                'files_to_replace': 0,
                'files_to_delete': 0,
            }
            for entry in manifest.get('resources') or []:
                code = entry['code']
                resource = BackupResource.objects.filter(code=code).first()
                if not resource or not resource.is_restorable:
                    continue
                handler = get_handler(resource.handler_key)
                report: DryRunReport = handler.dry_run(resource, payload / code.replace('/', '_'))
                reports.append(report.__dict__)
                agg['tables_changed'].extend(report.tables_changed)
                agg['rows_to_delete'] += report.rows_to_delete
                agg['rows_to_insert'] += report.rows_to_insert
                agg['rows_to_update'] += report.rows_to_update
                agg['files_to_add'] += report.files_to_add
                agg['files_to_replace'] += report.files_to_replace
                agg['files_to_delete'] += report.files_to_delete

            result = {'summary': agg, 'resources': reports, 'side_effects': False}
            self._update_job(job, phase=JobPhase.DONE, progress=100, status=BackupStatus.COMPLETED, result=result, message='Dry-run tamam')
            self._log(action=BackupOperationAction.DRY_RUN, artifact=artifact, job=job, step='Dry-run', metadata=agg)
            return result
        except Exception as exc:  # noqa: BLE001
            self._update_job(job, phase=JobPhase.ERROR, status=BackupStatus.FAILED, error=str(exc), progress=100)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def restore(self, artifact: BackupArtifact, *, confirm: str) -> dict:
        if confirm != 'RESTORE':
            raise ValueError('confirm alanı "RESTORE" olmalıdır')

        from apps.yedekleme.domain.models import BackupResource

        work = Path(tempfile.mkdtemp(prefix='backup_restore_'))
        job = BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.RESTORE,
            status=BackupStatus.RUNNING,
            phase=JobPhase.RESTORING,
            created_by=self.user,
        )
        started = _now()
        try:
            extract_dir = self._extract_artifact(artifact, work)
            ok, errors = verify_checksums(extract_dir)
            if not ok:
                raise RuntimeError('Bozuk yedek: ' + '; '.join(errors[:5]))
            manifest = json.loads((extract_dir / 'manifest.json').read_text(encoding='utf-8'))
            payload = extract_dir / 'payload'
            entries = sorted(
                manifest.get('resources') or [],
                key=lambda e: next(
                    (r.priority for r in BackupResource.objects.filter(code=e['code'])),
                    100,
                ),
            )
            results = []
            for entry in entries:
                code = entry['code']
                resource = BackupResource.objects.filter(code=code).first()
                if not resource:
                    results.append({'code': code, 'ok': False, 'message': 'registryde yok'})
                    continue
                if not resource.is_restorable:
                    results.append({'code': code, 'ok': True, 'message': 'atlandı (restorable=false)'})
                    continue
                self._update_job(job, message=f'Geri yükleniyor: {code}', progress=min(95, 10 + len(results) * 5))
                handler = get_handler(resource.handler_key)
                res = handler.restore(resource, payload / code.replace('/', '_'), dry_run=False)
                results.append({'code': code, 'ok': res.ok, 'message': res.message, 'meta': res.meta})
                if not res.ok:
                    raise RuntimeError(f'{code}: {res.message}')

            duration = int((_now() - started).total_seconds() * 1000)
            result = {'restored': True, 'results': results, 'duration_ms': duration}
            self._update_job(job, phase=JobPhase.DONE, progress=100, status=BackupStatus.COMPLETED, result=result, message='Geri yükleme tamam')
            self._log(action=BackupOperationAction.RESTORE, artifact=artifact, job=job, step='Başarılı', duration_ms=duration, metadata=result)
            return result
        except Exception as exc:  # noqa: BLE001
            self._update_job(job, phase=JobPhase.ERROR, status=BackupStatus.FAILED, error=str(exc), progress=100)
            self._log(action=BackupOperationAction.RESTORE, artifact=artifact, job=job, step='Hata', success=False, error_message=str(exc))
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def delete_artifact(self, artifact: BackupArtifact) -> None:
        delete_file(artifact.storage_key)
        aid = artifact.id
        artifact.delete()
        self._log(action=BackupOperationAction.DELETE, step='Silindi', metadata={'artifact_id': aid})

    def import_backup_file(self, src_path: Path, *, original_filename: str) -> tuple[BackupArtifact, dict]:
        """İndirilmiş .zip / .zip.enc dosyasını sisteme kaydeder (manifest v2 doğrular)."""
        name = original_filename or src_path.name
        encrypted = name.endswith('.enc') or False
        ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        uid = uuid.uuid4().hex[:8]
        storage_key = f'import_{ts}_{uid}/{name}'

        work = Path(tempfile.mkdtemp(prefix='backup_import_'))
        try:
            stored = store_file(src_path, storage_key)
            checksum = sha256_file(stored)
            size = stored.stat().st_size

            # Validate format
            extract_dir = work / 'extracted'
            archive = work / 'incoming.bin'
            shutil.copy2(stored, archive)
            zip_path = work / 'backup.zip'
            if encrypted:
                enc.decrypt_file(archive, zip_path)
            else:
                shutil.copy2(archive, zip_path)
            extract_zip(zip_path, extract_dir)
            manifest_path = extract_dir / 'manifest.json'
            if not manifest_path.exists():
                delete_file(storage_key)
                raise RuntimeError('manifest.json yok — yalnızca yedekleme v2 (.zip) desteklenir')
            manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            if str(manifest.get('version')) != MANIFEST_VERSION:
                delete_file(storage_key)
                raise RuntimeError(
                    f'Desteklenmeyen format: {manifest.get("version")} (beklenen {MANIFEST_VERSION})'
                )
            ok, errors = verify_checksums(extract_dir)
            if not ok:
                delete_file(storage_key)
                raise RuntimeError('Bozuk yedek: ' + '; '.join(errors[:5]))

            artifact = BackupArtifact.objects.create(
                filename=name,
                storage_key=storage_key,
                size_bytes=size,
                checksum=checksum,
                status=BackupStatus.COMPLETED,
                kind=manifest.get('kind') or BackupKind.FULL,
                trigger=BackupTrigger.MANUAL,
                resource_codes=[r.get('code') for r in (manifest.get('resources') or []) if r.get('code')],
                manifest=manifest,
                encrypted=encrypted,
                format_version=MANIFEST_VERSION,
                created_by=self.user,
                finished_at=_now(),
                duration_ms=0,
            )
            info = {
                'valid': True,
                'resources': len(manifest.get('resources') or []),
                'kind': artifact.kind,
            }
            self._log(
                action=BackupOperationAction.IMPORT,
                artifact=artifact,
                step='İçe aktarıldı',
                metadata=info,
            )
            return artifact, info
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def run_scheduled_now(self) -> tuple[BackupArtifact, BackupJob]:
        """UI / API'den zamanlanmış yedeği hemen çalıştırır."""
        from apps.yedekleme.domain.models import BackupSchedule, ScheduleFrequency

        schedule = BackupSchedule.get_singleton()
        trigger_map = {
            ScheduleFrequency.DAILY: BackupTrigger.DAILY,
            ScheduleFrequency.WEEKLY: BackupTrigger.WEEKLY,
            ScheduleFrequency.MONTHLY: BackupTrigger.MONTHLY,
        }
        trigger = trigger_map.get(schedule.frequency, BackupTrigger.MANUAL)
        artifact, job = self.create_backup(
            kind=schedule.kind or BackupKind.FULL,
            resource_codes=schedule.resource_codes or None,
            trigger=trigger if schedule.enabled and schedule.frequency != ScheduleFrequency.OFF else BackupTrigger.MANUAL,
            encrypt=bool(schedule.encrypt),
        )
        schedule.last_run_at = _now()
        schedule.save(update_fields=['last_run_at'])
        return artifact, job
