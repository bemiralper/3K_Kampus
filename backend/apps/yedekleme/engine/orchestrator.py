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
from apps.yedekleme.engine.plan import (
    entry_priority,
    filter_restore_entries,
    manifest_has_full_database,
    order_restore_entries,
)
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
        try:
            from apps.sistem_yonetimi.services.audit import write_audit, write_timeline
            write_audit(
                user=self.user,
                module='yedekleme',
                action=str(action),
                description=step or str(action),
                ip_address=self.ip_address,
                metadata={'success': success, **(metadata or {})},
            )
            if action in ('create', 'restore', 'purge') and step:
                write_timeline(
                    category='backup',
                    title=step,
                    detail=error_message or '',
                    level='success' if success else 'error',
                    metadata={'action': str(action)},
                )
        except Exception:
            pass

    def _preflight_disk_check(self) -> str | None:
        """Yedek hedefinde yeterli boş alan var mı? Yoksa açıklayıcı hata metni döndürür.

        Gereken alan ≈ veritabanı boyutu × 1.3 (tahmini) veya yapılandırılan minimum.
        Herhangi bir hata olursa (ör. disk_usage başarısız) kontrol atlanır (None).
        """
        try:
            from apps.yedekleme.engine.storage import local_root

            cfg = getattr(settings, 'BACKUP_CONFIG', {}) or {}
            min_free = int(cfg.get('min_free_bytes') or (256 * 1024 * 1024))

            required = min_free
            try:
                from django.db import connection as dj_conn
                with dj_conn.cursor() as cur:
                    cur.execute('SELECT pg_database_size(current_database())')
                    db_size = int(cur.fetchone()[0])
                required = max(min_free, int(db_size * 1.3))
            except Exception:  # noqa: BLE001
                pass

            root = local_root()
            usage = shutil.disk_usage(str(root))
            if usage.free < required:
                free_mb = usage.free // (1024 * 1024)
                req_mb = required // (1024 * 1024)
                return (
                    f'Yetersiz disk alanı: {free_mb} MB boş, ~{req_mb} MB gerekli. '
                    f'Yedekleme iptal edildi.'
                )
        except Exception:  # noqa: BLE001
            return None
        return None

    def _notify(self, *, event: str, success: bool, subject: str, body: str) -> None:
        """Opt-in bildirim (e-posta). BackupSettings ile kapalıysa hiçbir şey yapmaz.

        Tüm hatalar yutulur — bildirim, yedek/restore akışını asla bozmamalı.
        """
        try:
            from apps.yedekleme.domain.models import BackupSettings

            s = BackupSettings.get_singleton()
            if not s.notify_enabled:
                return
            if success and not s.notify_on_success:
                return
            if not success and not s.notify_on_failure:
                return
            recipients = [e.strip() for e in (s.notify_emails or '').replace(';', ',').split(',') if e.strip()]
            if not recipients:
                return
            from django.conf import settings as dj_settings
            from django.core.mail import send_mail

            from_email = getattr(dj_settings, 'DEFAULT_FROM_EMAIL', None) or 'no-reply@3kkampus'
            send_mail(subject, body, from_email, recipients, fail_silently=True)
        except Exception:  # noqa: BLE001
            pass

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

    def fail_stale_running_jobs(self, *, max_age_minutes: int | None = None) -> int:
        """RUNNING durumunda takılı kalan job/artifact kayıtlarını FAILED yapar."""
        from datetime import timedelta as _timedelta

        cfg = getattr(settings, 'BACKUP_CONFIG', {}) or {}
        minutes = max_age_minutes if max_age_minutes is not None else int(cfg.get('stale_job_minutes') or 30)
        cutoff = _now() - _timedelta(minutes=max(1, minutes))
        msg = f'Asılı kalan iş temizlendi (>{minutes} dk RUNNING)'

        jobs = BackupJob.objects.filter(status=BackupStatus.RUNNING, started_at__lt=cutoff)
        count = jobs.count()
        if count:
            jobs.update(
                status=BackupStatus.FAILED,
                phase=JobPhase.ERROR,
                progress=100,
                error_message=msg,
                finished_at=_now(),
                message='Zaman aşımı / süreç kesildi',
            )
        BackupArtifact.objects.filter(
            status=BackupStatus.RUNNING,
            started_at__lt=cutoff,
        ).update(
            status=BackupStatus.FAILED,
            error_message=msg,
            finished_at=_now(),
        )
        return count

    def cancel_job(self, job: BackupJob, *, reason: str = 'Manuel iptal') -> dict:
        """Takılı veya istenmeyen RUNNING işi iptal eder (artifact dahil)."""
        if job.status != BackupStatus.RUNNING:
            return {'cancelled': False, 'message': 'İş zaten bitmiş', 'job_id': job.id}

        now = _now()
        job.status = BackupStatus.CANCELLED
        job.phase = JobPhase.ERROR
        job.progress = 100
        job.error_message = reason
        job.message = 'İptal edildi'
        job.finished_at = now
        job.save(
            update_fields=['status', 'phase', 'progress', 'error_message', 'message', 'finished_at'],
        )
        if job.artifact_id:
            BackupArtifact.objects.filter(pk=job.artifact_id, status=BackupStatus.RUNNING).update(
                status=BackupStatus.FAILED,
                error_message=reason,
                finished_at=now,
            )
        self._log(
            action=BackupOperationAction.PURGE,
            artifact=job.artifact,
            job=job,
            step='İş iptal edildi',
            success=False,
            error_message=reason,
            metadata={'job_id': job.id},
        )
        return {'cancelled': True, 'job_id': job.id, 'message': reason}

    def create_restore_job(self, artifact: BackupArtifact) -> BackupJob:
        self.fail_stale_running_jobs()
        return BackupJob.objects.create(
            artifact=artifact,
            action=BackupOperationAction.RESTORE,
            status=BackupStatus.RUNNING,
            phase=JobPhase.RESTORING,
            progress=2,
            message='Geri yükleme kuyruğa alındı',
            created_by=self.user,
        )

    def create_backup(
        self,
        *,
        kind: str = BackupKind.FULL,
        resource_codes: list[str] | None = None,
        trigger: str = BackupTrigger.MANUAL,
        encrypt: bool | None = None,
        compress: bool = True,
        tenant: dict | None = None,
    ) -> tuple[BackupArtifact, BackupJob]:
        # M7: Eşzamanlılık sınırı — aynı anda tek bir create işi. Stale (asılı
        # kalmış) işleri engellemesin diye yalnızca yakın zamanlı RUNNING işler
        # bloklar; eskiler fail_stale_running_jobs ile FAILED işaretlenir.
        cfg = getattr(settings, 'BACKUP_CONFIG', {}) or {}
        max_age_hours = int(cfg.get('max_job_age_hours') or 3)
        from datetime import timedelta as _timedelta
        cutoff = _now() - _timedelta(hours=max_age_hours)
        if trigger != BackupTrigger.PRE_RESTORE:
            self.fail_stale_running_jobs()
            if BackupJob.objects.filter(
                action=BackupOperationAction.CREATE,
                status=BackupStatus.RUNNING,
                started_at__gte=cutoff,
            ).exists():
                raise RuntimeError('Zaten devam eden bir yedekleme işi var. Lütfen tamamlanmasını bekleyin.')

        tenant = {k: v for k, v in (tenant or {}).items() if v is not None} or None
        if tenant:
            # Kurum/şube kapsamlı yedek yalnızca tablo-seviye export ile mümkün
            # (pg_dump tenant'a göre filtrelenemez). Full dump / dosya kaynakları hariç.
            from apps.yedekleme.domain.models import BackupResource, ResourceType

            q = BackupResource.objects.filter(is_active=True, resource_type=ResourceType.DATABASE_TABLE)
            if resource_codes:
                q = q.filter(code__in=resource_codes)
            resources = list(q.order_by('priority', 'code'))
            if not resources:
                raise ValueError('Kurum kapsamlı yedek için tablo (database_table) kaynağı bulunamadı')
            for r in resources:
                r.config = {**(r.config or {}), '__tenant__': tenant}
        else:
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

        # M4: Yedek başlamadan disk alanı ön-kontrolü (doomed backup'ı erkenden durdur).
        disk_error = self._preflight_disk_check()
        if disk_error:
            artifact.status = BackupStatus.FAILED
            artifact.error_message = disk_error
            artifact.finished_at = _now()
            artifact.save()
            self._update_job(job, phase=JobPhase.ERROR, progress=100, status=BackupStatus.FAILED, error=disk_error)
            self._log(action=BackupOperationAction.CREATE, artifact=artifact, job=job, step='Hata (disk)', success=False, error_message=disk_error)
            raise RuntimeError(disk_error)

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
                    'priority': resource.priority,
                    'config': dict(resource.config or {}),
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
                'encrypted': bool(do_encrypt),
                'key_fingerprint': enc.key_fingerprint() if do_encrypt else None,
                'tenant': tenant,
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
            self._notify(
                event='create',
                success=True,
                subject=f'[3K Yedekleme] Başarılı: {final_name}',
                body=f'Yedek tamamlandı.\nDosya: {final_name}\nBoyut: {size} byte\nTür: {kind}\nSüre: {duration} ms',
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
            self._notify(
                event='create',
                success=False,
                subject=f'[3K Yedekleme] BAŞARISIZ: {filename}',
                body=f'Yedekleme başarısız oldu.\nTür: {kind}\nHata: {exc}',
            )
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
            if out_dir is not None:
                shutil.rmtree(out_dir, ignore_errors=True)

    def _assert_encryption_key(self, fingerprint: str | None) -> None:
        if not fingerprint:
            return
        if not enc.encryption_key_available():
            raise enc.EncryptionError('Şifreli yedek için BACKUP_ENCRYPTION_KEY gerekli')
        current = enc.key_fingerprint()
        if current and fingerprint != current:
            raise enc.EncryptionError(
                f'Şifreleme anahtarı uyuşmuyor (yedek={fingerprint}, sunucu={current})'
            )

    def _extract_artifact(self, artifact: BackupArtifact, work: Path) -> Path:
        src = fetch_file(artifact.storage_key)
        archive = work / 'archive.bin'
        shutil.copy2(src, archive)
        zip_path = work / 'backup.zip'
        is_enc = artifact.encrypted or str(artifact.filename).endswith('.enc')
        if is_enc:
            self._assert_encryption_key((artifact.manifest or {}).get('key_fingerprint'))
            if not enc.encryption_key_available():
                raise enc.EncryptionError('Şifreli yedek için BACKUP_ENCRYPTION_KEY gerekli')
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
        # Manifest içindeki fingerprint (eski yedeklerde artifact.manifest boş olabilir)
        manifest_path = extract_dir / 'manifest.json'
        if manifest_path.exists() and is_enc:
            try:
                m = json.loads(manifest_path.read_text(encoding='utf-8'))
                self._assert_encryption_key(m.get('key_fingerprint'))
            except enc.EncryptionError:
                raise
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
            full_db = manifest_has_full_database(manifest)
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
                # Tam dump varken tablo dry-run yanıltıcı (gerçek restore atlar)
                if full_db and entry.get('handler') == 'database_table':
                    reports.append({
                        'resource_code': code,
                        'notes': ['Tam dump varken tablo restore atlanır'],
                        'skipped': True,
                    })
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

            result = {
                'summary': agg,
                'resources': reports,
                'side_effects': False,
                'full_database_present': full_db,
            }
            self._update_job(job, phase=JobPhase.DONE, progress=100, status=BackupStatus.COMPLETED, result=result, message='Dry-run tamam')
            self._log(action=BackupOperationAction.DRY_RUN, artifact=artifact, job=job, step='Dry-run', metadata=agg)
            return result
        except Exception as exc:  # noqa: BLE001
            self._update_job(job, phase=JobPhase.ERROR, status=BackupStatus.FAILED, error=str(exc), progress=100)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def restore(self, artifact: BackupArtifact, *, confirm: str, job: BackupJob | None = None) -> dict:
        if confirm != 'RESTORE':
            raise ValueError('confirm alanı "RESTORE" olmalıdır')

        from apps.yedekleme.domain.models import BackupResource

        work = Path(tempfile.mkdtemp(prefix='backup_restore_'))
        if job is None:
            job = self.create_restore_job(artifact)
        else:
            self._update_job(job, message='Geri yükleme başlatılıyor', progress=5)
        started = _now()
        full_db_restored = False
        try:
            self._update_job(job, message='Yedek arşivi açılıyor', progress=10)
            extract_dir = self._extract_artifact(artifact, work)
            self._update_job(job, message='Checksum doğrulanıyor', progress=14)
            ok, errors = verify_checksums(extract_dir)
            if not ok:
                raise RuntimeError('Bozuk yedek: ' + '; '.join(errors[:5]))
            manifest = json.loads((extract_dir / 'manifest.json').read_text(encoding='utf-8'))
            payload = extract_dir / 'payload'

            def _fallback_priority(entry: dict) -> int:
                resource = BackupResource.objects.filter(code=entry.get('code')).first()
                return resource.priority if resource else 100

            sorted_entries = sorted(
                manifest.get('resources') or [],
                key=lambda e: entry_priority(e, _fallback_priority),
            )
            entries, skipped_tables = filter_restore_entries(sorted_entries)
            entries = order_restore_entries(entries)
            full_db_restored = manifest_has_full_database(manifest)

            # C4: Tam DB restore yıkıcıdır (pg_restore --clean). Restore'a başlamadan
            # önce mevcut veritabanının otomatik güvenlik yedeğini al → rollback imkânı.
            safety_backup = None
            if full_db_restored:
                self._update_job(job, message='Güvenlik yedeği alınıyor (restore öncesi)', progress=8)
                try:
                    safety_engine = BackupEngine(user=self.user, ip_address=self.ip_address)
                    safety_art, _safety_job = safety_engine.create_backup(
                        kind=BackupKind.DATABASE,
                        trigger=BackupTrigger.PRE_RESTORE,
                        encrypt=False,
                        compress=True,
                    )
                    safety_backup = {
                        'artifact_id': safety_art.id,
                        'filename': safety_art.filename,
                        'size_bytes': safety_art.size_bytes,
                    }
                    self._log(
                        action=BackupOperationAction.RESTORE,
                        artifact=artifact,
                        job=job,
                        step='Restore öncesi güvenlik yedeği alındı',
                        metadata=safety_backup,
                    )
                    self._update_job(job, message='Güvenlik yedeği alındı, geri yükleme başlıyor', progress=22)
                except Exception as exc:  # noqa: BLE001
                    # Güvenlik yedeği alınamıyorsa yıkıcı restore'a BAŞLAMA.
                    msg = f'Restore öncesi güvenlik yedeği alınamadı, işlem iptal edildi: {exc}'
                    self._update_job(job, phase=JobPhase.ERROR, status=BackupStatus.FAILED, error=msg, progress=100)
                    self._log(
                        action=BackupOperationAction.RESTORE,
                        artifact=artifact,
                        job=job,
                        step='Hata (güvenlik yedeği)',
                        success=False,
                        error_message=msg,
                    )
                    raise RuntimeError(msg) from exc

            results = []
            for skipped in skipped_tables:
                results.append({
                    'code': skipped.get('code'),
                    'ok': True,
                    'message': 'atlandı (tam dump varken tablo restore gereksiz/yıkıcı)',
                    'skipped': True,
                })

            for entry in entries:
                code = entry['code']
                handler_key = entry.get('handler')
                resource = BackupResource.objects.filter(code=code).first()
                if resource:
                    handler_key = resource.handler_key or handler_key
                    is_restorable = resource.is_restorable
                    target = resource
                else:
                    if not handler_key:
                        results.append({'code': code, 'ok': False, 'message': 'registryde yok'})
                        continue
                    is_restorable = bool(entry.get('restorable', True))

                    class _ManifestResource:
                        pass

                    target = _ManifestResource()
                    target.code = code
                    target.handler_key = handler_key
                    target.is_restorable = is_restorable
                    target.config = dict(entry.get('config') or {})

                if not is_restorable:
                    results.append({'code': code, 'ok': True, 'message': 'atlandı (restorable=false)'})
                    continue
                if not full_db_restored:
                    self._update_job(
                        job,
                        message=f'Geri yükleniyor: {code}',
                        progress=min(95, 10 + len(results) * 5),
                    )
                if handler_key == 'database_full':
                    self._update_job(job, message='Tam veritabanı geri yükleniyor (pg_restore)', progress=55)
                handler = get_handler(handler_key)
                res = handler.restore(target, payload / code.replace('/', '_'), dry_run=False)
                results.append({'code': code, 'ok': res.ok, 'message': res.message, 'meta': res.meta})
                if not res.ok:
                    raise RuntimeError(f'{code}: {res.message}')
                if handler_key == 'database_full':
                    full_db_restored = True
                    # pg_restore (handler) bağlantıları kapatmış olabilir; yenile.
                    from django.db import connection as dj_conn
                    dj_conn.ensure_connection()

            duration = int((_now() - started).total_seconds() * 1000)
            result = {
                'restored': True,
                'job_id': job.id,
                'results': results,
                'duration_ms': duration,
                'full_database_restored': full_db_restored,
                'skipped_table_resources': [s.get('code') for s in skipped_tables],
                'relogin_required': full_db_restored,
                'safety_backup': safety_backup,
            }
            try:
                self._update_job(
                    job,
                    phase=JobPhase.DONE,
                    progress=100,
                    status=BackupStatus.COMPLETED,
                    result=result,
                    message='Geri yükleme tamam',
                )
            except Exception:
                pass
            if not full_db_restored:
                self._log(
                    action=BackupOperationAction.RESTORE,
                    artifact=artifact,
                    job=job,
                    step='Başarılı',
                    duration_ms=duration,
                    metadata=result,
                )
            self._notify(
                event='restore',
                success=True,
                subject=f'[3K Yedekleme] Geri yükleme tamamlandı: {artifact.filename}',
                body=(
                    f'Geri yükleme tamamlandı.\nYedek: {artifact.filename}\n'
                    f'Tam veritabanı: {"evet" if full_db_restored else "hayır"}\nSüre: {duration} ms'
                ),
            )
            return result
        except Exception as exc:  # noqa: BLE001
            if not full_db_restored:
                try:
                    self._update_job(
                        job,
                        phase=JobPhase.ERROR,
                        status=BackupStatus.FAILED,
                        error=str(exc),
                        progress=100,
                    )
                    self._log(
                        action=BackupOperationAction.RESTORE,
                        artifact=artifact,
                        job=job,
                        step='Hata',
                        success=False,
                        error_message=str(exc),
                    )
                except Exception:
                    pass
            self._notify(
                event='restore',
                success=False,
                subject=f'[3K Yedekleme] Geri yükleme BAŞARISIZ: {artifact.filename}',
                body=f'Geri yükleme başarısız.\nYedek: {artifact.filename}\nHata: {exc}',
            )
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
                if not enc.encryption_key_available():
                    delete_file(storage_key)
                    raise enc.EncryptionError('Şifreli yedek için BACKUP_ENCRYPTION_KEY gerekli')
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
            # Manifest encrypted bayrağı veya fingerprint varsa doğrula
            manifest_encrypted = bool(manifest.get('encrypted')) or encrypted
            if manifest_encrypted:
                try:
                    self._assert_encryption_key(manifest.get('key_fingerprint'))
                except enc.EncryptionError:
                    delete_file(storage_key)
                    raise
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
                encrypted=manifest_encrypted,
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
        from apps.yedekleme.domain.models import BackupSchedule

        schedule = BackupSchedule.get_singleton()
        try:
            artifact, job = self.create_backup(
                kind=schedule.kind or BackupKind.FULL,
                resource_codes=schedule.resource_codes or None,
                trigger=schedule.effective_trigger(),
                encrypt=bool(schedule.encrypt),
            )
        except Exception as exc:  # noqa: BLE001
            schedule.record_run(status=BackupStatus.FAILED, message=str(exc)[:512])
            raise
        schedule.record_run(
            artifact=artifact,
            status=job.status,
            message=job.error_message or job.message or artifact.filename,
        )
        # Retention: zamanlı yedek sonrası eski yedekleri otomatik temizle.
        try:
            from apps.yedekleme.engine.retention import RetentionService
            RetentionService().purge()
        except Exception:  # noqa: BLE001
            pass
        return artifact, job
