from django.conf import settings


def get_backup_config():
    return getattr(settings, 'BACKUP_CONFIG', {})


def backup_root():
    cfg = get_backup_config()
    return cfg.get('local_root', settings.BASE_DIR / 'private' / 'backups')


def file_roots():
    cfg = get_backup_config()
    return cfg.get('file_roots', [settings.MEDIA_ROOT])


def exclude_patterns():
    cfg = get_backup_config()
    return cfg.get('exclude_patterns', ['__pycache__', '*.pyc', '.DS_Store'])


def retention_policy():
    cfg = get_backup_config()
    return cfg.get('retention', {
        'daily': 7,
        'weekly': 4,
        'monthly': 12,
    })


def remote_provider_name():
    return get_backup_config().get('remote_provider', 'local')


def encryption_provider_name():
    return get_backup_config().get('encryption_provider', 'none')
