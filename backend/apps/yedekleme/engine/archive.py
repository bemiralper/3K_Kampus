"""ZIP arşiv + SHA-256 yardımcıları."""

from __future__ import annotations

import hashlib
import shutil
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


# Zaten sıkıştırılmış içerik — tekrar DEFLATE etmek boşa CPU harcar.
_PRECOMPRESSED_SUFFIXES = {
    '.dump', '.gz', '.tgz', '.zip', '.enc', '.bz2', '.xz', '.zst',
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.mp4', '.mov', '.woff2',
}


def create_zip(source_dir: Path, zip_path: Path, *, compress: bool = True) -> Path:
    default_compression = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
    with zipfile.ZipFile(zip_path, 'w', compression=default_compression) as zf:
        for path in sorted(source_dir.rglob('*')):
            if not path.is_file():
                continue
            arcname = path.relative_to(source_dir).as_posix()
            # Zaten sıkıştırılmış dosyaları STORED yaz (çift sıkıştırmayı önle).
            if compress and path.suffix.lower() in _PRECOMPRESSED_SUFFIXES:
                zf.write(path, arcname, compress_type=zipfile.ZIP_STORED)
            else:
                zf.write(path, arcname)
    return zip_path


class UnsafeArchiveError(Exception):
    """Zip Slip / path traversal içeren güvensiz arşiv."""


def _is_within_directory(base: Path, target: Path) -> bool:
    try:
        base_resolved = base.resolve()
        target_resolved = target.resolve()
    except OSError:
        return False
    return base_resolved == target_resolved or base_resolved in target_resolved.parents


def extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    """ZIP arşivini güvenli biçimde çıkarır (Zip Slip / path traversal koruması).

    Her giriş, hedef dizinin içine düşmelidir; mutlak yol, `..` çıkışı veya
    hedef dışına yazan girişler reddedilir. Sembolik bağlantı girişleri atlanır.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_root = dest_dir.resolve()
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in zf.infolist():
            name = info.filename
            # Mutlak yol veya sürücü kökü içeren girişleri reddet
            if name.startswith('/') or name.startswith('\\') or (len(name) > 1 and name[1] == ':'):
                raise UnsafeArchiveError(f'Güvensiz arşiv girişi (mutlak yol): {name}')
            target = (dest_root / name)
            if not _is_within_directory(dest_root, target if info.is_dir() else target.parent):
                raise UnsafeArchiveError(f'Güvensiz arşiv girişi (path traversal): {name}')
            # Sembolik bağlantıları atla (üst 4 bit = dosya tipi; 0xA000 = symlink)
            mode = info.external_attr >> 16
            if mode and (mode & 0o170000) == 0o120000:
                continue
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, 'r') as src, target.open('wb') as out:
                shutil.copyfileobj(src, out)
    return dest_dir
