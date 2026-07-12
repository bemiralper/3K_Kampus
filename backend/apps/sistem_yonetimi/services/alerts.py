from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.sistem_yonetimi.collectors.host import collect_host_metrics
from apps.sistem_yonetimi.collectors.postgres import postgres_status
from apps.sistem_yonetimi.domain.models import SystemAlertState, SystemErrorEvent, SystemSettings
from apps.sistem_yonetimi.registry import all_health_checks


def evaluate_alerts() -> list[dict]:
    settings_obj = SystemSettings.get_singleton()
    host = collect_host_metrics()
    pg = postgres_status()
    now = timezone.now()
    desired: dict[str, dict] = {}

    if host.get('available') and host.get('disk_percent', 0) >= settings_obj.disk_critical_percent:
        desired['disk_critical'] = {
            'severity': 'critical',
            'title': 'Disk kritik doluluk',
            'message': f"Disk %{host['disk_percent']} dolu",
            'metadata': {'disk_percent': host['disk_percent']},
        }
    elif host.get('available') and host.get('disk_percent', 0) >= settings_obj.disk_warn_percent:
        desired['disk_warn'] = {
            'severity': 'warning',
            'title': 'Disk uyarı eşiği',
            'message': f"Disk %{host['disk_percent']} dolu",
            'metadata': {'disk_percent': host['disk_percent']},
        }

    if pg.get('status') == 'down':
        desired['postgres_down'] = {
            'severity': 'critical',
            'title': 'PostgreSQL erişilemiyor',
            'message': pg.get('message') or 'Bağlantı hatası',
        }

    for check in all_health_checks():
        try:
            result = check.check()
        except Exception as exc:  # noqa: BLE001
            result = {'status': 'down', 'message': str(exc)}
        status = result.get('status')
        if status == 'down':
            desired[f'health_{check.code}'] = {
                'severity': 'critical',
                'title': f'{check.label} çalışmıyor',
                'message': result.get('message') or '',
            }
        elif status == 'warn':
            desired[f'health_{check.code}'] = {
                'severity': 'warning',
                'title': f'{check.label} uyarı',
                'message': result.get('message') or '',
            }

    since = now - timedelta(minutes=1)
    err_count = SystemErrorEvent.objects.filter(last_seen_at__gte=since).count()
    if err_count >= settings_obj.error_rate_warn_per_min:
        desired['error_rate'] = {
            'severity': 'warning',
            'title': 'Yüksek hata oranı',
            'message': f'Son 1 dakikada {err_count} hata grubu güncellendi',
            'metadata': {'count': err_count},
        }

    # Upsert / deactivate
    existing = {a.code: a for a in SystemAlertState.objects.all()}
    for code, payload in desired.items():
        obj = existing.get(code)
        if obj:
            obj.active = True
            obj.severity = payload['severity']
            obj.title = payload['title']
            obj.message = payload.get('message', '')
            obj.metadata = payload.get('metadata') or {}
            obj.save()
        else:
            SystemAlertState.objects.create(
                code=code,
                active=True,
                severity=payload['severity'],
                title=payload['title'],
                message=payload.get('message', ''),
                metadata=payload.get('metadata') or {},
            )
    for code, obj in existing.items():
        if code not in desired and obj.active:
            obj.active = False
            obj.save(update_fields=['active', 'last_seen_at'])

    return [
        {
            'code': a.code,
            'active': a.active,
            'severity': a.severity,
            'title': a.title,
            'message': a.message,
            'last_seen_at': a.last_seen_at.isoformat() if a.last_seen_at else None,
            'metadata': a.metadata or {},
        }
        for a in SystemAlertState.objects.filter(active=True).order_by('-last_seen_at')
    ]
