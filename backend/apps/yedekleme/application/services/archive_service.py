import hashlib
import tarfile
from pathlib import Path


class ArchiveService:
    def create_archive(self, work_dir: Path, dest_path: Path) -> dict:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(dest_path, 'w:gz') as tar:
            for item in sorted(work_dir.iterdir()):
                tar.add(item, arcname=item.name)
        digest = self._sha256(dest_path)
        return {'path': str(dest_path), 'size_bytes': dest_path.stat().st_size, 'checksum': digest}

    def extract(self, archive_path: Path, dest_dir: Path) -> None:
        dest_dir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive_path, 'r:gz') as tar:
            tar.extractall(path=dest_dir)

    @staticmethod
    def _sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open('rb') as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                h.update(chunk)
        return h.hexdigest()
