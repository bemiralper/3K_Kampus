"""Yerel yedek depolama."""

from __future__ import annotations

import shutil
from pathlib import Path

from django.conf import settings


def local_root() -> Path:
    cfg = getattr(settings, 'BACKUP_CONFIG', {}) or {}
    root = Path(cfg.get('local_root') or (Path(settings.BASE_DIR) / 'private' / 'backups'))
    root.mkdir(parents=True, exist_ok=True)
    return root


def store_file(src: Path, storage_key: str) -> Path:
    dest = local_root() / storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    # Off-site replikasyon (opt-in; kapalıysa no-op).
    try:
        from apps.yedekleme.engine import remote
        remote.upload(storage_key, dest)
    except Exception:  # noqa: BLE001
        pass
    return dest


def fetch_file(storage_key: str) -> Path:
    path = local_root() / storage_key
    if not path.exists():
        # Yerel eksikse uzaktan (varsa) indirmeyi dene.
        try:
            from apps.yedekleme.engine import remote
            if remote.download(storage_key, path):
                return path
        except Exception:  # noqa: BLE001
            pass
        raise FileNotFoundError(storage_key)
    return path


def delete_file(storage_key: str) -> None:
    path = local_root() / storage_key
    if path.exists():
        path.unlink()
    parent = path.parent
    if parent != local_root() and parent.exists() and not any(parent.iterdir()):
        parent.rmdir()
    # Uzaktan da sil (opt-in; kapalıysa no-op).
    try:
        from apps.yedekleme.engine import remote
        remote.delete(storage_key)
    except Exception:  # noqa: BLE001
        pass
