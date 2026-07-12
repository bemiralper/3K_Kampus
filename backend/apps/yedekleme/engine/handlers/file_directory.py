"""Dosya/klasör kaynak handler'ı."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from django.conf import settings

from apps.yedekleme.engine.handlers.base import (
    DryRunReport,
    ExportResult,
    RestoreAnalysis,
    RestoreResult,
)


def _resolve_source_path(config: dict) -> Path | None:
    relative_to = (config or {}).get('relative_to') or 'media'
    path = (config or {}).get('path') or ''
    if relative_to == 'media':
        base = Path(settings.MEDIA_ROOT)
    elif relative_to == 'log_dir':
        log_dir = getattr(settings, 'LOG_DIR', None)
        if not log_dir:
            return None
        base = Path(log_dir)
    elif relative_to == 'absolute':
        return Path(path) if path else None
    else:
        base = Path(settings.BASE_DIR) / relative_to
    return (base / path).resolve() if path else base.resolve()


def _should_exclude(name: str, patterns: list[str]) -> bool:
    import fnmatch
    return any(fnmatch.fnmatch(name, p) for p in patterns)


class FileDirectoryHandler:
    key = 'file_directory'

    def export(self, resource, work_dir: Path, log) -> ExportResult:
        work_dir.mkdir(parents=True, exist_ok=True)
        src = _resolve_source_path(resource.config or {})
        exclude = list(
            (resource.config or {}).get('exclude_patterns')
            or settings.BACKUP_CONFIG.get('exclude_patterns')
            or []
        )
        files_meta = []
        total = 0
        dest_root = work_dir / 'files'
        if src is None or not src.exists():
            meta = {'missing': True, 'source': str(src) if src else None}
            (work_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
            log.info('file_directory.missing', resource=resource.code, source=str(src))
            return ExportResult(files=['meta.json'], meta=meta, bytes_written=0)

        dest_root.mkdir(parents=True, exist_ok=True)
        for path in src.rglob('*'):
            if path.is_dir():
                continue
            rel = path.relative_to(src)
            if any(_should_exclude(part, exclude) for part in rel.parts):
                continue
            target = dest_root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            size = target.stat().st_size
            total += size
            files_meta.append({'path': str(rel).replace('\\', '/'), 'size': size})
        meta = {
            'source': str(src),
            'file_count': len(files_meta),
            'files': files_meta[:5000],
        }
        (work_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
        log.info('file_directory.exported', count=len(files_meta), bytes=total)
        return ExportResult(files=['files', 'meta.json'], meta=meta, bytes_written=total)

    def analyze_restore(self, resource, payload_dir: Path) -> RestoreAnalysis:
        meta_path = payload_dir / 'meta.json'
        files_dir = payload_dir / 'files'
        if not meta_path.exists():
            return RestoreAnalysis(resource_code=resource.code, present=False, missing_files=['meta.json'])
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        missing = []
        if meta.get('missing'):
            return RestoreAnalysis(
                resource_code=resource.code,
                present=False,
                incompatibilities=['Kaynak dizin yedek anında yoktu'],
                details=meta,
            )
        size = 0
        if files_dir.exists():
            for p in files_dir.rglob('*'):
                if p.is_file():
                    size += p.stat().st_size
        else:
            missing.append('files/')
        dest = _resolve_source_path(resource.config or {})
        conflicts = []
        if dest and dest.exists():
            conflicts.append(f'Hedef dizin mevcut dosyaların üzerine yazılacak: {dest}')
        return RestoreAnalysis(
            resource_code=resource.code,
            present=not missing,
            size_bytes=size,
            estimated_seconds=max(1.0, size / (10 * 1024 * 1024)),
            missing_files=missing,
            conflicts=conflicts,
            details=meta,
        )

    def dry_run(self, resource, payload_dir: Path) -> DryRunReport:
        analysis = self.analyze_restore(resource, payload_dir)
        meta = analysis.details or {}
        backup_files = {f['path'] for f in meta.get('files') or []}
        dest = _resolve_source_path(resource.config or {})
        existing = set()
        if dest and dest.exists():
            for p in dest.rglob('*'):
                if p.is_file():
                    existing.add(str(p.relative_to(dest)).replace('\\', '/'))
        to_add = len(backup_files - existing)
        to_replace = len(backup_files & existing)
        to_delete = 0  # replace strategy does not delete extras by default
        return DryRunReport(
            resource_code=resource.code,
            files_to_add=to_add,
            files_to_replace=to_replace,
            files_to_delete=to_delete,
            notes=['Dosya restore: yedekteki dosyalar hedefe kopyalanır (üzerine yazma).'],
            details={'backup_file_count': len(backup_files), 'existing_count': len(existing)},
        )

    def restore(self, resource, payload_dir: Path, *, dry_run: bool = False) -> RestoreResult:
        if dry_run:
            report = self.dry_run(resource, payload_dir)
            return RestoreResult(ok=True, message='dry-run', meta={'dry_run': report.__dict__})
        files_dir = payload_dir / 'files'
        dest = _resolve_source_path(resource.config or {})
        if dest is None:
            return RestoreResult(ok=False, message='Hedef path çözülemedi')
        if not files_dir.exists():
            return RestoreResult(ok=False, message='files/ eksik')
        dest.mkdir(parents=True, exist_ok=True)
        count = 0
        for path in files_dir.rglob('*'):
            if path.is_dir():
                continue
            rel = path.relative_to(files_dir)
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            count += 1
        return RestoreResult(ok=True, message=f'{count} dosya geri yüklendi', meta={'files': count})
