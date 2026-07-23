"""Deploy bakım modu — nginx flag dosyası veya LMS_MAINTENANCE env."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from django.conf import settings


class MaintenanceControlError(Exception):
    """Bakım modu flag/nginx işlemi başarısız."""


def maintenance_flag_path() -> Path:
    return Path(os.environ.get('LMS_MAINTENANCE_FLAG', '/var/lib/3k/maintenance.enable'))


def is_maintenance_mode() -> bool:
    if os.environ.get('LMS_MAINTENANCE', '').lower() in ('1', 'true', 'yes', 'on'):
        return True
    try:
        return maintenance_flag_path().is_file()
    except OSError:
        return False


def nginx_maintenance_snippet_installed() -> bool:
    snippet = Path('/etc/nginx/snippets/lms-maintenance.conf')
    if snippet.is_file():
        return True
    for site_path in (
        Path('/etc/nginx/sites-available/lms'),
        Path('/etc/nginx/sites-enabled/lms'),
    ):
        if not site_path.is_file():
            continue
        try:
            text = site_path.read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        if 'lms-maintenance' in text or 'maintenance.enable' in text:
            return True
    return False


def maintenance_status() -> dict:
    flag_path = maintenance_flag_path()
    env_override = os.environ.get('LMS_MAINTENANCE', '').lower() in ('1', 'true', 'yes', 'on')
    flag_exists = False
    flag_writable = False
    try:
        flag_exists = flag_path.is_file()
        parent = flag_path.parent
        flag_writable = os.access(parent, os.W_OK) or (
            flag_path.exists() and os.access(flag_path, os.W_OK)
        )
    except OSError:
        pass
    return {
        'enabled': is_maintenance_mode(),
        'env_override': env_override,
        'flag_path': str(flag_path),
        'flag_exists': flag_exists,
        'flag_writable': flag_writable,
        'nginx_snippet_installed': nginx_maintenance_snippet_installed(),
        'can_control': flag_writable and not env_override,
    }


def _reload_nginx() -> tuple[bool, str | None]:
    if not shutil.which('nginx'):
        return False, 'nginx komutu bulunamadı'
    test = subprocess.run(['nginx', '-t'], capture_output=True, text=True, timeout=30)
    if test.returncode != 0:
        return False, (test.stderr or test.stdout or 'nginx -t başarısız').strip()[:500]
    if shutil.which('systemctl'):
        proc = subprocess.run(['systemctl', 'reload', 'nginx'], capture_output=True, text=True, timeout=30)
    else:
        proc = subprocess.run(['nginx', '-s', 'reload'], capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or f'nginx reload exit {proc.returncode}')[:500]
    return True, None


def set_maintenance_enabled(enabled: bool, *, reload_nginx: bool = True) -> dict:
    if os.environ.get('LMS_MAINTENANCE', '').lower() in ('1', 'true', 'yes', 'on'):
        raise MaintenanceControlError(
            'LMS_MAINTENANCE ortam değişkeni aktif — flag dosyası devre dışı. '
            'Önce /etc/lms/env içindeki LMS_MAINTENANCE değerini kaldırın.'
        )

    path = maintenance_flag_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if enabled:
            path.touch()
        else:
            path.unlink(missing_ok=True)
    except OSError as exc:
        raise MaintenanceControlError(
            f'Bakım modu dosyası yazılamadı ({path}): {exc}'
        ) from exc

    nginx_reloaded = False
    nginx_error = None
    if reload_nginx:
        nginx_reloaded, nginx_error = _reload_nginx()

    status = maintenance_status()
    status['nginx_reloaded'] = nginx_reloaded
    status['nginx_reload_error'] = nginx_error
    return status


def maintenance_html_path() -> Path:
    custom = os.environ.get('LMS_MAINTENANCE_HTML')
    if custom:
        return Path(custom)
    base = Path(getattr(settings, 'BASE_DIR', Path.cwd()))
    candidates = [
        base.parent / 'deploy' / 'maintenance.html',
        Path('/var/www/lms/deploy/maintenance.html'),
    ]
    for path in candidates:
        if path.is_file():
            return path
    return candidates[0]
