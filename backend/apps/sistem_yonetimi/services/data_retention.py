"""Eski metrik, hata, denetim ve iletişim loglarını siler.

Yedek dosyasını şişiren asıl şey bu satırlar değil; yine de her gece birikirler
ve tam veritabanı dökümüne girerler. İş verisi (öğrenci, ödeme, sohbet metni)
burada silinmez.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.communication.domain.models import CommunicationLog, MessageStatusEvent, RawWebhookEvent
from apps.sistem_yonetimi.domain.models import (
    SystemAuditLog,
    SystemErrorEvent,
    SystemJobRun,
    SystemMetricSample,
    SystemTimelineEvent,
)
from apps.yedekleme.domain.models import BackupJob, BackupOperationLog, BackupStatus


def _days(key: str, default: int) -> int:
    cfg = getattr(settings, 'DATA_RETENTION', {}) or {}
    try:
        value = int(cfg.get(key, default))
    except (TypeError, ValueError):
        value = default
    return max(1, value)


def _cutoff(key: str, default: int):
    return timezone.now() - timedelta(days=_days(key, default))


def purge_operational_data() -> dict:
    counts: dict[str, int] = {}

    deleted, _ = SystemMetricSample.objects.filter(
        collected_at__lt=_cutoff('metric_days', 30),
    ).delete()
    counts['metrics'] = deleted

    deleted, _ = SystemErrorEvent.objects.filter(
        last_seen_at__lt=_cutoff('error_days', 30),
    ).delete()
    counts['errors'] = deleted

    deleted, _ = SystemTimelineEvent.objects.filter(
        created_at__lt=_cutoff('timeline_days', 30),
    ).delete()
    counts['timeline'] = deleted

    deleted, _ = SystemJobRun.objects.filter(
        created_at__lt=_cutoff('job_run_days', 30),
    ).exclude(status='running').delete()
    counts['job_runs'] = deleted

    deleted, _ = SystemAuditLog.objects.filter(
        created_at__lt=_cutoff('audit_days', 90),
    ).delete()
    counts['audit'] = deleted

    log_cutoff = _cutoff('communication_log_days', 30)
    deleted, _ = CommunicationLog.objects.filter(created_at__lt=log_cutoff).delete()
    counts['communication_logs'] = deleted
    deleted, _ = RawWebhookEvent.objects.filter(created_at__lt=log_cutoff).delete()
    counts['webhook_events'] = deleted

    # Durum satırı kalır (iletilen/okundu); ham Meta gövdesi gereksizdir.
    counts['status_payloads_cleared'] = MessageStatusEvent.objects.filter(
        created_at__lt=log_cutoff,
    ).exclude(raw_payload={}).update(raw_payload={})

    log_days_cutoff = _cutoff('backup_log_days', 30)
    deleted, _ = BackupOperationLog.objects.filter(created_at__lt=log_days_cutoff).delete()
    counts['backup_logs'] = deleted
    deleted, _ = BackupJob.objects.filter(
        started_at__lt=log_days_cutoff,
    ).exclude(status=BackupStatus.RUNNING).delete()
    counts['backup_jobs'] = deleted

    return counts
