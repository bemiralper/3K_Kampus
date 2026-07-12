"""Configuration snapshot handler."""

from __future__ import annotations

import json
from pathlib import Path

from django.conf import settings

from apps.yedekleme.engine.handlers.base import (
    DryRunReport,
    ExportResult,
    RestoreAnalysis,
    RestoreResult,
)


def _safe_setting(key: str):
    val = getattr(settings, key, None)
    if hasattr(val, 'as_posix'):
        return str(val)
    if isinstance(val, dict):
        out = {}
        for k, v in val.items():
            if hasattr(v, 'as_posix'):
                out[k] = str(v)
            elif isinstance(v, (list, tuple)):
                out[k] = [str(i) if hasattr(i, 'as_posix') else i for i in v]
            else:
                out[k] = v
        return out
    if isinstance(val, (list, tuple)):
        return [str(i) if hasattr(i, 'as_posix') else i for i in val]
    try:
        json.dumps(val)
        return val
    except TypeError:
        return str(val)


class ConfigurationHandler:
    key = 'configuration'

    def export(self, resource, work_dir: Path, log) -> ExportResult:
        work_dir.mkdir(parents=True, exist_ok=True)
        keys = (resource.config or {}).get('keys') or []
        snapshot = {k: _safe_setting(k) for k in keys}
        path = work_dir / 'settings.json'
        path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False, default=str), encoding='utf-8')
        meta = {'keys': keys, 'count': len(keys)}
        (work_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
        log.info('configuration.exported', keys=len(keys))
        return ExportResult(
            files=['settings.json', 'meta.json'],
            meta=meta,
            bytes_written=path.stat().st_size,
        )

    def analyze_restore(self, resource, payload_dir: Path) -> RestoreAnalysis:
        path = payload_dir / 'settings.json'
        if not path.exists():
            return RestoreAnalysis(
                resource_code=resource.code,
                present=False,
                missing_files=['settings.json'],
            )
        data = json.loads(path.read_text(encoding='utf-8'))
        return RestoreAnalysis(
            resource_code=resource.code,
            present=True,
            size_bytes=path.stat().st_size,
            estimated_seconds=1.0,
            incompatibilities=[
                'Configuration restore runtime settings dosyasına yazmaz; yalnızca snapshot olarak saklanır.',
            ],
            details={'keys': list(data.keys())},
        )

    def dry_run(self, resource, payload_dir: Path) -> DryRunReport:
        analysis = self.analyze_restore(resource, payload_dir)
        return DryRunReport(
            resource_code=resource.code,
            notes=[
                'Ayar kaynakları bilgilendirme amaçlıdır; otomatik Django settings override yapılmaz.',
            ],
            details=analysis.details,
        )

    def restore(self, resource, payload_dir: Path, *, dry_run: bool = False) -> RestoreResult:
        # Settings are not hot-patched into Django; snapshot is informational.
        report = self.dry_run(resource, payload_dir)
        return RestoreResult(
            ok=True,
            message='configuration snapshot incelendi (runtime apply yok)',
            meta={'dry_run': report.__dict__} if dry_run else report.details,
        )
