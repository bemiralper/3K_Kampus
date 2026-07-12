"""Allowlisted service start/stop/restart via helper or systemctl."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from apps.sistem_yonetimi.config import get_config
from apps.sistem_yonetimi.registry import get_service
from apps.sistem_yonetimi.services.audit import write_audit, write_timeline


ALLOWED_ACTIONS = {'start', 'stop', 'restart'}


def control_service(code: str, action: str, *, user=None, request=None, confirm: str = '') -> dict:
    action = (action or '').lower().strip()
    if action not in ALLOWED_ACTIONS:
        raise ValueError('Geçersiz işlem')
    expected = {
        'start': 'BASLAT',
        'stop': 'DURDUR',
        'restart': 'YENIDEN_BASLAT',
    }[action]
    if (confirm or '').strip() != expected:
        raise ValueError(f'Onay metni hatalı. Beklenen: {expected}')

    svc = get_service(code)
    if not svc:
        raise ValueError('Servis allowlist dışında')

    cfg = get_config()
    if not cfg.get('ops_enabled'):
        raise ValueError('Ops işlemleri bu ortamda kapalı (SISTEM_YONETIMI.ops_enabled)')

    from apps.sistem_yonetimi.domain.models import SystemSettings
    if not SystemSettings.get_singleton().ops_enabled:
        raise ValueError('Ops işlemleri panel ayarlarından kapalı')

    helper = Path(cfg.get('helper_path') or '')
    if helper.exists() and os_access_exec(helper):
        # Prefer sudo when helper is root-owned executable
        if shutil.which('sudo'):
            cmd = ['sudo', '-n', str(helper), action, svc.unit]
        else:
            cmd = [str(helper), action, svc.unit]
    elif shutil.which('systemctl'):
        cmd = ['systemctl', action, svc.unit]
    else:
        raise ValueError('systemctl / helper yok — Docker veya yerel geliştirmede servis kontrolü desteklenmez')

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired as exc:
        raise ValueError('İşlem zaman aşımı') from exc

    ok = proc.returncode == 0
    write_audit(
        request=request,
        user=user,
        module='sistem_yonetimi',
        action=f'service_{action}',
        description=f'{svc.label} → {action}',
        metadata={'unit': svc.unit, 'returncode': proc.returncode, 'stdout': (proc.stdout or '')[:500]},
    )
    write_timeline(
        category='system',
        title=f'{svc.label} {action}',
        detail=(proc.stderr or proc.stdout or '')[:300],
        level='success' if ok else 'error',
        metadata={'unit': svc.unit},
    )
    if not ok:
        raise ValueError((proc.stderr or proc.stdout or f'exit {proc.returncode}')[:500])
    return {'ok': True, 'unit': svc.unit, 'action': action, 'output': (proc.stdout or '')[:1000]}


def os_access_exec(path: Path) -> bool:
    import os
    return os.access(path, os.X_OK)
