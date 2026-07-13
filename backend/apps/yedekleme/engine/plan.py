"""Restore / export plan helpers — full dump vs table mutual exclusion."""

from __future__ import annotations

from typing import Any, Callable


def entry_is_full_database(entry: dict[str, Any]) -> bool:
    return entry.get('handler') == 'database_full' or entry.get('code') == 'system.database'


def manifest_has_full_database(manifest: dict[str, Any] | None) -> bool:
    if not manifest:
        return False
    return any(entry_is_full_database(e) for e in (manifest.get('resources') or []))


def filter_restore_entries(
    entries: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Tam dump varken tablo-seviye database_table kaynaklarını atla.

    pg_restore --clean sonrası TRUNCATE+INSERT, dump'ı boş/eksik JSONL ile ezer.
    """
    if not any(entry_is_full_database(e) for e in entries):
        return list(entries), []
    restore: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for entry in entries:
        if entry.get('handler') == 'database_table':
            skipped.append(entry)
        else:
            restore.append(entry)
    return restore, skipped


def entry_priority(entry: dict[str, Any], fallback: Callable[[dict[str, Any]], int]) -> int:
    raw = entry.get('priority')
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    return fallback(entry)
