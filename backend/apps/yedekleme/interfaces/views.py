"""Yedekleme API — Resource Registry + Backup Engine."""

from __future__ import annotations

import json
import threading

from django.conf import settings
from django.db.models import Q, Sum
from django.http import FileResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupJob,
    BackupKind,
    BackupOperationAction,
    BackupOperationLog,
    BackupResource,
    BackupSchedule,
    BackupSettings,
    BackupStatus,
    JobPhase,
    ResourceType,
    ScheduleFrequency,
)
from apps.yedekleme.engine import BackupEngine, RetentionService
from apps.yedekleme.engine import encryption as enc
from apps.yedekleme.engine.storage import fetch_file, local_root
from apps.yedekleme.registry import sync_registered_resources
from shared.permissions import api_permission_required


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _restore_worker(*, artifact_id: int, job_id: int, user_id: int | None, ip_address: str | None, confirm: str) -> None:
    """Uzun süren restore işini HTTP yanıtından bağımsız çalıştırır."""
    import logging

    from django.contrib.auth import get_user_model
    from django.db import connection

    logger = logging.getLogger(__name__)
    connection.close()
    try:
        User = get_user_model()
        user = User.objects.filter(pk=user_id).first() if user_id else None
        artifact = BackupArtifact.objects.get(pk=artifact_id)
        job = BackupJob.objects.get(pk=job_id)
        BackupEngine(user=user, ip_address=ip_address).restore(artifact, confirm=confirm, job=job)
        logger.info('restore_worker.done artifact_id=%s job_id=%s', artifact_id, job_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception('restore_worker.failed artifact_id=%s job_id=%s: %s', artifact_id, job_id, exc)
        try:
            connection.close()
            job = BackupJob.objects.filter(pk=job_id).first()
            if job and job.status == BackupStatus.RUNNING:
                job.status = BackupStatus.FAILED
                job.phase = JobPhase.ERROR
                job.progress = 100
                job.error_message = str(exc)[:2000]
                job.message = 'Geri yükleme başarısız'
                job.save(update_fields=['status', 'phase', 'progress', 'error_message', 'message'])
        except Exception:  # noqa: BLE001
            logger.exception('restore_worker.status_update_failed job_id=%s', job_id)
    finally:
        connection.close()


def _engine(request) -> BackupEngine:
    return BackupEngine(user=request.user if request.user.is_authenticated else None, ip_address=_client_ip(request))


def _body(request) -> dict:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode('utf-8'))
    except json.JSONDecodeError:
        return {}


def _get_artifact_or_error(artifact_id):
    """Artifact'ı getirir; yoksa (None, 404 JsonResponse) döner (get-or-404 tekrarını önler)."""
    art = BackupArtifact.objects.filter(pk=artifact_id).first()
    if art is None:
        return None, JsonResponse({'error': 'Yedek bulunamadı'}, status=404)
    return art, None


def _artifact_json(art: BackupArtifact) -> dict:
    created_by_name = None
    if art.created_by_id and art.created_by is not None:
        full = ''
        if hasattr(art.created_by, 'get_full_name'):
            full = (art.created_by.get_full_name() or '').strip()
        created_by_name = full or getattr(art.created_by, 'username', None)

    return {
        'id': art.id,
        'filename': art.filename,
        'storage_key': art.storage_key,
        'size_bytes': art.size_bytes,
        'checksum': art.checksum,
        'status': art.status,
        'kind': art.kind,
        'trigger': art.trigger,
        'resource_codes': art.resource_codes or [],
        'encrypted': art.encrypted,
        'format_version': art.format_version,
        'manifest': art.manifest or {},
        'started_at': art.started_at.isoformat() if art.started_at else None,
        'finished_at': art.finished_at.isoformat() if art.finished_at else None,
        'duration_ms': art.duration_ms,
        'created_by': art.created_by_id,
        'created_by_name': created_by_name,
        'error_message': art.error_message,
    }


def _resource_json(r: BackupResource) -> dict:
    return {
        'id': r.id,
        'code': r.code,
        'name': r.name,
        'resource_type': r.resource_type,
        'description': r.description,
        'handler_key': r.handler_key,
        'config': r.config or {},
        'is_active': r.is_active,
        'is_default': r.is_default,
        'encrypt': r.encrypt,
        'compress': r.compress,
        'priority': r.priority,
        'is_restorable': r.is_restorable,
        'source_app': r.source_app,
        'is_system': r.is_system,
        'updated_at': r.updated_at.isoformat() if r.updated_at else None,
    }


def _job_json(job: BackupJob) -> dict:
    return {
        'id': job.id,
        'artifact_id': job.artifact_id,
        'action': job.action,
        'status': job.status,
        'phase': job.phase,
        'progress': job.progress,
        'message': job.message,
        'result': job.result or {},
        'error_message': job.error_message,
        'started_at': job.started_at.isoformat() if job.started_at else None,
        'finished_at': job.finished_at.isoformat() if job.finished_at else None,
    }


def _schedule_json(schedule: BackupSchedule) -> dict:
    art = schedule.last_run_artifact
    return {
        'frequency': schedule.frequency,
        'hour': schedule.hour,
        'minute': schedule.minute,
        'enabled': schedule.enabled and schedule.frequency != ScheduleFrequency.OFF,
        'kind': schedule.kind,
        'resource_codes': schedule.resource_codes or [],
        'max_artifacts': schedule.max_artifacts,
        'auto_delete_old': schedule.auto_delete_old,
        'encrypt': schedule.encrypt,
        'last_run_at': schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        'last_run_status': schedule.last_run_status or None,
        'last_run_message': schedule.last_run_message or None,
        'last_run_artifact': _artifact_json(art) if art else None,
    }


def _ensure_registry():
    if not BackupResource.objects.exists():
        sync_registered_resources()


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def dashboard_view(request):
    _ensure_registry()
    try:
        BackupEngine().fail_stale_running_jobs(max_age_minutes=15)
    except Exception:
        pass
    latest = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).first()
    schedule = BackupSchedule.get_singleton()
    agg = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).aggregate(total=Sum('size_bytes'))
    last_ok = BackupOperationLog.objects.filter(success=True).first()
    last_err = BackupOperationLog.objects.filter(success=False).first()
    active_jobs = BackupJob.objects.filter(status=BackupStatus.RUNNING).order_by('-started_at')[:8]
    return JsonResponse({
        'latest_backup': _artifact_json(latest) if latest else None,
        'total_backups': BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).count(),
        'total_size_bytes': agg['total'] or 0,
        'active_jobs': [_job_json(j) for j in active_jobs],
        'schedule': _schedule_json(schedule),
        'last_success': {
            'action': last_ok.action if last_ok else None,
            'step': last_ok.step if last_ok else None,
            'created_at': last_ok.created_at.isoformat() if last_ok else None,
        },
        'last_error': {
            'action': last_err.action if last_err else None,
            'step': last_err.step if last_err else None,
            'error_message': last_err.error_message if last_err else None,
            'created_at': last_err.created_at.isoformat() if last_err else None,
        },
        'resources': {
            'total': BackupResource.objects.count(),
            'active': BackupResource.objects.filter(is_active=True).count(),
        },
        'config': {
            'local_root': str(local_root()),
            'encryption_key_available': enc.encryption_key_available(),
            'key_fingerprint': enc.key_fingerprint(),
            'format_version': '2.0',
        },
    })


@require_http_methods(['GET', 'POST'])
@api_permission_required('yedekleme.read', 'yedekleme.manage', write_codes=['yedekleme.manage'])
def resources_view(request):
    _ensure_registry()
    if request.method == 'GET':
        qs = BackupResource.objects.all()
        q = (request.GET.get('q') or '').strip()
        rtype = (request.GET.get('type') or '').strip()
        active = request.GET.get('active')
        if q:
            qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q) | Q(description__icontains=q))
        if rtype:
            qs = qs.filter(resource_type=rtype)
        if active in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        elif active in ('0', 'false', 'False'):
            qs = qs.filter(is_active=False)
        ordering = request.GET.get('ordering') or 'priority'
        allowed = {'priority', '-priority', 'code', '-code', 'name', '-name', 'resource_type', '-resource_type'}
        if ordering in allowed:
            qs = qs.order_by(ordering, 'code')
        try:
            page = max(1, int(request.GET.get('page') or 1))
            page_size = min(200, max(1, int(request.GET.get('page_size') or 50)))
        except ValueError:
            page, page_size = 1, 50
        total = qs.count()
        start = (page - 1) * page_size
        items = [_resource_json(r) for r in qs[start:start + page_size]]
        return JsonResponse({
            'results': items,
            'count': total,
            'page': page,
            'page_size': page_size,
            'resource_types': [{'value': c.value, 'label': c.label} for c in ResourceType],
        })

    data = _body(request)
    code = (data.get('code') or '').strip()
    name = (data.get('name') or '').strip()
    if not code or not name:
        return JsonResponse({'error': 'code ve name zorunlu'}, status=400)
    if BackupResource.objects.filter(code=code).exists():
        return JsonResponse({'error': 'Bu kod zaten kayıtlı'}, status=400)
    r = BackupResource.objects.create(
        code=code,
        name=name,
        resource_type=data.get('resource_type') or ResourceType.OTHER,
        description=data.get('description') or '',
        handler_key=data.get('handler_key') or 'other',
        config=data.get('config') or {},
        is_active=bool(data.get('is_active', True)),
        is_default=bool(data.get('is_default', False)),
        encrypt=bool(data.get('encrypt', False)),
        compress=bool(data.get('compress', True)),
        priority=int(data.get('priority') or 100),
        is_restorable=bool(data.get('is_restorable', True)),
        source_app=data.get('source_app') or 'manual',
        is_system=False,
    )
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.RESOURCE_UPDATE,
        step='Kaynak oluşturuldu',
        metadata={'code': r.code},
    )
    return JsonResponse({'resource': _resource_json(r)}, status=201)


@require_http_methods(['PATCH', 'POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def resource_detail_view(request, resource_id: int):
    try:
        r = BackupResource.objects.get(pk=resource_id)
    except BackupResource.DoesNotExist:
        return JsonResponse({'error': 'Kaynak bulunamadı'}, status=404)

    if request.path.rstrip('/').endswith('deactivate'):
        r.is_active = False
        r.save(update_fields=['is_active', 'updated_at'])
        return JsonResponse({'resource': _resource_json(r)})

    data = _body(request)
    for field in ('name', 'description', 'handler_key'):
        if field in data:
            setattr(r, field, data[field])
    if 'resource_type' in data:
        r.resource_type = data['resource_type']
    if 'config' in data and isinstance(data['config'], dict):
        r.config = data['config']
    for flag in ('is_active', 'is_default', 'encrypt', 'compress', 'is_restorable'):
        if flag in data:
            setattr(r, flag, bool(data[flag]))
    if 'priority' in data:
        r.priority = int(data['priority'])
    r.save()
    return JsonResponse({'resource': _resource_json(r)})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def resource_deactivate_view(request, resource_id: int):
    try:
        r = BackupResource.objects.get(pk=resource_id)
    except BackupResource.DoesNotExist:
        return JsonResponse({'error': 'Kaynak bulunamadı'}, status=404)
    r.is_active = False
    r.save(update_fields=['is_active', 'updated_at'])
    return JsonResponse({'resource': _resource_json(r)})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def resources_sync_view(request):
    result = sync_registered_resources(deactivate_missing=bool(_body(request).get('deactivate_missing')))
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.RESOURCE_SYNC,
        step='Kaynak sync',
        metadata=result,
    )
    return JsonResponse(result)


@require_http_methods(['GET', 'POST'])
@api_permission_required('yedekleme.read', 'yedekleme.manage', write_codes=['yedekleme.create', 'yedekleme.manage'])
def backups_view(request):
    if request.method == 'GET':
        qs = BackupArtifact.objects.all()
        kind = request.GET.get('kind')
        status = request.GET.get('status')
        q = (request.GET.get('q') or '').strip()
        if kind:
            qs = qs.filter(kind=kind)
        if status:
            qs = qs.filter(status=status)
        if q:
            qs = qs.filter(Q(filename__icontains=q) | Q(checksum__icontains=q))
        try:
            page = max(1, int(request.GET.get('page') or 1))
            page_size = min(100, max(1, int(request.GET.get('page_size') or 25)))
        except ValueError:
            page, page_size = 1, 25
        total = qs.count()
        start = (page - 1) * page_size
        items = [_artifact_json(a) for a in qs[start:start + page_size]]
        return JsonResponse({'results': items, 'count': total, 'page': page, 'page_size': page_size})

    _ensure_registry()
    data = _body(request)
    kind = data.get('kind') or BackupKind.FULL
    if kind not in {c.value for c in BackupKind}:
        return JsonResponse({'error': 'Geçersiz kind'}, status=400)

    # Opsiyonel kurum/şube/eğitim-yılı kapsamı (multi-tenant yedek).
    tenant = None
    raw_tenant = data.get('tenant') if isinstance(data.get('tenant'), dict) else {
        'kurum_id': data.get('kurum_id'),
        'sube_id': data.get('sube_id'),
        'egitim_yili_id': data.get('egitim_yili_id'),
    }
    tenant = {}
    for key in ('kurum_id', 'sube_id', 'egitim_yili_id'):
        val = raw_tenant.get(key)
        if val in (None, '', 0):
            continue
        try:
            tenant[key] = int(val)
        except (TypeError, ValueError):
            return JsonResponse({'error': f'Geçersiz {key}'}, status=400)
    tenant = tenant or None

    try:
        artifact, job = _engine(request).create_backup(
            kind=kind,
            resource_codes=data.get('resource_codes'),
            encrypt=data.get('encrypt'),
            compress=bool(data.get('compress', True)),
            tenant=tenant,
        )
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)
    return JsonResponse({'artifact': _artifact_json(artifact), 'job': _job_json(job)}, status=201)


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def backup_detail_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    return JsonResponse({'artifact': _artifact_json(art)})


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def backup_preview_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    try:
        return JsonResponse(_engine(request).preview(art))
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def backup_download_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    try:
        path = fetch_file(art.storage_key)
    except FileNotFoundError:
        return JsonResponse({'error': 'Dosya bulunamadı'}, status=404)
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.DOWNLOAD,
        artifact=art,
        step='İndirme',
    )
    return FileResponse(path.open('rb'), as_attachment=True, filename=art.filename)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=['yedekleme.restore', 'yedekleme.manage'])
def backup_verify_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    try:
        return JsonResponse(_engine(request).verify(art))
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc), 'valid': False}, status=400)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=['yedekleme.restore', 'yedekleme.manage'])
def backup_analyze_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    try:
        return JsonResponse(_engine(request).analyze(art))
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=['yedekleme.restore', 'yedekleme.manage'])
def backup_dry_run_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    try:
        return JsonResponse(_engine(request).dry_run(art))
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=['yedekleme.restore', 'yedekleme.manage'])
def backup_restore_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    data = _body(request)
    confirm = data.get('confirm') or ''
    if confirm != 'RESTORE':
        return JsonResponse({'error': 'confirm alanı "RESTORE" olmalıdır'}, status=400)

    engine = _engine(request)
    job = engine.create_restore_job(art)
    threading.Thread(
        target=_restore_worker,
        kwargs={
            'artifact_id': art.id,
            'job_id': job.id,
            'user_id': request.user.id if request.user.is_authenticated else None,
            'ip_address': _client_ip(request),
            'confirm': confirm,
        },
        daemon=True,
    ).start()
    return JsonResponse(
        {
            'accepted': True,
            'job': _job_json(job),
            'message': 'Geri yükleme arka planda başlatıldı. İlerlemeyi iş kartından takip edin.',
        },
        status=202,
    )


@require_http_methods(['DELETE'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def backup_delete_view(request, artifact_id: int):
    art, _art_err = _get_artifact_or_error(artifact_id)
    if _art_err:
        return _art_err
    _engine(request).delete_artifact(art)
    return JsonResponse({'deleted': True})


@require_http_methods(['GET', 'PUT'])
@api_permission_required('yedekleme.read', 'yedekleme.manage', write_codes=['yedekleme.manage'])
def schedule_view(request):
    schedule = BackupSchedule.get_singleton()
    if request.method == 'GET':
        return JsonResponse(_schedule_json(schedule))
    data = _body(request)
    if 'frequency' in data:
        schedule.frequency = data['frequency']
        schedule.enabled = data['frequency'] != ScheduleFrequency.OFF and bool(data.get('enabled', True))
    if 'enabled' in data:
        schedule.enabled = bool(data['enabled'])
        if not schedule.enabled:
            schedule.frequency = ScheduleFrequency.OFF
    for field in ('hour', 'minute', 'max_artifacts'):
        if field in data:
            setattr(schedule, field, int(data[field]))
    if 'kind' in data:
        schedule.kind = data['kind']
    if 'resource_codes' in data:
        schedule.resource_codes = data['resource_codes'] or []
    if 'auto_delete_old' in data:
        schedule.auto_delete_old = bool(data['auto_delete_old'])
    if 'encrypt' in data:
        schedule.encrypt = bool(data['encrypt']) and enc.encryption_key_available()
        schedule.save()
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.SCHEDULE_UPDATE,
        step='Zamanlama güncellendi',
        metadata={'frequency': schedule.frequency, 'enabled': schedule.enabled},
    )
    return JsonResponse({'updated': True, 'schedule': _schedule_json(schedule)})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.create', 'yedekleme.manage', write_codes=['yedekleme.create', 'yedekleme.manage'])
def schedule_run_now_view(request):
    """Zamanlanmış ayarlarla hemen yedek alır (cron beklemeden)."""
    _ensure_registry()
    try:
        artifact, job = _engine(request).run_scheduled_now()
    except Exception as exc:  # noqa: BLE001
        return JsonResponse(
            {'error': str(exc), 'schedule': _schedule_json(BackupSchedule.get_singleton())},
            status=400,
        )
    return JsonResponse({
        'artifact': _artifact_json(artifact),
        'job': _job_json(job),
        'schedule': _schedule_json(BackupSchedule.get_singleton()),
    }, status=201)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.create', 'yedekleme.restore', 'yedekleme.manage', write_codes=['yedekleme.create', 'yedekleme.restore', 'yedekleme.manage'])
def backup_upload_view(request):
    """İndirilmiş v2 yedek dosyasını (.zip / .zip.enc) sisteme kaydeder."""
    import tempfile
    from pathlib import Path

    uploaded = request.FILES.get('file')
    if not uploaded:
        return JsonResponse({'error': 'file alanı zorunlu (multipart)'}, status=400)

    max_bytes = int((getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('upload_max_bytes') or (2 * 1024 ** 3))
    if uploaded.size and uploaded.size > max_bytes:
        return JsonResponse({'error': f'Dosya çok büyük (max {max_bytes} byte)'}, status=400)

    name = uploaded.name or 'backup.zip'
    if not (name.endswith('.zip') or name.endswith('.zip.enc') or name.endswith('.enc')):
        return JsonResponse({'error': 'Sadece .zip veya .zip.enc (yedekleme v2) yüklenebilir'}, status=400)

    tmp = Path(tempfile.mkdtemp(prefix='backup_upload_')) / name
    try:
        with tmp.open('wb') as fh:
            for chunk in uploaded.chunks():
                fh.write(chunk)
        artifact, info = _engine(request).import_backup_file(tmp, original_filename=name)
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)
    finally:
        import shutil
        shutil.rmtree(tmp.parent, ignore_errors=True)

    return JsonResponse({'artifact': _artifact_json(artifact), 'import': info}, status=201)


@require_http_methods(['GET', 'PUT'])
@api_permission_required('yedekleme.read', 'yedekleme.manage', write_codes=['yedekleme.manage'])
def settings_view(request):
    s = BackupSettings.get_singleton()
    if request.method == 'GET':
        return JsonResponse({
            'encryption_enabled': s.encryption_enabled,
            'default_encrypt': s.default_encrypt,
            'default_compress': s.default_compress,
            'notify_enabled': s.notify_enabled,
            'notify_emails': s.notify_emails,
            'notify_on_success': s.notify_on_success,
            'notify_on_failure': s.notify_on_failure,
            'notes': s.notes,
            'encryption_key_available': enc.encryption_key_available(),
            'key_fingerprint': enc.key_fingerprint(),
            'local_root': str(local_root()),
            'format_version': '2.0',
            'legacy_format_supported': False,
        })
    data = _body(request)
    for field in ('encryption_enabled', 'default_encrypt', 'default_compress',
                  'notify_enabled', 'notify_on_success', 'notify_on_failure'):
        if field in data:
            setattr(s, field, bool(data[field]))
    if 'notify_emails' in data:
        s.notify_emails = (data['notify_emails'] or '')[:512]
    if 'notes' in data:
        s.notes = data['notes'] or ''
    s.save()
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.SETTINGS_UPDATE,
        step='Ayarlar güncellendi',
    )
    return JsonResponse({'updated': True})


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def logs_view(request):
    try:
        qs = BackupOperationLog.objects.select_related('user', 'artifact').all()
        action = (request.GET.get('action') or '').strip()
        if action:
            qs = qs.filter(action=action)
        try:
            page = max(1, int(request.GET.get('page') or 1))
            page_size = min(200, max(1, int(request.GET.get('page_size') or 50)))
        except ValueError:
            page, page_size = 1, 50
        total = qs.count()
        start = (page - 1) * page_size
        results = []
        for log in qs[start:start + page_size]:
            meta = log.metadata if isinstance(log.metadata, dict) else {}
            results.append({
                'id': log.id,
                'action': log.action,
                'step': log.step or '',
                'success': log.success,
                'error_message': log.error_message or '',
                'metadata': meta,
                'duration_ms': log.duration_ms,
                'artifact_id': log.artifact_id,
                'job_id': log.job_id,
                'user_id': log.user_id,
                'ip_address': str(log.ip_address) if log.ip_address else None,
                'created_at': log.created_at.isoformat() if log.created_at else None,
            })
        return JsonResponse({
            'results': results,
            'count': total,
            'page': page,
            'page_size': page_size,
        })
    except Exception as exc:  # noqa: BLE001
        return JsonResponse(
            {'error': f'Günlükler okunamadı: {exc}', 'results': [], 'count': 0},
            status=500,
        )


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def job_detail_view(request, job_id: int):
    try:
        job = BackupJob.objects.get(pk=job_id)
    except BackupJob.DoesNotExist:
        return JsonResponse({'error': 'İş bulunamadı'}, status=404)
    return JsonResponse({'job': _job_json(job)})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def jobs_cleanup_stale_view(request):
    data = _body(request)
    try:
        if data.get('minutes') is not None:
            max_age_minutes = max(5, int(data['minutes']))
        else:
            hours = max(1, int(data.get('hours') or 1))
            max_age_minutes = hours * 60
    except (TypeError, ValueError):
        max_age_minutes = 15
    cleaned = _engine(request).fail_stale_running_jobs(max_age_minutes=max_age_minutes)
    _engine(request)._log(  # noqa: SLF001
        action=BackupOperationAction.PURGE,
        step='Takılı job temizliği',
        metadata={'cleaned_jobs': cleaned, 'max_age_minutes': max_age_minutes},
    )
    return JsonResponse({'cleaned_jobs': cleaned, 'max_age_minutes': max_age_minutes})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def job_cancel_view(request, job_id: int):
    try:
        job = BackupJob.objects.get(pk=job_id)
    except BackupJob.DoesNotExist:
        return JsonResponse({'error': 'İş bulunamadı'}, status=404)
    data = _body(request)
    reason = (data.get('reason') or 'Manuel iptal').strip()[:500]
    result = _engine(request).cancel_job(job, reason=reason or 'Manuel iptal')
    return JsonResponse({'job': _job_json(BackupJob.objects.get(pk=job_id)), **result})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.manage', write_codes=['yedekleme.manage'])
def purge_view(request):
    result = RetentionService().purge()
    _engine(request)._log(action=BackupOperationAction.PURGE, step='Temizlik', metadata=result)
    return JsonResponse(result)
