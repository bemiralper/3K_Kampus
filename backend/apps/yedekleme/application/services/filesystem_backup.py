import fnmatch
import os
from pathlib import Path

from apps.yedekleme.application.config import exclude_patterns, file_roots


class FilesystemBackupService:
    def collect(self, dest_dir: Path) -> dict:
        dest_dir.mkdir(parents=True, exist_ok=True)
        excludes = exclude_patterns()
        roots_info = []
        total_bytes = 0
        file_count = 0

        for idx, root in enumerate(file_roots()):
            root_path = Path(root)
            if not root_path.exists():
                roots_info.append({'path': str(root_path), 'exists': False, 'files': 0, 'bytes': 0})
                continue
            label = root_path.name or f'root_{idx}'
            target = dest_dir / label
            target.mkdir(parents=True, exist_ok=True)
            copied_bytes = 0
            copied_files = 0
            for dirpath, dirnames, filenames in os.walk(root_path):
                dirnames[:] = [d for d in dirnames if not self._excluded(d, excludes)]
                rel_base = Path(dirpath).relative_to(root_path)
                for fname in filenames:
                    if self._excluded(fname, excludes):
                        continue
                    src = Path(dirpath) / fname
                    rel = rel_base / fname
                    dst = target / rel
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    import shutil
                    shutil.copy2(src, dst)
                    size = src.stat().st_size
                    copied_bytes += size
                    copied_files += 1
            total_bytes += copied_bytes
            file_count += copied_files
            roots_info.append({
                'path': str(root_path),
                'exists': True,
                'label': label,
                'files': copied_files,
                'bytes': copied_bytes,
            })
        return {'roots': roots_info, 'total_bytes': total_bytes, 'file_count': file_count}

    @staticmethod
    def _excluded(name: str, patterns: list) -> bool:
        return any(fnmatch.fnmatch(name, pat) for pat in patterns)
