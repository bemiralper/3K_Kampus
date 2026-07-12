"""ZIP arşiv + SHA-256 yardımcıları."""

from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def write_checksums(root: Path, files: list[Path], checksums_name: str = 'checksums.sha256') -> Path:
    lines = []
    for f in files:
        rel = f.relative_to(root).as_posix()
        lines.append(f'{sha256_file(f)}  {rel}')
    out = root / checksums_name
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return out


def verify_checksums(root: Path, checksums_name: str = 'checksums.sha256') -> tuple[bool, list[str]]:
    path = root / checksums_name
    if not path.exists():
        return False, ['checksums.sha256 eksik']
    errors = []
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            errors.append(f'Geçersiz satır: {line}')
            continue
        expected, rel = parts
        target = root / rel.strip()
        if not target.exists():
            errors.append(f'Eksik dosya: {rel}')
            continue
        actual = sha256_file(target)
        if actual != expected:
            errors.append(f'Hash uyuşmazlığı: {rel}')
    return (len(errors) == 0), errors


def create_zip(source_dir: Path, zip_path: Path, *, compress: bool = True) -> Path:
    compression = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
    with zipfile.ZipFile(zip_path, 'w', compression=compression) as zf:
        for path in sorted(source_dir.rglob('*')):
            if path.is_file():
                zf.write(path, path.relative_to(source_dir).as_posix())
    return zip_path


def extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zf:
        zf.extractall(dest_dir)
    return dest_dir
