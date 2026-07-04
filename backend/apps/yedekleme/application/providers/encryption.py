from abc import ABC, abstractmethod


class EncryptionProvider(ABC):
    @abstractmethod
    def encrypt(self, source_path: str, dest_path: str) -> None:
        pass

    @abstractmethod
    def decrypt(self, source_path: str, dest_path: str) -> None:
        pass


class NoOpEncryptionProvider(EncryptionProvider):
    def encrypt(self, source_path: str, dest_path: str) -> None:
        import shutil
        shutil.copy2(source_path, dest_path)

    def decrypt(self, source_path: str, dest_path: str) -> None:
        import shutil
        shutil.copy2(source_path, dest_path)
