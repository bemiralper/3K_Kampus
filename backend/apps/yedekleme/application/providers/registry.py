from apps.yedekleme.application.config import backup_root, encryption_provider_name, remote_provider_name
from apps.yedekleme.application.providers.cloud_stubs import GCSRemoteStorageProvider, S3RemoteStorageProvider
from apps.yedekleme.application.providers.encryption import EncryptionProvider, NoOpEncryptionProvider
from apps.yedekleme.application.providers.remote_storage import LocalRemoteStorageProvider, RemoteStorageProvider


def get_encryption_provider() -> EncryptionProvider:
    name = encryption_provider_name()
    if name in ('none', 'noop', ''):
        return NoOpEncryptionProvider()
    raise ValueError(f'Bilinmeyen encryption provider: {name}')


def get_remote_storage_provider() -> RemoteStorageProvider:
    name = remote_provider_name()
    if name in ('local', ''):
        return LocalRemoteStorageProvider(backup_root())
    if name == 's3':
        return S3RemoteStorageProvider()
    if name == 'gcs':
        return GCSRemoteStorageProvider()
    raise ValueError(f'Bilinmeyen remote storage provider: {name}')
