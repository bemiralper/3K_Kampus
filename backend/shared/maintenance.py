"""Deploy bakım modu — nginx flag dosyası veya LMS_MAINTENANCE env."""

from __future__ import annotations

import os
from pathlib import Path

from django.conf import settings


def maintenance_flag_path() -> Path:
    return Path(os.environ.get('LMS_MAINTENANCE_FLAG', '/var/lib/3k/maintenance.enable'))


def is_maintenance_mode() -> bool:
    if os.environ.get('LMS_MAINTENANCE', '').lower() in ('1', 'true', 'yes', 'on'):
        return True
    try:
        return maintenance_flag_path().is_file()
    except OSError:
        return False


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
