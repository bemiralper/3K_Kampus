from __future__ import annotations

import io
import threading
import time
from contextlib import redirect_stderr, redirect_stdout

from django.core.management import call_command
from django.utils import timezone

from apps.sistem_yonetimi.domain.models import JobRunStatus, SystemJobRun
from apps.sistem_yonetimi.registry import get_job
from apps.sistem_yonetimi.services.audit import write_audit, write_timeline


def list_jobs_with_runs() -> list[dict]:
    from apps.sistem_yonetimi.registry import all_jobs

    items = []
    for job in all_jobs():
        last = SystemJobRun.objects.filter(job_code=job.code).order_by('-created_at').first()
        items.append({
            'code': job.code,
            'label': job.label,
            'description': job.description,
            'command': job.command,
            'cron_hint': job.cron_hint,
            'category': job.category,
            'last_run': _run_json(last) if last else _observed_last_run(job.code),
        })
    return items


def _observed_last_run(job_code: str) -> dict | None:
    """Cron SystemJobRun yazmaz. Son gerçek iz (metrik, yedek veya log) gösterilir."""
    from apps.sistem_yonetimi.config import get_config

    seen_at = None
    message = 'Cron izi; görev tablosunda ayrı satır yok'
    if job_code == 'collect_metrics':
        from apps.sistem_yonetimi.domain.models import SystemMetricSample
        sample = SystemMetricSample.objects.order_by('-collected_at').only('collected_at').first()
        seen_at = sample.collected_at if sample else None
        message = 'Son metrik örneği'
    elif job_code == 'backup_run':
        try:
            from apps.yedekleme.domain.models import BackupArtifact, BackupStatus
            art = BackupArtifact.objects.filter(status=BackupStatus.COMPLETED).order_by('-finished_at').first()
            seen_at = art.finished_at if art else None
            message = art.filename if art else message
        except Exception:
            seen_at = None
    else:
        log_name = {
            'backup_purge': 'backups.log',
            'comm_queue': 'comm_queue.log',
            'olcme_publish': 'olcme_publish.log',
            'campaigns': 'comm_campaigns.log',
            'payment_reminders': 'comm_payment_reminders.log',
            'reminders': 'reminders.log',
        }.get(job_code)
        if log_name:
            path = get_config()['log_dir'] / log_name
            if path.is_file():
                from datetime import datetime, timezone
                seen_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
                message = f'{log_name} güncellendi'
    if not seen_at:
        return None
    iso = seen_at.isoformat()
    return {
        'id': None,
        'job_code': job_code,
        'status': 'completed',
        'started_at': None,
        'finished_at': iso,
        'duration_ms': None,
        'result_message': message,
        'output': '',
        'triggered_by_id': None,
        'created_at': iso,
    }


def _run_json(run: SystemJobRun) -> dict:
    return {
        'id': run.id,
        'job_code': run.job_code,
        'status': run.status,
        'started_at': run.started_at.isoformat() if run.started_at else None,
        'finished_at': run.finished_at.isoformat() if run.finished_at else None,
        'duration_ms': run.duration_ms,
        'result_message': run.result_message,
        'output': (run.output or '')[-4000:],
        'triggered_by_id': run.triggered_by_id,
        'created_at': run.created_at.isoformat() if run.created_at else None,
    }


def get_run(run_id: int) -> dict | None:
    try:
        run = SystemJobRun.objects.get(pk=run_id)
    except SystemJobRun.DoesNotExist:
        return None
    return _run_json(run)


def start_job(job_code: str, *, user=None, request=None) -> SystemJobRun:
    job = get_job(job_code)
    if not job:
        raise ValueError(f'Bilinmeyen görev: {job_code}')

    run = SystemJobRun.objects.create(
        job_code=job.code,
        status=JobRunStatus.RUNNING,
        started_at=timezone.now(),
        triggered_by=user,
        result_message='Başladı',
    )
    write_audit(
        request=request,
        user=user,
        module='sistem_yonetimi',
        action='job_run',
        description=f'Manuel görev: {job.label}',
        metadata={'job_code': job.code, 'run_id': run.id},
    )
    write_timeline(
        category='job',
        title=f'{job.label} başladı',
        detail=job.command,
        level='info',
        metadata={'run_id': run.id},
    )

    def _worker():
        buf = io.StringIO()
        t0 = time.monotonic()
        try:
            with redirect_stdout(buf), redirect_stderr(buf):
                call_command(job.command, **(job.options or {}))
            run.status = JobRunStatus.COMPLETED
            run.result_message = 'Tamamlandı'
            run.output = buf.getvalue()[-20000:]
            write_timeline(
                category='job',
                title=f'{job.label} tamamlandı',
                level='success',
                metadata={'run_id': run.id},
            )
        except Exception as exc:  # noqa: BLE001
            run.status = JobRunStatus.FAILED
            run.result_message = str(exc)[:500]
            run.output = (buf.getvalue() + '\n' + str(exc))[-20000:]
            write_timeline(
                category='job',
                title=f'{job.label} başarısız',
                detail=str(exc)[:500],
                level='error',
                metadata={'run_id': run.id},
            )
        finally:
            run.finished_at = timezone.now()
            run.duration_ms = int((time.monotonic() - t0) * 1000)
            run.save()

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return run
