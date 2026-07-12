"""Tablo bazlı export/import (JSONL + schema meta)."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID
from datetime import date, datetime, time
from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction

from apps.yedekleme.engine.handlers.base import (
    DryRunReport,
    ExportResult,
    RestoreAnalysis,
    RestoreResult,
)


class _Encoder(DjangoJSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime, date, time)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return str(o)
        if isinstance(o, UUID):
            return str(o)
        if isinstance(o, bytes):
            return o.hex()
        return super().default(o)


def _resolve_tables(config: dict) -> list[str]:
    tables: list[str] = []
    for label in config.get('models') or []:
        try:
            model = apps.get_model(label)
            tables.append(model._meta.db_table)
        except LookupError:
            tables.append(label)  # may already be a table name
    for t in config.get('tables') or []:
        if t not in tables:
            tables.append(t)
    if config.get('table') and config['table'] not in tables:
        tables.append(config['table'])
    if config.get('model'):
        try:
            model = apps.get_model(config['model'])
            t = model._meta.db_table
            if t not in tables:
                tables.append(t)
        except LookupError:
            pass
    return tables


def _table_exists(table: str) -> bool:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name = %s
            """,
            [table],
        )
        return cur.fetchone() is not None


def _row_count(table: str) -> int:
    with connection.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{table}"')  # noqa: S608
        return int(cur.fetchone()[0])


def _fetch_all(table: str) -> tuple[list[str], list[dict[str, Any]]]:
    with connection.cursor() as cur:
        cur.execute(f'SELECT * FROM "{table}"')  # noqa: S608
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    return cols, rows


class DatabaseTableHandler:
    key = 'database_table'

    def export(self, resource, work_dir: Path, log) -> ExportResult:
        work_dir.mkdir(parents=True, exist_ok=True)
        tables = _resolve_tables(resource.config or {})
        if not tables:
            raise RuntimeError(f'{resource.code}: tablo/model tanımlı değil')
        files: list[str] = []
        total = 0
        meta_tables = []
        for table in tables:
            if not _table_exists(table):
                log.info('database_table.skip_missing', table=table)
                meta_tables.append({'table': table, 'missing': True, 'rows': 0})
                continue
            cols, rows = _fetch_all(table)
            data_path = work_dir / f'{table}.jsonl'
            with data_path.open('w', encoding='utf-8') as fh:
                for row in rows:
                    fh.write(json.dumps(row, cls=_Encoder, ensure_ascii=False) + '\n')
            schema = {'table': table, 'columns': cols, 'row_count': len(rows)}
            schema_path = work_dir / f'{table}.schema.json'
            schema_path.write_text(json.dumps(schema, indent=2), encoding='utf-8')
            files.extend([data_path.name, schema_path.name])
            total += data_path.stat().st_size + schema_path.stat().st_size
            meta_tables.append(schema)
            log.info('database_table.exported', table=table, rows=len(rows))
        meta = {'tables': meta_tables}
        (work_dir / 'meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
        files.append('meta.json')
        return ExportResult(files=files, meta=meta, bytes_written=total)

    def analyze_restore(self, resource, payload_dir: Path) -> RestoreAnalysis:
        meta_path = payload_dir / 'meta.json'
        if not meta_path.exists():
            return RestoreAnalysis(
                resource_code=resource.code,
                present=False,
                missing_files=['meta.json'],
            )
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        missing = []
        conflicts = []
        size = 0
        rows = 0
        for t in meta.get('tables') or []:
            table = t.get('table')
            data = payload_dir / f'{table}.jsonl'
            if not data.exists():
                missing.append(data.name)
            else:
                size += data.stat().st_size
                rows += int(t.get('row_count') or 0)
            if table and _table_exists(table):
                current = _row_count(table)
                if current and t.get('row_count') is not None:
                    conflicts.append(f'{table}: mevcut {current} satır, yedekte {t.get("row_count")}')
        return RestoreAnalysis(
            resource_code=resource.code,
            present=not missing,
            size_bytes=size,
            estimated_seconds=max(1.0, rows / 5000),
            missing_files=missing,
            conflicts=conflicts,
            details=meta,
        )

    def dry_run(self, resource, payload_dir: Path) -> DryRunReport:
        analysis = self.analyze_restore(resource, payload_dir)
        meta = analysis.details or {}
        insert = delete = update = 0
        tables_changed = []
        for t in meta.get('tables') or []:
            table = t.get('table')
            if not table:
                continue
            tables_changed.append(table)
            backup_rows = int(t.get('row_count') or 0)
            current = _row_count(table) if _table_exists(table) else 0
            # Replace strategy: delete all current, insert backup rows
            delete += current
            insert += backup_rows
        return DryRunReport(
            resource_code=resource.code,
            tables_changed=tables_changed,
            rows_to_delete=delete,
            rows_to_insert=insert,
            rows_to_update=update,
            notes=['Tablo geri yükleme stratejisi: TRUNCATE + INSERT (FK sırası priority ile).'],
            details=meta,
        )

    def restore(self, resource, payload_dir: Path, *, dry_run: bool = False) -> RestoreResult:
        if dry_run:
            report = self.dry_run(resource, payload_dir)
            return RestoreResult(ok=True, message='dry-run', meta={'dry_run': report.__dict__})

        meta_path = payload_dir / 'meta.json'
        if not meta_path.exists():
            return RestoreResult(ok=False, message='meta.json eksik')
        meta = json.loads(meta_path.read_text(encoding='utf-8'))

        with transaction.atomic():
            for t in meta.get('tables') or []:
                table = t['table']
                data_path = payload_dir / f'{table}.jsonl'
                if not data_path.exists():
                    continue
                if not _table_exists(table):
                    return RestoreResult(ok=False, message=f'Tablo yok: {table}')
                cols = t.get('columns') or []
                with connection.cursor() as cur:
                    cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')  # noqa: S608
                    with data_path.open(encoding='utf-8') as fh:
                        for line in fh:
                            line = line.strip()
                            if not line:
                                continue
                            row = json.loads(line)
                            use_cols = cols or list(row.keys())
                            placeholders = ', '.join(['%s'] * len(use_cols))
                            col_sql = ', '.join(f'"{c}"' for c in use_cols)
                            values = [row.get(c) for c in use_cols]
                            cur.execute(
                                f'INSERT INTO "{table}" ({col_sql}) VALUES ({placeholders})',  # noqa: S608
                                values,
                            )
        return RestoreResult(ok=True, message='tablolar geri yüklendi', meta=meta)
