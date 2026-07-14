"""Opsiyonel off-site (uzak) depolama replikasyonu — varsayılan kapalı.

Yerel disk her zaman birincil (source of truth) kalır. Uzak sağlayıcı
(`BACKUP_CONFIG['remote_provider'] == 's3'`) yapılandırıldığında yedekler
en iyi çabayla S3'e kopyalanır; yerel dosya eksikse S3'ten indirilir.

boto3 yalnızca gerektiğinde (lazy) import edilir; kurulu değilse uzak
replikasyon sessizce devre dışı kalır ve yerel akış hiç etkilenmez.
"""

from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings

logger = logging.getLogger('yedekleme.remote')


def _cfg() -> dict:
    return (getattr(settings, 'BACKUP_CONFIG', {}) or {})


def remote_enabled() -> bool:
    cfg = _cfg()
    return str(cfg.get('remote_provider') or 'local').lower() == 's3' and bool(cfg.get('s3_bucket'))


def _prefix() -> str:
    return (_cfg().get('s3_prefix') or '').strip('/')


def _remote_key(storage_key: str) -> str:
    prefix = _prefix()
    return f'{prefix}/{storage_key}' if prefix else storage_key


def _client():
    import boto3  # lazy — yalnızca uzak etkinken gerekli

    cfg = _cfg()
    kwargs = {}
    if cfg.get('s3_endpoint_url'):
        kwargs['endpoint_url'] = cfg['s3_endpoint_url']
    if cfg.get('s3_region'):
        kwargs['region_name'] = cfg['s3_region']
    if cfg.get('s3_access_key') and cfg.get('s3_secret_key'):
        kwargs['aws_access_key_id'] = cfg['s3_access_key']
        kwargs['aws_secret_access_key'] = cfg['s3_secret_key']
    return boto3.client('s3', **kwargs)


def upload(storage_key: str, local_path: Path) -> bool:
    """Yerel dosyayı uzağa kopyalar. Başarısızlıkta False (yedeği bozmaz)."""
    if not remote_enabled():
        return False
    try:
        _client().upload_file(str(local_path), _cfg()['s3_bucket'], _remote_key(storage_key))
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning('Uzak yükleme başarısız (%s): %s', storage_key, exc)
        return False


def download(storage_key: str, dest_path: Path) -> bool:
    """Uzaktan yerele indirir. Başarısızlıkta False."""
    if not remote_enabled():
        return False
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        _client().download_file(_cfg()['s3_bucket'], _remote_key(storage_key), str(dest_path))
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning('Uzak indirme başarısız (%s): %s', storage_key, exc)
        return False


def delete(storage_key: str) -> bool:
    if not remote_enabled():
        return False
    try:
        _client().delete_object(Bucket=_cfg()['s3_bucket'], Key=_remote_key(storage_key))
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning('Uzak silme başarısız (%s): %s', storage_key, exc)
        return False
