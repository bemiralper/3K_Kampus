"""Debug session tracing — remove after verification."""
from __future__ import annotations

import json
import time

_LOG_PATH = '/Users/taner/Documents/3k-kampus-lms-main-2/.cursor/debug-14d3de.log'
_SESSION = '14d3de'


def debug_trace(
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict | None = None,
    *,
    run_id: str = 'pre-fix',
) -> None:
    # #region agent log
    try:
        payload = {
            'sessionId': _SESSION,
            'hypothesisId': hypothesis_id,
            'location': location,
            'message': message,
            'data': data or {},
            'timestamp': int(time.time() * 1000),
            'runId': run_id,
        }
        with open(_LOG_PATH, 'a', encoding='utf-8') as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + '\n')
    except Exception:
        pass
    # #endregion


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ''
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) <= 4:
        return '****'
    return f'***{digits[-4:]}'
