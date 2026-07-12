"""Streaming / paginated log file reader — never load whole file."""

from __future__ import annotations

import os
import re
from pathlib import Path

from apps.sistem_yonetimi.collectors.explanations import explain_log_line

LEVEL_PATTERNS = [
    (re.compile(r'\bCRITICAL\b|\bFATAL\b', re.I), 'CRITICAL'),
    (re.compile(r'\bERROR\b|\bERR\b', re.I), 'ERROR'),
    (re.compile(r'\bWARNING\b|\bWARN\b', re.I), 'WARNING'),
    (re.compile(r'\bDEBUG\b', re.I), 'DEBUG'),
    (re.compile(r'\bINFO\b', re.I), 'INFO'),
]


def detect_level(line: str) -> str:
    for pat, level in LEVEL_PATTERNS:
        if pat.search(line):
            return level
    return 'INFO'


def _safe_path(path: str | Path, allowed_roots: list[Path]) -> Path | None:
    try:
        p = Path(path).resolve()
    except Exception:
        return None
    if not p.exists() or not p.is_file():
        return None
    for root in allowed_roots:
        try:
            p.relative_to(root.resolve())
            return p
        except ValueError:
            continue
    # Also allow exact registered paths even if parent isn't in roots
    return p if p.exists() else None


def read_tail_lines(
    path: str | Path,
    *,
    max_lines: int = 200,
    max_bytes: int = 512_000,
    query: str = '',
    levels: set[str] | None = None,
    offset: int | None = None,
) -> dict:
    """
    Read from end of file (or from offset).
    Returns {lines: [{text, level, offset}], next_offset, size, truncated}.
    """
    p = Path(path)
    if not p.exists() or not p.is_file():
        return {'lines': [], 'next_offset': 0, 'size': 0, 'truncated': False, 'error': 'Dosya yok'}

    size = p.stat().st_size
    start = 0 if offset is None else max(0, int(offset))
    if offset is None:
        start = max(0, size - max_bytes)

    lines_out = []
    truncated = start > 0 and offset is None
    try:
        with p.open('rb') as fh:
            fh.seek(start)
            raw = fh.read(max_bytes + 1)
            if len(raw) > max_bytes:
                truncated = True
                raw = raw[:max_bytes]
            text = raw.decode('utf-8', errors='replace')
            # If we started mid-file, drop first partial line
            if start > 0 and offset is None:
                nl = text.find('\n')
                if nl >= 0:
                    text = text[nl + 1:]
                    start = start + nl + 1
            cursor = start
            for line in text.splitlines(keepends=False):
                line_bytes = len(line.encode('utf-8', errors='replace')) + 1
                level = detect_level(line)
                if levels and level not in levels:
                    cursor += line_bytes
                    continue
                if query and query.lower() not in line.lower():
                    cursor += line_bytes
                    continue
                entry = {'text': line, 'level': level, 'offset': cursor}
                hint = explain_log_line(line)
                if hint:
                    entry['explanation'] = hint
                lines_out.append(entry)
                cursor += line_bytes
            next_offset = min(size, start + len(raw))
    except OSError as exc:
        return {'lines': [], 'next_offset': 0, 'size': size, 'truncated': False, 'error': str(exc)}

    if len(lines_out) > max_lines:
        lines_out = lines_out[-max_lines:]

    return {
        'lines': lines_out,
        'next_offset': next_offset,
        'size': size,
        'truncated': truncated,
        'path': str(p),
        'mtime': p.stat().st_mtime,
    }


def file_mtime_iso(path: str | Path) -> str | None:
    p = Path(path)
    if not p.exists():
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
