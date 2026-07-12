"""Streaming / paginated log file reader — never load whole file."""

from __future__ import annotations

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

# Gunicorn / combined access log: ..."METHOD path HTTP/1.1" 200 1234
ACCESS_LOG_STATUS_RE = re.compile(r'"[A-Z]+\s+[^\"]*\s+HTTP/[\d.]+"\s+(\d{3})\b')


def detect_level(line: str, *, source_category: str | None = None) -> str:
    """
    Access log satırlarında seviye HTTP status'tan çıkarılır.
    Aksi halde keyword aranır; query string içindeki levels=ERROR yanlış pozitif üretmesin.
    """
    status_match = ACCESS_LOG_STATUS_RE.search(line)
    if status_match or (source_category or '') in ('api', 'gunicorn_access', 'access'):
        if status_match:
            code = int(status_match.group(1))
            if code >= 500:
                return 'ERROR'
            if code >= 400:
                return 'WARNING'
            return 'INFO'
        return 'INFO'

    # Tırnaklı request URI / query (levels=ERROR vb.) seviye tespitini bozmasın
    scrubbed = re.sub(r'"[^"]*"', ' ', line)
    scrubbed = re.sub(r'\blevels=[A-Za-z]+\b', ' ', scrubbed, flags=re.I)
    for pat, level in LEVEL_PATTERNS:
        if pat.search(scrubbed):
            return level
    return 'INFO'


def read_tail_lines(
    path: str | Path,
    *,
    max_lines: int = 200,
    max_bytes: int = 512_000,
    query: str = '',
    levels: set[str] | None = None,
    offset: int | None = None,
    source_category: str | None = None,
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
            if start > 0 and offset is None:
                nl = text.find('\n')
                if nl >= 0:
                    text = text[nl + 1:]
                    start = start + nl + 1
            cursor = start
            for line in text.splitlines(keepends=False):
                line_bytes = len(line.encode('utf-8', errors='replace')) + 1
                level = detect_level(line, source_category=source_category)
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
