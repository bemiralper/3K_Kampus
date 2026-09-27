"""Eski sohbet eki dosyalarını diskten kaldırır.

Mesaj, dosya adı ve boyutu kalır; sohbette "saklama süresi doldu" görünür.
Doğum günü görsel havuzu yeniden kullanıldığı için silinmez.
Aynı dosyayı hâlâ kullanan yeni bir mesaj veya kampanya varsa dosya durur.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from apps.communication.domain.models import (
    BirthdayMediaAsset,
    CampaignAttachment,
    MessageAttachment,
)

_PURGE_PREFIXES = (
    'communication/attachments/',
    'communication/campaign_attachments/',
)


def _attachment_days() -> int:
    cfg = getattr(settings, 'DATA_RETENTION', {}) or {}
    try:
        days = int(cfg.get('chat_attachment_days', 90))
    except (TypeError, ValueError):
        days = 90
    return max(1, days)


def _names(qs) -> set[str]:
    return {name for name in qs if name}


def _referenced_names() -> set[str]:
    names: set[str] = set()
    names.update(_names(MessageAttachment.objects.exclude(file='').values_list('file', flat=True)))
    names.update(_names(CampaignAttachment.objects.exclude(file='').values_list('file', flat=True)))
    names.update(_names(BirthdayMediaAsset.objects.exclude(file='').values_list('file', flat=True)))
    return names


def _protected_names(cutoff) -> set[str]:
    """Silinmemesi gereken depolama yolları."""
    names: set[str] = set()
    names.update(_names(
        MessageAttachment.objects.exclude(file='').filter(created_at__gte=cutoff).values_list('file', flat=True)
    ))
    names.update(_names(
        CampaignAttachment.objects.exclude(file='').filter(created_at__gte=cutoff).values_list('file', flat=True)
    ))
    # Havuz görselleri yaştan bağımsız korunur.
    names.update(_names(BirthdayMediaAsset.objects.exclude(file='').values_list('file', flat=True)))
    return names


def _allowed(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _PURGE_PREFIXES)


def _delete_storage(path: str) -> bool:
    try:
        if default_storage.exists(path):
            default_storage.delete(path)
        return True
    except OSError:
        return False


def _prune_empty_dirs(base: Path) -> None:
    if not base.exists():
        return
    for dirpath, _dirnames, _filenames in os.walk(base, topdown=False):
        current = Path(dirpath)
        if current == base:
            continue
        try:
            if not any(current.iterdir()):
                current.rmdir()
        except OSError:
            continue


def purge_expired_chat_files(*, days: int | None = None, dry_run: bool = False) -> dict:
    keep_days = days if days is not None else _attachment_days()
    keep_days = max(1, int(keep_days))
    cutoff = timezone.now() - timedelta(days=keep_days)
    protected = _protected_names(cutoff)

    expired_paths = set(_names(
        MessageAttachment.objects.exclude(file='').filter(created_at__lt=cutoff).values_list('file', flat=True)
    ))
    expired_paths.update(_names(
        CampaignAttachment.objects.exclude(file='').filter(created_at__lt=cutoff).values_list('file', flat=True)
    ))
    expired_paths -= protected
    expired_paths = {path for path in expired_paths if _allowed(path)}

    removed: list[str] = []
    if dry_run:
        removed = sorted(expired_paths)
    else:
        for path in expired_paths:
            if _delete_storage(path):
                removed.append(path)
        if removed:
            MessageAttachment.objects.filter(file__in=removed).update(file='')
            CampaignAttachment.objects.filter(file__in=removed).update(file='')

    orphans = 0
    if not dry_run:
        orphans = _delete_orphan_files(cutoff, _referenced_names())

    return {
        'days': keep_days,
        'files_deleted': len(removed),
        'orphans_deleted': orphans,
        'dry_run': dry_run,
    }


def _delete_orphan_files(cutoff, referenced: set[str]) -> int:
    """Veritabanında kaydı kalmamış, süresi dolmuş ek dosyaları siler."""
    media_root = Path(settings.MEDIA_ROOT)
    cutoff_ts = cutoff.timestamp()
    deleted = 0
    for prefix in _PURGE_PREFIXES:
        base = media_root / prefix
        if not base.exists():
            continue
        for path in base.rglob('*'):
            if not path.is_file():
                continue
            try:
                if path.stat().st_mtime >= cutoff_ts:
                    continue
            except OSError:
                continue
            rel = path.relative_to(media_root).as_posix()
            if rel in referenced:
                continue
            try:
                path.unlink()
                deleted += 1
            except OSError:
                continue
        _prune_empty_dirs(base)
    return deleted
