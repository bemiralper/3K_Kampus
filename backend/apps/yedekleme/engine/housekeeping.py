"""Gece temizliği: eski yedekler, operasyon logları, sohbet eki dosyaları."""

from __future__ import annotations

from apps.communication.application.attachment_retention import purge_expired_chat_files
from apps.sistem_yonetimi.services.data_retention import purge_operational_data
from apps.yedekleme.engine.retention import RetentionService


def run_housekeeping() -> dict:
    return {
        'backups': RetentionService().purge(),
        'operational': purge_operational_data(),
        'attachments': purge_expired_chat_files(),
    }
