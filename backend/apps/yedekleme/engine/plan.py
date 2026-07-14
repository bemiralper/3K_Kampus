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


def order_restore_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tam DB restore'ta dosya/medya kaynaklarını pg_restore'tan ÖNCE uygula.

    pg_restore django_session ve job kayıtlarını siler; HTTP worker/oturum
    bozulunca medya adımı atlanabiliyordu.
    """
    if not any(entry_is_full_database(e) for e in entries):
        return list(entries)

    def _rank(entry: dict[str, Any]) -> tuple[int, int]:
        if entry_is_full_database(entry):
            return (2, entry_priority(entry, lambda _e: 100))
        handler = entry.get('handler') or ''
        if handler in ('file_directory', 'media'):
            return (0, entry_priority(entry, lambda _e: 100))
        return (1, entry_priority(entry, lambda _e: 100))

    return sorted(entries, key=_rank)


def entry_priority(entry: dict[str, Any], fallback: Callable[[dict[str, Any]], int]) -> int:
    raw = entry.get('priority')
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    return fallback(entry)
