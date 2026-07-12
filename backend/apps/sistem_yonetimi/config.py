"""Sistem Yönetimi runtime config (settings + env)."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings


def get_config() -> dict:
    cfg = getattr(settings, 'SISTEM_YONETIMI', None) or {}
    base = Path(getattr(settings, 'BASE_DIR', Path('.')))
    backup_root = Path((getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('local_root') or (base / 'private' / 'backups'))
    media_root = Path(getattr(settings, 'MEDIA_ROOT', base / 'media'))
    log_dir = Path(cfg.get('log_dir') or '/var/log/lms')
    return {
        'ops_enabled': bool(cfg.get('ops_enabled', True)),
        'helper_path': cfg.get('helper_path') or '/usr/local/sbin/lms-systemctl-helper',
        'log_dir': log_dir,
        'paths': {
            'media': media_root,
            'uploads': media_root / 'uploads' if (media_root / 'uploads').exists() else media_root,
            'backups': backup_root,
            'logs': log_dir,
            'exports': Path(cfg.get('exports_dir') or (base / 'private' / 'exports')),
            'temp': Path(cfg.get('temp_dir') or (base / 'private' / 'tmp')),
            'staticfiles': Path(getattr(settings, 'STATIC_ROOT', base / 'staticfiles')),
        },
        'services': list(cfg.get('services') or [
            {'code': 'postgresql', 'unit': 'postgresql', 'label': 'PostgreSQL'},
            {'code': 'nginx', 'unit': 'nginx', 'label': 'Nginx'},
            {'code': 'lms-backend', 'unit': 'lms-backend', 'label': 'Gunicorn (lms-backend)'},
            {'code': 'lms-frontend', 'unit': 'lms-frontend', 'label': 'Next.js (lms-frontend)'},
        ]),
        'docker_mode': bool(cfg.get('docker_mode', False)),
    }
