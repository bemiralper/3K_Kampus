"""Sistem Yönetimi API views."""

from __future__ import annotations

import json
from pathlib import Path

from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.http import require_http_methods

from apps.sistem_yonetimi.collectors.logs import read_tail_lines
from apps.sistem_yonetimi.config import get_config
from apps.sistem_yonetimi.domain.models import (
    SystemAuditLog,
    SystemErrorEvent,
    SystemSettings,
    SystemTimelineEvent,
)
from apps.sistem_yonetimi.registry import all_log_sources, get_log_source
from apps.sistem_yonetimi.services import dashboard as dash
from apps.sistem_yonetimi.services.alerts import evaluate_alerts
from apps.sistem_yonetimi.services.audit import write_audit
from apps.sistem_yonetimi.services.jobs import get_run, list_jobs_with_runs, start_job
from apps.sistem_yonetimi.services.service_control import control_service
from shared.permissions import api_permission_required


def _body(request) -> dict:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode('utf-8'))
    except json.JSONDecodeError:
        return {}


def _settings_json(obj: SystemSettings) -> dict:
    cfg = get_config()
    return {
        'poll_interval_sec': obj.poll_interval_sec,
        'disk_warn_percent': obj.disk_warn_percent,
        'disk_critical_percent': obj.disk_critical_percent,
        'error_rate_warn_per_min': obj.error_rate_warn_per_min,
        'scheduler_stale_minutes': obj.scheduler_stale_minutes,
        'ops_enabled': obj.ops_enabled and bool(cfg.get('ops_enabled')),
        'notes': obj.notes,
        'paths': {k: str(v) for k, v in cfg['paths'].items()},
        'docker_mode': bool(cfg.get('docker_mode')),
        'helper_path': cfg.get('helper_path'),
        'updated_at': obj.updated_at.isoformat() if obj.updated_at else None,
    }


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def dashboard_view(request):
    return JsonResponse(dash.build_dashboard())


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def health_view(request):
    return JsonResponse({'items': dash.run_health_checks(), 'alerts': evaluate_alerts()})


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def alerts_view(request):
    return JsonResponse({'items': evaluate_alerts()})


@require_http_methods(['GET', 'POST'])
@api_permission_required(
    'sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin',
    write_codes=['sistem_yonetimi.ops', 'sistem.admin'],
)
def services_view(request):
    if request.method == 'GET':
        return JsonResponse({'items': dash.list_services_detail(), 'ops_enabled': get_config().get('ops_enabled')})
    data = _body(request)
    code = (data.get('code') or '').strip()
    action = (data.get('action') or '').strip()
    confirm = (data.get('confirm') or '').strip()
    try:
        result = control_service(code, action, user=request.user, request=request, confirm=confirm)
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)
    return JsonResponse(result)


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def log_sources_view(request):
    items = [
        {
            'code': s.code,
            'label': s.label,
            'category': s.category,
            'path': s.path,
            'exists': Path(s.path).exists(),
        }
        for s in all_log_sources()
    ]
    return JsonResponse({'items': items})


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def logs_view(request):
    source = (request.GET.get('source') or 'django').strip()
    spec = get_log_source(source)
    if not spec:
        return JsonResponse({'error': 'Bilinmeyen log kaynağı'}, status=400)
    levels_raw = (request.GET.get('levels') or '').strip()
    levels = {x.strip().upper() for x in levels_raw.split(',') if x.strip()} or None
    try:
        max_lines = min(1000, max(20, int(request.GET.get('max_lines') or 200)))
    except ValueError:
        max_lines = 200
    offset = request.GET.get('offset')
    offset_i = int(offset) if offset not in (None, '') else None
    result = read_tail_lines(
        spec.path,
        max_lines=max_lines,
        query=(request.GET.get('q') or '').strip(),
        levels=levels,
        offset=offset_i,
        source_category=spec.category,
    )
    result['source'] = source
    result['label'] = spec.label
    return JsonResponse(result)


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin', write_codes=['sistem_yonetimi.manage', 'sistem.admin'])
def logs_download_view(request):
    source = (request.GET.get('source') or '').strip()
    spec = get_log_source(source)
    if not spec:
        return JsonResponse({'error': 'Bilinmeyen log kaynağı'}, status=400)
    path = Path(spec.path)
    if not path.exists():
        return JsonResponse({'error': 'Dosya yok'}, status=404)
    # Stream last 5MB max
    size = path.stat().st_size
    start = max(0, size - 5 * 1024 * 1024)

    def gen():
        with path.open('rb') as fh:
            fh.seek(start)
            while True:
                chunk = fh.read(64 * 1024)
                if not chunk:
                    break
                yield chunk

    resp = StreamingHttpResponse(gen(), content_type='text/plain; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="{path.name}"'
    return resp


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def errors_view(request):
    status = (request.GET.get('status') or 'open').strip()
    qs = SystemErrorEvent.objects.all()
    if status:
        qs = qs.filter(status=status)
    q = (request.GET.get('q') or '').strip()
    if q:
        qs = qs.filter(message__icontains=q)
    try:
        page = max(1, int(request.GET.get('page') or 1))
        page_size = min(100, max(1, int(request.GET.get('page_size') or 25)))
    except ValueError:
        page, page_size = 1, 25
    total = qs.count()
    start = (page - 1) * page_size
    items = []
    for e in qs[start:start + page_size]:
        items.append({
            'id': e.id,
            'fingerprint': e.fingerprint,
            'module': e.module,
            'error_type': e.error_type,
            'message': e.message[:500],
            'request_url': e.request_url,
            'http_method': e.http_method,
            'user_id': e.user_id,
            'status': e.status,
            'occurrence_count': e.occurrence_count,
            'first_seen_at': e.first_seen_at.isoformat() if e.first_seen_at else None,
            'last_seen_at': e.last_seen_at.isoformat() if e.last_seen_at else None,
        })
    return JsonResponse({'items': items, 'total': total, 'page': page, 'page_size': page_size})


@require_http_methods(['GET', 'PATCH'])
@api_permission_required(
    'sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin',
    write_codes=['sistem_yonetimi.manage', 'sistem.admin'],
)
def error_detail_view(request, error_id: int):
    try:
        e = SystemErrorEvent.objects.get(pk=error_id)
    except SystemErrorEvent.DoesNotExist:
        return JsonResponse({'error': 'Bulunamadı'}, status=404)
    if request.method == 'PATCH':
        data = _body(request)
        if 'status' in data:
            e.status = str(data['status'])[:20]
            e.save(update_fields=['status', 'last_seen_at'])
            write_audit(request=request, module='sistem_yonetimi', action='error_status', description=f'Hata {e.id} → {e.status}')
    return JsonResponse({
        'id': e.id,
        'fingerprint': e.fingerprint,
        'module': e.module,
        'error_type': e.error_type,
        'message': e.message,
        'stack_trace': e.stack_trace,
        'request_url': e.request_url,
        'http_method': e.http_method,
        'status_code': e.status_code,
        'user_id': e.user_id,
        'ip_address': e.ip_address,
        'user_agent': e.user_agent,
        'request_params': e.request_params or {},
        'status': e.status,
        'occurrence_count': e.occurrence_count,
        'first_seen_at': e.first_seen_at.isoformat() if e.first_seen_at else None,
        'last_seen_at': e.last_seen_at.isoformat() if e.last_seen_at else None,
    })


@require_http_methods(['GET', 'POST'])
@api_permission_required(
    'sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin',
    write_codes=['sistem_yonetimi.manage', 'sistem.admin'],
)
def jobs_view(request):
    if request.method == 'GET':
        return JsonResponse({'items': list_jobs_with_runs()})
    data = _body(request)
    code = (data.get('code') or '').strip()
    try:
        run = start_job(code, user=request.user, request=request)
    except Exception as exc:  # noqa: BLE001
        return JsonResponse({'error': str(exc)}, status=400)
    return JsonResponse({'run': get_run(run.id)}, status=201)


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def job_run_view(request, run_id: int):
    run = get_run(run_id)
    if not run:
        return JsonResponse({'error': 'Bulunamadı'}, status=404)
    return JsonResponse({'run': run})


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def audit_view(request):
    qs = SystemAuditLog.objects.all()
    module = (request.GET.get('module') or '').strip()
    if module:
        qs = qs.filter(module=module)
    q = (request.GET.get('q') or '').strip()
    if q:
        qs = qs.filter(description__icontains=q)
    try:
        page = max(1, int(request.GET.get('page') or 1))
        page_size = min(100, max(1, int(request.GET.get('page_size') or 25)))
    except ValueError:
        page, page_size = 1, 25
    total = qs.count()
    start = (page - 1) * page_size
    items = [{
        'id': a.id,
        'created_at': a.created_at.isoformat() if a.created_at else None,
        'user_id': a.user_id,
        'module': a.module,
        'action': a.action,
        'description': a.description,
        'ip_address': a.ip_address,
        'user_agent': a.user_agent,
        'metadata': a.metadata or {},
    } for a in qs[start:start + page_size]]
    return JsonResponse({'items': items, 'total': total, 'page': page, 'page_size': page_size})


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def timeline_view(request):
    qs = SystemTimelineEvent.objects.all()
    category = (request.GET.get('category') or '').strip()
    if category:
        qs = qs.filter(category=category)
    try:
        page = max(1, int(request.GET.get('page') or 1))
        page_size = min(100, max(1, int(request.GET.get('page_size') or 40)))
    except ValueError:
        page, page_size = 1, 40
    total = qs.count()
    start = (page - 1) * page_size
    items = [{
        'id': t.id,
        'created_at': t.created_at.isoformat() if t.created_at else None,
        'category': t.category,
        'title': t.title,
        'detail': t.detail,
        'level': t.level,
        'metadata': t.metadata or {},
    } for t in qs[start:start + page_size]]
    return JsonResponse({'items': items, 'total': total, 'page': page, 'page_size': page_size})


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def performance_view(request):
    range_key = (request.GET.get('range') or '1h').strip()
    return JsonResponse(dash.metrics_series(range_key))


@require_http_methods(['GET'])
@api_permission_required('sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin')
def storage_view(request):
    return JsonResponse(dash.build_storage())


@require_http_methods(['GET', 'PUT'])
@api_permission_required(
    'sistem_yonetimi.read', 'sistem_yonetimi.manage', 'sistem.admin',
    write_codes=['sistem_yonetimi.manage', 'sistem.admin'],
)
def settings_view(request):
    obj = SystemSettings.get_singleton()
    if request.method == 'GET':
        return JsonResponse(_settings_json(obj))
    data = _body(request)
    for field in ('poll_interval_sec', 'disk_warn_percent', 'disk_critical_percent', 'error_rate_warn_per_min', 'scheduler_stale_minutes'):
        if field in data:
            setattr(obj, field, int(data[field]))
    if 'ops_enabled' in data:
        obj.ops_enabled = bool(data['ops_enabled'])
    if 'notes' in data:
        obj.notes = str(data['notes'])[:5000]
    obj.save()
    write_audit(request=request, module='sistem_yonetimi', action='settings_update', description='Sistem paneli ayarları güncellendi')
    return JsonResponse({'updated': True, 'settings': _settings_json(obj)})
