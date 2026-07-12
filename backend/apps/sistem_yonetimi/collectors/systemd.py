"""systemd / service status collectors."""

from __future__ import annotations

import shutil
import subprocess
from datetime import datetime, timezone


def _run(cmd: list[str], timeout: float = 5.0) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return proc.returncode, (proc.stdout or '').strip(), (proc.stderr or '').strip()
    except FileNotFoundError:
        return 127, '', 'command not found'
    except subprocess.TimeoutExpired:
        return 124, '', 'timeout'


def systemctl_available() -> bool:
    return bool(shutil.which('systemctl'))


def unit_status(unit: str) -> dict:
    if not systemctl_available():
        return {
            'unit': unit,
            'available': False,
            'active_state': 'unknown',
            'sub_state': '',
            'status': 'unknown',
            'message': 'systemctl yok (Docker veya macOS ortamı)',
            'pid': None,
            'memory_bytes': None,
            'uptime_sec': None,
            'active_enter_timestamp': None,
        }

    code, out, err = _run([
        'systemctl', 'show', unit,
        '--property=ActiveState,SubState,MainPID,MemoryCurrent,ActiveEnterTimestamp,FragmentPath',
        '--no-page',
    ])
    props: dict[str, str] = {}
    for line in (out or '').splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            props[k] = v

    active = props.get('ActiveState', 'unknown')
    status_map = {
        'active': 'up',
        'inactive': 'stopped',
        'failed': 'down',
        'activating': 'warn',
        'deactivating': 'warn',
    }
    pid = None
    try:
        raw_pid = int(props.get('MainPID') or 0)
        pid = raw_pid or None
    except ValueError:
        pid = None

    mem = None
    try:
        raw_mem = props.get('MemoryCurrent', '')
        if raw_mem and raw_mem not in ('[not set]', ''):
            mem = int(raw_mem)
    except ValueError:
        mem = None

    ts = props.get('ActiveEnterTimestamp') or ''
    uptime_sec = None
    if ts and ts not in ('n/a', ''):
        # e.g. "Mon 2026-07-12 09:00:00 UTC"
        try:
            # Prefer Epoch via systemctl PropertyActiveEnterTimestampMonotonic is hard; parse loosely
            parts = ts.split()
            if len(parts) >= 3:
                dt = datetime.strptime(' '.join(parts[1:3]), '%Y-%m-%d %H:%M:%S')
                dt = dt.replace(tzinfo=timezone.utc)
                uptime_sec = max(0, int((datetime.now(timezone.utc) - dt).total_seconds()))
        except Exception:
            uptime_sec = None

    return {
        'unit': unit,
        'available': True,
        'active_state': active,
        'sub_state': props.get('SubState', ''),
        'status': status_map.get(active, 'unknown'),
        'message': err if code != 0 and not out else '',
        'pid': pid,
        'memory_bytes': mem,
        'uptime_sec': uptime_sec,
        'active_enter_timestamp': ts or None,
    }


def tcp_probe(host: str, port: int, timeout: float = 1.5) -> bool:
    import socket
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False
