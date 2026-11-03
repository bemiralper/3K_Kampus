"""Cron kilit nabzı. İş öldürmez, kuyruk satırı silmez; yalnız uyarır."""

from __future__ import annotations

import os
from pathlib import Path


def cron_lock_health(*, state_dir: Path | None = None, now: float | None = None, stuck_seconds: int | None = None) -> dict:
    import time

    root = state_dir or Path(os.environ.get('LMS_CRON_STATE_DIR', '/var/log/lms/cron-state'))
    if not root.is_dir():
        return {
            'status': 'unknown',
            'message': 'Cron nabız dizini yok',
            'detail': {'state_dir': str(root)},
        }
    moment = time.time() if now is None else float(now)
    limit = int(stuck_seconds if stuck_seconds is not None else os.environ.get('LMS_CRON_STUCK_SECONDS', 15 * 60))
    stuck: list[str] = []
    seen = 0
    for skip in sorted(root.glob('*.skip')):
        name = skip.name[:-5]
        seen += 1
        try:
            skip_ts = float(skip.read_text(encoding='utf-8').split()[0])
        except (OSError, ValueError, IndexError):
            continue
        done = root / f'{name}.done'
        done_ts = 0.0
        if done.is_file():
            try:
                done_ts = float(done.read_text(encoding='utf-8').split()[0])
            except (OSError, ValueError, IndexError):
                done_ts = 0.0
        if done_ts and skip_ts < done_ts:
            continue
        held_for = moment - skip_ts
        if held_for > limit:
            stuck.append(name)
    if stuck:
        return {
            'status': 'warn',
            'message': 'Kilit uzun süredir tutuluyor: ' + ', '.join(stuck),
            'detail': {'stuck': stuck, 'stuck_seconds': limit},
        }
    return {
        'status': 'up',
        'message': 'Takılı cron kilidi yok',
        'detail': {'jobs': seen, 'stuck_seconds': limit},
    }
