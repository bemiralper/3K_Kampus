"""Yerel yedek depolama."""

from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path

from django.conf import settings


def local_root() -> Path:
    cfg = getattr(settings, 'BACKUP_CONFIG', {}) or {}
    root = Path(cfg.get('local_root') or (Path(settings.BASE_DIR) / 'private' / 'backups'))
    root.mkdir(parents=True, exist_ok=True)
    return root


def _apply_storage_mode(path: Path) -> None:
    """Cron (lms) ve gunicorn aynı grupta dosyayı okuyup silebilsin."""
    try:
        path.chmod(0o775 if path.is_dir() else 0o664)
    except OSError:
        pass


def _ensure_removable(path: Path) -> None:
    if not path.exists():
        return
    try:
        mode = path.stat().st_mode
        path.chmod(mode | stat.S_IWUSR | stat.S_IWGRP)
    except OSError:
        pass


def store_file(src: Path, storage_key: str) -> Path:
    dest = local_root() / storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    _apply_storage_mode(dest.parent)
    shutil.copy2(src, dest)
    _apply_storage_mode(dest)
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
                _apply_storage_mode(path)
                return path
        except Exception:  # noqa: BLE001
            pass
        raise FileNotFoundError(storage_key)
    return path


def _try_rmdir_empty(path: Path, stop_at: Path) -> None:
    current = path
    while current != stop_at and current.exists():
        try:
            if any(current.iterdir()):
                break
            _ensure_removable(current)
            current.rmdir()
        except OSError:
            break
        current = current.parent


def delete_file(storage_key: str) -> None:
    root = local_root()
    path = root / storage_key
    if path.exists():
        _ensure_removable(path)
        try:
            path.unlink()
        except PermissionError as exc:
            raise PermissionError(
                f'Yedek dosyası silinemedi ({path}): '
                f'BACKUP_LOCAL_ROOT ({root}) sahibi uygulama kullanıcısı (lms) olmalı. '
                f'Sunucuda: sudo chown -R lms:www-data {root}'
            ) from exc
    _try_rmdir_empty(path.parent, root)
    # Uzaktan da sil (opt-in; kapalıysa no-op).
    try:
        from apps.yedekleme.engine import remote
        remote.delete(storage_key)
    except Exception:  # noqa: BLE001
        pass
