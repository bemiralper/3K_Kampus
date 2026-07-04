from abc import ABC, abstractmethod
from pathlib import Path


class RemoteStorageProvider(ABC):
    @abstractmethod
    def store(self, local_path: str, storage_key: str) -> str:
        """Dosyayı uzak depoya yükler; storage_key döner."""

    @abstractmethod
    def fetch(self, storage_key: str, local_path: str) -> None:
        """Uzak depodan yerel dosyaya indirir."""

    @abstractmethod
    def delete(self, storage_key: str) -> None:
        pass

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        pass


class LocalRemoteStorageProvider(RemoteStorageProvider):
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _full_path(self, storage_key: str) -> Path:
        return self.root / storage_key

    def store(self, local_path: str, storage_key: str) -> str:
        dest = self._full_path(storage_key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.copy2(local_path, dest)
        return storage_key

    def fetch(self, storage_key: str, local_path: str) -> None:
        import shutil
        shutil.copy2(self._full_path(storage_key), local_path)

    def delete(self, storage_key: str) -> None:
        path = self._full_path(storage_key)
        if path.exists():
            path.unlink()

    def exists(self, storage_key: str) -> bool:
        return self._full_path(storage_key).exists()
