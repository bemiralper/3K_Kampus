"""Faz 2 bulut sağlayıcı iskeletleri — henüz aktif değil."""

from apps.yedekleme.application.providers.remote_storage import RemoteStorageProvider


class S3RemoteStorageProvider(RemoteStorageProvider):
    def store(self, local_path: str, storage_key: str) -> str:
        raise NotImplementedError('S3RemoteStorageProvider Faz 2')

    def fetch(self, storage_key: str, local_path: str) -> None:
        raise NotImplementedError('S3RemoteStorageProvider Faz 2')

    def delete(self, storage_key: str) -> None:
        raise NotImplementedError('S3RemoteStorageProvider Faz 2')

    def exists(self, storage_key: str) -> bool:
        raise NotImplementedError('S3RemoteStorageProvider Faz 2')


class GCSRemoteStorageProvider(RemoteStorageProvider):
    def store(self, local_path: str, storage_key: str) -> str:
        raise NotImplementedError('GCSRemoteStorageProvider Faz 2')

    def fetch(self, storage_key: str, local_path: str) -> None:
        raise NotImplementedError('GCSRemoteStorageProvider Faz 2')

    def delete(self, storage_key: str) -> None:
        raise NotImplementedError('GCSRemoteStorageProvider Faz 2')

    def exists(self, storage_key: str) -> bool:
        raise NotImplementedError('GCSRemoteStorageProvider Faz 2')
