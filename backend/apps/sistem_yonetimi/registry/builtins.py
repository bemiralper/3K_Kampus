"""Builtin registry registrations for services, logs, health, jobs."""

from __future__ import annotations

from pathlib import Path

from apps.sistem_yonetimi.collectors.logs import file_mtime_iso
from apps.sistem_yonetimi.collectors.postgres import postgres_status
from apps.sistem_yonetimi.collectors.systemd import tcp_probe, unit_status
from apps.sistem_yonetimi.config import get_config
from apps.sistem_yonetimi.registry.specs import (
    HealthCheckSpec,
    JobSpec,
    LogSourceSpec,
    ServiceSpec,
    register_health_check,
    register_job,
    register_log_source,
    register_service,
)


def _register_services():
    cfg = get_config()
    for item in cfg.get('services') or []:
        register_service(ServiceSpec(
            code=item['code'],
            label=item.get('label') or item['code'],
            unit=item.get('unit') or item['code'],
            description=item.get('description') or '',
        ))


def _register_logs():
    cfg = get_config()
    log_dir = Path(cfg['log_dir'])
    sources = [
        ('django', 'Django / Gunicorn error', str(log_dir / 'backend-error.log'), 'django'),
        ('gunicorn', 'Gunicorn access', str(log_dir / 'backend-access.log'), 'gunicorn'),
        ('nginx', 'Nginx error', '/var/log/nginx/error.log', 'nginx'),
        ('backup', 'Backup cron', str(log_dir / 'backups.log'), 'backup'),
        ('scheduler', 'Ödeme hatırlatma', str(log_dir / 'payment_reminders.log'), 'scheduler'),
        ('whatsapp', 'İletişim kuyruğu', str(log_dir / 'comm_queue.log'), 'whatsapp'),
        ('sms', 'Kampanya', str(log_dir / 'campaigns.log'), 'sms'),
        ('mail', 'Hatırlatmalar', str(log_dir / 'reminders.log'), 'mail'),
        ('api', 'API access log (HTTP 200=OK; ERROR=5xx)', str(log_dir / 'backend-access.log'), 'api'),
        ('security', 'Gunicorn error (security)', str(log_dir / 'backend-error.log'), 'security'),
        ('postgres', 'PostgreSQL (varsa)', '/var/log/postgresql/postgresql-16-main.log', 'postgres'),
    ]
    for code, label, path, category in sources:
        register_log_source(LogSourceSpec(code=code, label=label, path=path, category=category))


def _health_unit(code: str, label: str, unit: str):
    def _check():
        st = unit_status(unit)
        if not st.get('available'):
            # Fallback TCP probes for common services in docker/dev
            if code == 'postgresql':
                ok = tcp_probe('127.0.0.1', 5432) or tcp_probe('db', 5432)
                return {'status': 'up' if ok else 'warn', 'message': 'systemctl yok; TCP probe', 'detail': st}
            if code == 'nginx':
                ok = tcp_probe('127.0.0.1', 80) or tcp_probe('127.0.0.1', 443)
                return {'status': 'up' if ok else 'stopped', 'message': 'systemctl yok; TCP probe', 'detail': st}
            if code in ('gunicorn', 'lms-backend'):
                ok = tcp_probe('127.0.0.1', 8000)
                return {'status': 'up' if ok else 'down', 'message': 'systemctl yok; :8000 probe', 'detail': st}
            return {'status': 'unknown', 'message': st.get('message') or 'systemctl yok', 'detail': st}
        return {'status': st.get('status') or 'unknown', 'message': st.get('active_state', ''), 'detail': st}
    return _check


def _register_health():
    register_health_check(HealthCheckSpec(
        code='postgresql',
        label='PostgreSQL',
        category='database',
        check=lambda: {
            **postgres_status(),
            'detail': postgres_status(),
        },
    ))
    register_health_check(HealthCheckSpec(code='gunicorn', label='Gunicorn', check=_health_unit('gunicorn', 'Gunicorn', 'lms-backend')))
    register_health_check(HealthCheckSpec(code='nginx', label='Nginx', check=_health_unit('nginx', 'Nginx', 'nginx')))
    register_health_check(HealthCheckSpec(code='frontend', label='Next.js', check=_health_unit('frontend', 'Next.js', 'lms-frontend')))

    def scheduler_check():
        cfg = get_config()
        path = Path(cfg['log_dir']) / 'backups.log'
        mtime = file_mtime_iso(path)
        cron = Path('/etc/cron.d/lms-yedekleme')
        if cron.exists() or path.exists():
            return {'status': 'up', 'message': 'Cron / log mevcut', 'detail': {'log_mtime': mtime, 'cron': cron.exists()}}
        return {'status': 'warn', 'message': 'Scheduler cron dosyası görülmedi', 'detail': {'log_mtime': mtime}}

    def backup_check():
        try:
            from apps.yedekleme.domain.models import BackupSchedule, BackupArtifact, BackupStatus
            schedule = BackupSchedule.get_singleton()
            last = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).order_by('-started_at').first()
            if schedule.last_run_status == 'failed':
                return {'status': 'down', 'message': schedule.last_run_message or 'Son yedek başarısız'}
            if last:
                return {'status': 'up', 'message': last.filename, 'detail': {'last_run_at': schedule.last_run_at.isoformat() if schedule.last_run_at else None}}
            return {'status': 'warn', 'message': 'Henüz tamamlanmış yedek yok'}
        except Exception as exc:  # noqa: BLE001
            return {'status': 'warn', 'message': str(exc)}

    def queue_check(name: str):
        def _inner():
            try:
                from apps.communication.domain.models import OutboundMessage
                # Best-effort; model name may differ
                pending = OutboundMessage.objects.filter(status='pending').count()
                failed = OutboundMessage.objects.filter(status='failed').count()
                status = 'up'
                if failed > 20:
                    status = 'warn'
                if pending > 500:
                    status = 'warn'
                return {'status': status, 'message': f'Bekleyen {pending}, başarısız {failed}', 'detail': {'pending': pending, 'failed': failed}}
            except Exception:
                return {'status': 'unknown', 'message': f'{name} kuyruk modeli okunamadı'}
        return _inner

    register_health_check(HealthCheckSpec(code='scheduler', label='Scheduler', check=scheduler_check, category='scheduler'))
    register_health_check(HealthCheckSpec(code='backup', label='Backup', check=backup_check, category='backup'))
    register_health_check(HealthCheckSpec(code='whatsapp', label='WhatsApp', check=queue_check('WhatsApp'), category='comm'))
    register_health_check(HealthCheckSpec(code='sms', label='SMS', check=queue_check('SMS'), category='comm'))
    register_health_check(HealthCheckSpec(
        code='mail',
        label='Mail',
        category='comm',
        check=lambda: {'status': 'unknown', 'message': 'SMTP sağlık kontrolü yapılandırılmadı'},
    ))


def _register_jobs():
    jobs = [
        JobSpec('backup_run', 'Otomatik yedek çalıştır', 'run_scheduled_backups', 'Zamanlanmış yedeği hemen çalıştırır', '* * * * *', 'backup', {'force': True}),
        JobSpec('backup_purge', 'Eski yedek temizliği', 'purge_expired_backups', 'Saklama politikasına göre siler', '0 4 * * *', 'backup'),
        JobSpec('comm_queue', 'İletişim kuyruğu', 'process_communication_queue', 'WhatsApp/SMS gönderim kuyruğu', '* * * * *', 'comm'),
        JobSpec('campaigns', 'Zamanlanmış kampanyalar', 'process_scheduled_campaigns', 'Kampanya onay/kuyruk', '*/5 * * * *', 'comm'),
        JobSpec('payment_reminders', 'Ödeme hatırlatmaları', 'send_payment_reminders', 'Taksit hatırlatma kuyruğu', '0 9 * * *', 'comm'),
        JobSpec('reminders', 'Takvim hatırlatmaları', 'process_reminders', 'Takvim bildirimleri', '* * * * *', 'system'),
        JobSpec('collect_metrics', 'Sistem metrik toplama', 'collect_system_metrics', 'CPU/RAM/disk örnekleri', '* * * * *', 'system'),
    ]
    for job in jobs:
        register_job(job)


_register_services()
_register_logs()
_register_health()
_register_jobs()
