"""Storage / directory size collectors."""

from __future__ import annotations

import os
from pathlib import Path


def disk_usage_root(path: str | Path = '/') -> dict:
    try:
        usage = os.statvfs(path)
        total = usage.f_frsize * usage.f_blocks
        free = usage.f_frsize * usage.f_bavail
        used = total - free
        percent = round((used / total) * 100, 2) if total else 0
        return {
            'path': str(path),
            'total_bytes': total,
            'used_bytes': used,
            'free_bytes': free,
            'percent': percent,
        }
    except OSError as exc:
        return {'path': str(path), 'error': str(exc)}


def dir_size(path: Path, *, max_files: int = 50_000) -> tuple[int, int]:
    """Return (bytes, file_count); stop after max_files for safety."""
    total = 0
    count = 0
    if not path.exists():
        return 0, 0
    try:
        if path.is_file():
            return path.stat().st_size, 1
        for root, dirs, files in os.walk(path, followlinks=False):
            # skip heavy / sensitive
            dirs[:] = [d for d in dirs if d not in {'.git', 'node_modules', '__pycache__', '.venv', 'venv'}]
            for name in files:
                count += 1
                if count > max_files:
                    return total, count
                try:
                    total += (Path(root) / name).stat().st_size
                except OSError:
                    continue
    except OSError:
        return total, count
    return total, count


def folder_breakdown(paths: dict[str, Path]) -> list[dict]:
    items = []
    for key, path in paths.items():
        size, count = dir_size(path)
        items.append({
            'key': key,
            'path': str(path),
            'exists': path.exists(),
            'size_bytes': size,
            'file_count': count,
        })
    items.sort(key=lambda x: x['size_bytes'], reverse=True)
    return items


def largest_subdirs(root: Path, *, limit: int = 15) -> list[dict]:
    if not root.exists() or not root.is_dir():
        return []
    rows = []
    try:
        for child in root.iterdir():
            if not child.is_dir():
                continue
            size, count = dir_size(child, max_files=20_000)
            rows.append({'path': str(child), 'name': child.name, 'size_bytes': size, 'file_count': count})
    except OSError:
        return []
    rows.sort(key=lambda x: x['size_bytes'], reverse=True)
    return rows[:limit]
