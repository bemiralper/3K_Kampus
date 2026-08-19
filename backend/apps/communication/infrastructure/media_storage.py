"""
İletişim medya dosyaları — public HTTPS URL (Meta link fallback) ve S3/R2 yükleme.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from urllib.parse import urljoin

from django.conf import settings
from django.core.files.storage import default_storage

logger = logging.getLogger(__name__)


def get_storage_backend() -> str:
    return getattr(settings, 'COMMUNICATION_MEDIA_STORAGE', 'local') or 'local'


def get_public_media_url(file_field) -> str | None:
    """
    Meta'nın fetch edebileceği public HTTPS URL döndür.

    local: COMMUNICATION_MEDIA_PUBLIC_BASE_URL + relative path
    s3: AWS_S3_PUBLIC_URL_BASE + key veya boto presigned/public URL
    """
    if not file_field:
        return None

    name = file_field.name if hasattr(file_field, 'name') else str(file_field)
    if not name:
        return None

    backend = get_storage_backend()
    if backend == 's3':
        base = getattr(settings, 'AWS_S3_PUBLIC_URL_BASE', '') or ''
        if base:
            return urljoin(base.rstrip('/') + '/', name.lstrip('/'))
        return _s3_public_url(name)

    public_base = getattr(settings, 'COMMUNICATION_MEDIA_PUBLIC_BASE_URL', '') or ''
    if public_base:
        return urljoin(public_base.rstrip('/') + '/', name.lstrip('/'))

    url = file_field.url if hasattr(file_field, 'url') else default_storage.url(name)
    if url.startswith('http://') or url.startswith('https://'):
        return url
    if url.startswith('/'):
        site_url = getattr(settings, 'SITE_URL', '') or ''
        if site_url:
            return urljoin(site_url.rstrip('/') + '/', url.lstrip('/'))
    return None


def ensure_public_upload(file_field, *, mime_type: str = '') -> str | None:
    """
    S3/R2 modunda dosyayı public bucket'a yükle (henüz yoksa).
    Public URL döndürür; local modda get_public_media_url sonucu.
    """
    if not file_field:
        return None

    name = file_field.name if hasattr(file_field, 'name') else str(file_field)
    if get_storage_backend() != 's3':
        return get_public_media_url(file_field)

    bucket = getattr(settings, 'AWS_S3_BUCKET', '') or ''
    if not bucket:
        return get_public_media_url(file_field)

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        logger.warning('boto3 missing — S3 upload skipped')
        return get_public_media_url(file_field)

    content_type = mime_type or mimetypes.guess_type(name)[0] or 'application/octet-stream'
    client_kwargs: dict = {}
    endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', '') or ''
    if endpoint:
        client_kwargs['endpoint_url'] = endpoint
    region = getattr(settings, 'AWS_S3_REGION', '') or 'auto'
    client_kwargs['region_name'] = region
    client_kwargs['config'] = Config(signature_version='s3v4')

    client = boto3.client(
        's3',
        aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', '') or None,
        aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', '') or None,
        **client_kwargs,
    )

    with default_storage.open(name, 'rb') as fh:
        client.upload_fileobj(
            fh,
            bucket,
            name,
            ExtraArgs={'ContentType': content_type, 'ACL': 'public-read'},
        )

    return get_public_media_url(file_field)


def _s3_public_url(key: str) -> str | None:
    bucket = getattr(settings, 'AWS_S3_BUCKET', '') or ''
    base = getattr(settings, 'AWS_S3_PUBLIC_URL_BASE', '') or ''
    if base:
        return urljoin(base.rstrip('/') + '/', key.lstrip('/'))
    endpoint = getattr(settings, 'AWS_S3_ENDPOINT_URL', '') or ''
    if bucket and endpoint:
        return f'{endpoint.rstrip("/")}/{bucket}/{key.lstrip("/")}'
    return None


def local_file_path(file_field) -> str | None:
    """Yerel dosya yolu — upload_media için."""
    if not file_field:
        return None
    name = file_field.name if hasattr(file_field, 'name') else str(file_field)
    try:
        if hasattr(file_field, 'path'):
            path = file_field.path
            if path and os.path.isfile(path):
                return path
    except (NotImplementedError, ValueError, OSError):
        pass
    try:
        if name and default_storage.exists(name):
            path = default_storage.path(name)
            if path and os.path.isfile(path):
                return path
    except (NotImplementedError, ValueError, OSError):
        pass
    return None


def materialize_local_file(file_field) -> tuple[str | None, bool]:
    """
    Upload için yerel yol. Storage uzaksa geçici dosyaya indirir.

    Dönüş: (path, is_temp) — is_temp ise çağıran silmeli.
    """
    import tempfile

    existing = local_file_path(file_field)
    if existing:
        return existing, False
    if not file_field:
        return None, False
    name = file_field.name if hasattr(file_field, 'name') else str(file_field)
    if not name:
        return None, False
    try:
        if not default_storage.exists(name):
            return None, False
        suffix = os.path.splitext(name)[1] or '.bin'
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        with default_storage.open(name, 'rb') as fh:
            tmp.write(fh.read())
        tmp.close()
        return tmp.name, True
    except (OSError, ValueError):
        logger.exception('Medya geçici dosyaya yazılamadı name=%s', name)
        return None, False
