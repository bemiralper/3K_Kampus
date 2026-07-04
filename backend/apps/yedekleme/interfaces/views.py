import json
import time

from django.http import FileResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from apps.yedekleme.application.config import backup_root, get_backup_config, retention_policy
from apps.yedekleme.application.providers.registry import get_remote_storage_provider
from apps.yedekleme.application.services.audit_service import log_backup_operation
from apps.yedekleme.application.services.backup_orchestrator import BackupOrchestrator, RestoreService
from apps.yedekleme.application.services.retention_service import RetentionService
from apps.yedekleme.domain.models import (
    BackupArtifact,
    BackupOperationAction,
    BackupSchedule,
    BackupStatus,
    BackupTrigger,
)
from shared.permissions import api_permission_required


def _client_ip(request):
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _artifact_json(art: BackupArtifact) -> dict:
    return {
        'id': art.id,
        'filename': art.filename,
        'size_bytes': art.size_bytes,
        'checksum': art.checksum,
        'status': art.status,
        'trigger': art.trigger,
        'components': art.components,
        'started_at': art.started_at.isoformat() if art.started_at else None,
        'finished_at': art.finished_at.isoformat() if art.finished_at else None,
        'duration_ms': art.duration_ms,
        'created_by': art.created_by_id,
        'error_message': art.error_message,
    }


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def dashboard_view(request):
    latest = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).first()
    schedule = BackupSchedule.get_singleton()
    total_size = sum(
        a.size_bytes for a in BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).only('size_bytes')
    )
    return JsonResponse({
        'latest_backup': _artifact_json(latest) if latest else None,
        'total_backups': BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).count(),
        'total_size_bytes': total_size,
        'schedule': {
            'frequency': schedule.frequency,
            'hour': schedule.hour,
            'minute': schedule.minute,
            'enabled': schedule.enabled,
            'include_logs': schedule.include_logs,
            'last_run_at': schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        },
        'config': {
            'local_root': str(backup_root()),
            'remote_provider': get_backup_config().get('remote_provider', 'local'),
            'retention': retention_policy(),
        },
    })


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def artifact_list_view(request):
    items = [_artifact_json(a) for a in BackupArtifact.objects.all()[:100]]
    return JsonResponse({'results': items})


@require_http_methods(['POST'])
@api_permission_required('yedekleme.create', 'yedekleme.manage', write_codes=('yedekleme.create', 'yedekleme.manage'))
def artifact_create_view(request):
    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        body = {}
    include_logs = bool(body.get('include_logs', False))
    t0 = time.monotonic()
    try:
        artifact = BackupOrchestrator().run(
            trigger=BackupTrigger.MANUAL,
            user=request.user,
            include_logs=include_logs,
        )
        duration_ms = int((time.monotonic() - t0) * 1000)
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.CREATE,
            ip_address=_client_ip(request),
            artifact=artifact,
            duration_ms=duration_ms,
            metadata={'include_logs': include_logs},
        )
        return JsonResponse({'artifact': _artifact_json(artifact)}, status=201)
    except Exception as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.CREATE,
            ip_address=_client_ip(request),
            success=False,
            error_message=str(exc),
            duration_ms=duration_ms,
        )
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def artifact_download_view(request, artifact_id: int):
    try:
        artifact = BackupArtifact.objects.get(pk=artifact_id, status=BackupStatus.COMPLETED)
    except BackupArtifact.DoesNotExist:
        return JsonResponse({'error': 'Yedek bulunamadı'}, status=404)
    import tempfile
    from pathlib import Path
    tmp = Path(tempfile.mkdtemp())
    local = tmp / artifact.filename
    try:
        get_remote_storage_provider().fetch(artifact.storage_key, str(local))
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.DOWNLOAD,
            ip_address=_client_ip(request),
            artifact=artifact,
        )
        fh = open(local, 'rb')
        response = FileResponse(
            fh,
            as_attachment=True,
            filename=artifact.filename,
            content_type='application/octet-stream',
        )
        return response
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=('yedekleme.restore', 'yedekleme.manage'))
def artifact_validate_view(request, artifact_id: int):
    try:
        artifact = BackupArtifact.objects.get(pk=artifact_id, status=BackupStatus.COMPLETED)
    except BackupArtifact.DoesNotExist:
        return JsonResponse({'error': 'Yedek bulunamadı'}, status=404)
    t0 = time.monotonic()
    try:
        result = RestoreService().validate_only(artifact)
        duration_ms = int((time.monotonic() - t0) * 1000)
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.VALIDATE,
            ip_address=_client_ip(request),
            artifact=artifact,
            duration_ms=duration_ms,
        )
        return JsonResponse(result)
    except Exception as exc:
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.VALIDATE,
            ip_address=_client_ip(request),
            artifact=artifact,
            success=False,
            error_message=str(exc),
        )
        return JsonResponse({'valid': False, 'error': str(exc)}, status=400)


@require_http_methods(['POST'])
@api_permission_required('yedekleme.restore', 'yedekleme.manage', write_codes=('yedekleme.restore', 'yedekleme.manage'))
def artifact_restore_view(request, artifact_id: int):
    try:
        artifact = BackupArtifact.objects.get(pk=artifact_id, status=BackupStatus.COMPLETED)
    except BackupArtifact.DoesNotExist:
        return JsonResponse({'error': 'Yedek bulunamadı'}, status=404)
    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    confirm = body.get('confirm', '')
    t0 = time.monotonic()
    try:
        result = RestoreService().restore(artifact, confirm=confirm)
        duration_ms = int((time.monotonic() - t0) * 1000)
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.RESTORE,
            ip_address=_client_ip(request),
            artifact=artifact,
            duration_ms=duration_ms,
        )
        return JsonResponse(result)
    except Exception as exc:
        log_backup_operation(
            user=request.user,
            action=BackupOperationAction.RESTORE,
            ip_address=_client_ip(request),
            artifact=artifact,
            success=False,
            error_message=str(exc),
        )
        return JsonResponse({'error': str(exc)}, status=400)


@require_http_methods(['DELETE'])
@api_permission_required('yedekleme.manage', write_codes=('yedekleme.manage',))
def artifact_delete_view(request, artifact_id: int):
    try:
        artifact = BackupArtifact.objects.get(pk=artifact_id)
    except BackupArtifact.DoesNotExist:
        return JsonResponse({'error': 'Yedek bulunamadı'}, status=404)
    try:
        get_remote_storage_provider().delete(artifact.storage_key)
    except Exception:
        pass
    log_backup_operation(
        user=request.user,
        action=BackupOperationAction.DELETE,
        ip_address=_client_ip(request),
        artifact=artifact,
    )
    artifact.delete()
    return JsonResponse({'deleted': True})


@require_http_methods(['GET', 'PUT'])
@api_permission_required(
    'yedekleme.read', 'yedekleme.manage',
    write_codes=('yedekleme.manage',),
)
def schedule_view(request):
    schedule = BackupSchedule.get_singleton()
    if request.method == 'GET':
        return JsonResponse({
            'frequency': schedule.frequency,
            'hour': schedule.hour,
            'minute': schedule.minute,
            'enabled': schedule.enabled,
            'include_logs': schedule.include_logs,
            'last_run_at': schedule.last_run_at.isoformat() if schedule.last_run_at else None,
        })
    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    schedule.frequency = body.get('frequency', schedule.frequency)
    schedule.hour = int(body.get('hour', schedule.hour))
    schedule.minute = int(body.get('minute', schedule.minute))
    schedule.enabled = bool(body.get('enabled', schedule.enabled))
    schedule.include_logs = bool(body.get('include_logs', schedule.include_logs))
    schedule.save()
    log_backup_operation(
        user=request.user,
        action=BackupOperationAction.SCHEDULE_UPDATE,
        ip_address=_client_ip(request),
        metadata={'frequency': schedule.frequency, 'enabled': schedule.enabled},
    )
    return JsonResponse({'updated': True})


@require_http_methods(['GET'])
@api_permission_required('yedekleme.read', 'yedekleme.manage')
def operation_log_view(request):
    from apps.yedekleme.domain.models import BackupOperationLog
    logs = BackupOperationLog.objects.select_related('user', 'artifact')[:50]
    return JsonResponse({
        'results': [{
            'id': log.id,
            'action': log.action,
            'success': log.success,
            'user_id': log.user_id,
            'artifact_id': log.artifact_id,
            'ip_address': log.ip_address,
            'duration_ms': log.duration_ms,
            'error_message': log.error_message,
            'created_at': log.created_at.isoformat(),
        } for log in logs],
    })
