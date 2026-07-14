"""Tam veritabanı dump/restore (pg_dump -Fc / pg_restore)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from django.conf import settings
from django.db import connections

from apps.yedekleme.engine.handlers.base import (
    DryRunReport,
    ExportResult,
    RestoreAnalysis,
    RestoreResult,
)
from apps.yedekleme.infrastructure.pg_tools import (
    pg_dump_binary,
    pg_dumpall_binary,
    pg_env,
    pg_restore_binary,
)


class DatabaseFullHandler:
    key = 'database_full'

    def _dump_globals(self, db: dict, work_dir: Path, log) -> str | None:
        """pg_dumpall --globals-only ile rolleri/tablespace'leri en iyi çabayla alır.

        Süperkullanıcı gerektirebilir; başarısız olursa yedeği BOZMAZ (None döner).
        Bilgilendirme amaçlıdır; database.dump restore'unu etkilemez.
        """
        out = work_dir / 'globals.sql'
        cmd = [
            pg_dumpall_binary(),
            '--globals-only',
            '--no-role-passwords',
            '-h', str(db.get('HOST') or 'localhost'),
            '-p', str(db.get('PORT') or '5432'),
            '-U', str(db.get('USER') or ''),
            '-f', str(out),
        ]
        try:
            proc = subprocess.run(cmd, env=pg_env(db), capture_output=True, text=True, timeout=120)
            if proc.returncode == 0 and out.exists():
                log.info('database_full.globals_done', size_bytes=out.stat().st_size)
                return 'globals.sql'
            log.info('database_full.globals_skip', error=(proc.stderr or '')[:200])
        except Exception as exc:  # noqa: BLE001
            log.info('database_full.globals_error', error=str(exc)[:200])
        if out.exists():
            try:
                out.unlink()
            except OSError:
                pass
        return None

    def export(self, resource, work_dir: Path, log) -> ExportResult:
        work_dir.mkdir(parents=True, exist_ok=True)
        out = work_dir / 'database.dump'
        db = settings.DATABASES['default']
        cmd = [
            pg_dump_binary(),
            '-Fc',
            '--no-owner',
            '--no-acl',
            '-h', str(db.get('HOST') or 'localhost'),
            '-p', str(db.get('PORT') or '5432'),
            '-U', str(db.get('USER') or ''),
            '-f', str(out),
            str(db.get('NAME') or ''),
        ]
        log.info('database_full.dump_started', resource=resource.code)
        proc = subprocess.run(cmd, env=pg_env(db), capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f'pg_dump failed: {proc.stderr or proc.stdout}')
        size = out.stat().st_size if out.exists() else 0
        files = ['database.dump', 'meta.json']

        # Opsiyonel: rol/tablespace globalleri (opt-in, en iyi çaba).
        cfg = resource.config or {}
        want_globals = bool(cfg.get('include_globals')) or bool(
            (getattr(settings, 'BACKUP_CONFIG', {}) or {}).get('dump_globals')
        )
        globals_file = self._dump_globals(db, work_dir, log) if want_globals else None
        if globals_file:
            files.insert(1, globals_file)

        meta = {
            'engine': 'postgresql',
            'format': 'custom',
            'size_bytes': size,
            'globals_included': bool(globals_file),
            'django_version': getattr(settings, 'DJANGO_VERSION_FOR_BACKUP', None) or '',
        }
        (work_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
        log.info('database_full.dump_done', size_bytes=size)
        return ExportResult(files=files, meta=meta, bytes_written=size)

    def analyze_restore(self, resource, payload_dir: Path) -> RestoreAnalysis:
        dump = payload_dir / 'database.dump'
        if not dump.exists():
            return RestoreAnalysis(
                resource_code=resource.code,
                present=False,
                missing_files=['database.dump'],
                incompatibilities=['Tam veritabanı dump dosyası eksik'],
            )
        size = dump.stat().st_size
        toc_tables: list[str] = []
        try:
            db = settings.DATABASES['default']
            proc = subprocess.run(
                [pg_restore_binary(), '-l', str(dump)],
                env=pg_env(db),
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode == 0:
                for line in proc.stdout.splitlines():
                    if 'TABLE DATA' in line or ' TABLE ' in line:
                        parts = line.split()
                        if parts:
                            toc_tables.append(parts[-1] if '.' not in parts[-1] else parts[-1])
        except Exception as exc:  # noqa: BLE001
            return RestoreAnalysis(
                resource_code=resource.code,
                present=True,
                size_bytes=size,
                estimated_seconds=max(5.0, size / (5 * 1024 * 1024)),
                incompatibilities=[f'TOC okunamadı: {exc}'],
                details={'toc_tables': []},
            )
        return RestoreAnalysis(
            resource_code=resource.code,
            present=True,
            size_bytes=size,
            estimated_seconds=max(5.0, size / (5 * 1024 * 1024)),
            conflicts=['Tam dump geri yükleme mevcut veritabanını --clean ile değiştirir'],
            details={'toc_table_count': len(toc_tables), 'toc_sample': toc_tables[:40]},
        )

    def dry_run(self, resource, payload_dir: Path) -> DryRunReport:
        analysis = self.analyze_restore(resource, payload_dir)
        tables = analysis.details.get('toc_sample') or []
        return DryRunReport(
            resource_code=resource.code,
            tables_changed=list(tables)[:100],
            notes=[
                'Tam dump dry-run: satır bazlı sayım yapılamaz; TOC analizi gösterilir.',
                'Gerçek restore pg_restore --clean --if-exists kullanır.',
            ],
            details=analysis.details,
        )

    def restore(self, resource, payload_dir: Path, *, dry_run: bool = False) -> RestoreResult:
        if dry_run:
            report = self.dry_run(resource, payload_dir)
            return RestoreResult(ok=True, message='dry-run', meta={'dry_run': report.__dict__})
        dump = payload_dir / 'database.dump'
        if not dump.exists():
            return RestoreResult(ok=False, message='database.dump eksik')
        db = settings.DATABASES['default']
        cmd = [
            pg_restore_binary(),
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '-h', str(db.get('HOST') or 'localhost'),
            '-p', str(db.get('PORT') or '5432'),
            '-U', str(db.get('USER') or ''),
            '-d', str(db.get('NAME') or ''),
            str(dump),
        ]
        # Açık bağlantılar pg_restore --clean sırasında kilit/session sorununa yol açar.
        connections.close_all()
        proc = subprocess.run(cmd, env=pg_env(db), capture_output=True, text=True)
        connections.close_all()
        stderr = proc.stderr or ''
        stdout = proc.stdout or ''
        combined_upper = f'{stderr}\n{stdout}'.upper()
        has_error = 'ERROR:' in combined_upper or 'FATAL:' in combined_upper
        # pg_restore: 0 = ok, 1 = warnings; >1 veya ERROR satırı = başarısız
        if has_error or proc.returncode not in (0, 1):
            return RestoreResult(
                ok=False,
                message=(stderr or stdout or f'pg_restore exit={proc.returncode}')[-2000:],
                meta={'returncode': proc.returncode},
            )
        return RestoreResult(
            ok=True,
            message='pg_restore tamamlandı',
            meta={'stderr': stderr[-500:], 'returncode': proc.returncode},
        )
