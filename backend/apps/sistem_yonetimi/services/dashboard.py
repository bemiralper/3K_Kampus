from __future__ import annotations

import hashlib
import traceback
from datetime import datetime, timezone

from django.contrib.sessions.models import Session
from django.utils import timezone as dj_tz

from apps.sistem_yonetimi.collectors.host import collect_host_metrics
from apps.sistem_yonetimi.collectors.postgres import postgres_status
from apps.sistem_yonetimi.collectors.storage import disk_usage_root, folder_breakdown, largest_subdirs
from apps.sistem_yonetimi.collectors.systemd import tcp_probe, unit_status
from apps.sistem_yonetimi.config import get_config
from apps.sistem_yonetimi.domain.models import (
    SystemErrorEvent,
    SystemJobRun,
    SystemMetricSample,
    SystemSettings,
)
from apps.sistem_yonetimi.registry import all_health_checks, all_services
from apps.sistem_yonetimi.services.alerts import evaluate_alerts
from apps.sistem_yonetimi.services.jobs import list_jobs_with_runs


def _now() -> datetime:
    return datetime.now(timezone.utc)


def active_session_count() -> int:
    try:
        return Session.objects.filter(expire_date__gte=dj_tz.now()).count()
    except Exception:
        return 0


def last_backup_summary() -> dict | None:
    try:
        from apps.yedekleme.domain.models import BackupArtifact, BackupStatus
        art = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).order_by('-started_at').first()
        if not art:
            return None
        return {
            'id': art.id,
            'filename': art.filename,
            'size_bytes': art.size_bytes,
            'started_at': art.started_at.isoformat() if art.started_at else None,
            'finished_at': art.finished_at.isoformat() if art.finished_at else None,
        }
    except Exception:
        return None


def build_dashboard() -> dict:
    cfg = get_config()
    host = collect_host_metrics()
    pg = postgres_status()
    alerts = evaluate_alerts()
    settings_obj = SystemSettings.get_singleton()

    services = []
    for svc in all_services():
        st = unit_status(svc.unit)
        services.append({
            'code': svc.code,
            'label': svc.label,
            'unit': svc.unit,
            **st,
        })

    health = run_health_checks()
    running_jobs = SystemJobRun.objects.filter(status='running').count()
    last_err = SystemErrorEvent.objects.order_by('-last_seen_at').first()

    app_ok = True
    try:
        from django.db import connection
        connection.ensure_connection()
    except Exception:
        app_ok = False

    return {
        'server': {
            'status': 'up' if host.get('available') else 'warn',
            'host': host,
        },
        'application': {
            'status': 'up' if app_ok else 'down',
            'message': 'Django yanıt veriyor' if app_ok else 'DB bağlantısı yok',
        },
        'last_backup': last_backup_summary(),
        'last_error': {
            'id': last_err.id,
            'message': last_err.message[:300],
            'error_type': last_err.error_type,
            'last_seen_at': last_err.last_seen_at.isoformat() if last_err else None,
            'occurrence_count': last_err.occurrence_count,
        } if last_err else None,
        'cpu_percent': host.get('cpu_percent'),
        'ram_percent': host.get('ram_percent'),
        'disk_percent': host.get('disk_percent'),
        'postgres': pg,
        'nginx': next((s for s in services if s['code'] == 'nginx'), None),
        'gunicorn': next((s for s in services if s['code'] == 'lms-backend'), None),
        'active_users': active_session_count(),
        'running_jobs': running_jobs,
        'services_preview': services,
        'health_preview': health[:8],
        'alerts': alerts,
        'ops_enabled': bool(cfg.get('ops_enabled') and settings_obj.ops_enabled),
        'docker_mode': bool(cfg.get('docker_mode')),
        'poll_interval_sec': settings_obj.poll_interval_sec,
        'collected_at': _now().isoformat(),
    }


def run_health_checks() -> list[dict]:
    results = []
    for check in all_health_checks():
        checked_at = _now().isoformat()
        try:
            result = check.check()
        except Exception as exc:  # noqa: BLE001
            result = {'status': 'down', 'message': str(exc)}
        results.append({
            'code': check.code,
            'label': check.label,
            'category': check.category,
            'status': result.get('status', 'unknown'),
            'message': result.get('message', ''),
            'detail': result.get('detail') or {},
            'checked_at': checked_at,
        })
    return results


def list_services_detail() -> list[dict]:
    from apps.sistem_yonetimi.collectors.host import process_memory_rss

    rows = []
    for svc in all_services():
        st = unit_status(svc.unit)
        mem = st.get('memory_bytes') or process_memory_rss(st.get('pid'))
        rows.append({
            'code': svc.code,
            'label': svc.label,
            'unit': svc.unit,
            'description': svc.description,
            **st,
            'memory_bytes': mem,
        })
    return rows


def build_storage() -> dict:
    cfg = get_config()
    disk = disk_usage_root('/')
    folders = folder_breakdown(cfg['paths'])
    largest = []
    for key in ('media', 'backups', 'logs'):
        path = cfg['paths'].get(key)
        if path:
            largest.extend(largest_subdirs(path, limit=5))
    largest.sort(key=lambda x: x['size_bytes'], reverse=True)
    return {
        'disk': disk,
        'folders': folders,
        'largest': largest[:20],
        'collected_at': _now().isoformat(),
    }


def record_error_event(
    *,
    message: str,
    error_type: str = '',
    stack_trace: str = '',
    module: str = '',
    request_url: str = '',
    http_method: str = '',
    status_code: int | None = None,
    user=None,
    ip_address: str | None = None,
    user_agent: str = '',
    request_params: dict | None = None,
) -> SystemErrorEvent:
    raw = f'{error_type}|{message[:200]}|{request_url}'
    fingerprint = hashlib.sha256(raw.encode('utf-8', errors='replace')).hexdigest()[:40]
    existing = SystemErrorEvent.objects.filter(fingerprint=fingerprint, status='open').first()
    if existing:
        existing.occurrence_count += 1
        existing.message = message[:4000]
        existing.stack_trace = (stack_trace or existing.stack_trace)[:20000]
        existing.last_seen_at = dj_tz.now()
        if user:
            existing.user = user
        existing.save()
        return existing
    return SystemErrorEvent.objects.create(
        fingerprint=fingerprint,
        module=module[:64],
        error_type=error_type[:128],
        message=message[:4000],
        stack_trace=(stack_trace or '')[:20000],
        request_url=request_url[:2000],
        http_method=http_method[:16],
        status_code=status_code,
        user=user,
        ip_address=ip_address,
        user_agent=(user_agent or '')[:500],
        request_params=request_params or {},
    )


def collect_and_store_metrics() -> SystemMetricSample:
    host = collect_host_metrics()
    pg = postgres_status()
    sample = SystemMetricSample.objects.create(
        collected_at=dj_tz.now(),
        cpu_percent=float(host.get('cpu_percent') or 0),
        ram_percent=float(host.get('ram_percent') or 0),
        ram_used_bytes=int(host.get('ram_used_bytes') or 0),
        ram_total_bytes=int(host.get('ram_total_bytes') or 0),
        disk_percent=float(host.get('disk_percent') or 0),
        disk_used_bytes=int(host.get('disk_used_bytes') or 0),
        disk_total_bytes=int(host.get('disk_total_bytes') or 0),
        disk_read_bytes=int(host.get('disk_read_bytes') or 0),
        disk_write_bytes=int(host.get('disk_write_bytes') or 0),
        net_bytes_sent=int(host.get('net_bytes_sent') or 0),
        net_bytes_recv=int(host.get('net_bytes_recv') or 0),
        pg_connections=int(pg.get('connections') or 0),
        extra={'load_avg': host.get('load_avg') or []},
    )
    return sample


def metrics_series(range_key: str = '1h') -> dict:
    now = dj_tz.now()
    delta_map = {
        '1h': dj_tz.timedelta(hours=1),
        '24h': dj_tz.timedelta(hours=24),
        '7d': dj_tz.timedelta(days=7),
        '30d': dj_tz.timedelta(days=30),
    }
    since = now - delta_map.get(range_key, delta_map['1h'])
    qs = SystemMetricSample.objects.filter(collected_at__gte=since).order_by('collected_at')
    points = [
        {
            't': s.collected_at.isoformat(),
            'cpu': s.cpu_percent,
            'ram': s.ram_percent,
            'disk': s.disk_percent,
            'pg': s.pg_connections,
            'net_sent': s.net_bytes_sent,
            'net_recv': s.net_bytes_recv,
            'disk_read': s.disk_read_bytes,
            'disk_write': s.disk_write_bytes,
        }
        for s in qs[:5000]
    ]
    live = collect_host_metrics()
    return {'range': range_key, 'points': points, 'live': live, 'postgres': postgres_status()}
