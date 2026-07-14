"""Tablo bazlı export/import (JSONL + schema meta)."""

from __future__ import annotations

import json
from collections import defaultdict, deque
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

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


def _append_m2m_through_tables(model, tables: list[str]) -> None:
    for field in model._meta.many_to_many:
        through = field.remote_field.through
        tname = through._meta.db_table
        if tname not in tables:
            tables.append(tname)


def _resolve_tables(config: dict) -> list[str]:
    tables: list[str] = []
    for label in config.get('models') or []:
        try:
            model = apps.get_model(label)
            t = model._meta.db_table
            if t not in tables:
                tables.append(t)
            _append_m2m_through_tables(model, tables)
        except LookupError:
            if label not in tables:
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
            _append_m2m_through_tables(model, tables)
        except LookupError:
            pass
    return tables


def _quote_ident(name: str) -> str:
    """PostgreSQL identifier'ını güvenli biçimde tırnak içine alır.

    İçteki çift tırnakları ikiye katlayarak (`"` -> `""`) kırılmayı imkânsız
    kılar; böylece manifest'ten (güvenilmeyen arşiv) gelen tablo/kolon adları
    üzerinden SQL enjeksiyonu yapılamaz.
    """
    if not isinstance(name, str) or '\x00' in name:
        raise ValueError(f'Geçersiz identifier: {name!r}')
    return '"' + name.replace('"', '""') + '"'


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
        cur.execute(f'SELECT COUNT(*) FROM {_quote_ident(table)}')  # noqa: S608
        return int(cur.fetchone()[0])


# Tenant (çoklu kurum) kapsamı için desteklenen sütunlar. Bir tabloda mevcut
# olanlar filtre olarak uygulanır; olmayanlar (paylaşılan/global tablolar) atlanır.
_TENANT_COLUMNS = ('kurum_id', 'sube_id', 'egitim_yili_id')


def _tenant_conditions_for_table(table: str, tenant: dict | None) -> list[dict]:
    """Tablo için uygulanabilir tenant koşulları [{'column','value'}]. Yoksa []."""
    if not tenant:
        return []
    cols = set(_column_udt_types(table).keys())
    conditions: list[dict] = []
    for key in _TENANT_COLUMNS:
        if key in tenant and tenant[key] is not None and key in cols:
            conditions.append({'column': key, 'value': tenant[key]})
    return conditions


def _where_clause(conditions: list[dict]) -> tuple[str, list]:
    if not conditions:
        return '', []
    parts = [f'{_quote_ident(c["column"])} = %s' for c in conditions]
    return ' WHERE ' + ' AND '.join(parts), [c['value'] for c in conditions]


def _export_table_jsonl(
    table: str,
    data_path: Path,
    *,
    batch_size: int = 2000,
    conditions: list[dict] | None = None,
) -> tuple[list[str], int]:
    """Tabloyu artımlı (batch) olarak JSONL'e yazar; tüm satırları belleğe almaz.

    `conditions` verilirse (tenant kapsamı) yalnızca eşleşen satırlar yazılır.
    """
    written = 0
    cols: list[str] = []
    where_sql, where_params = _where_clause(conditions or [])
    with connection.cursor() as cur, data_path.open('w', encoding='utf-8') as fh:
        cur.execute(f'SELECT * FROM {_quote_ident(table)}{where_sql}', where_params)  # noqa: S608
        cols = [c[0] for c in cur.description]
        while True:
            batch = cur.fetchmany(batch_size)
            if not batch:
                break
            for row in batch:
                fh.write(json.dumps(dict(zip(cols, row)), cls=_Encoder, ensure_ascii=False) + '\n')
                written += 1
    return cols, written


def _column_udt_types(table: str) -> dict[str, str]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, udt_name
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = %s
            """,
            [table],
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def _fk_edges(tables: list[str]) -> list[tuple[str, str]]:
    """(child, parent) — child FK ile parent'a bağlı."""
    if not tables:
        return []
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT
                src.relname AS child_table,
                tgt.relname AS parent_table
            FROM pg_constraint c
            JOIN pg_class src ON src.oid = c.conrelid
            JOIN pg_namespace nsrc ON nsrc.oid = src.relnamespace
            JOIN pg_class tgt ON tgt.oid = c.confrelid
            JOIN pg_namespace ntgt ON ntgt.oid = tgt.relnamespace
            WHERE c.contype = 'f'
              AND nsrc.nspname = current_schema()
              AND ntgt.nspname = current_schema()
              AND src.relname = ANY(%s)
              AND tgt.relname = ANY(%s)
            """,
            [tables, tables],
        )
        return [(r[0], r[1]) for r in cur.fetchall() if r[0] != r[1]]


def _topo_sort_tables(tables: list[str]) -> list[str]:
    """Parent tablolar önce (INSERT sırası). Döngüde orijinal sıra korunur."""
    table_set = set(tables)
    edges = _fk_edges(tables)
    indegree: dict[str, int] = {t: 0 for t in tables}
    children: dict[str, list[str]] = defaultdict(list)
    for child, parent in edges:
        if child in table_set and parent in table_set:
            children[parent].append(child)
            indegree[child] = indegree.get(child, 0) + 1
    queue = deque([t for t in tables if indegree.get(t, 0) == 0])
    ordered: list[str] = []
    seen: set[str] = set()
    while queue:
        node = queue.popleft()
        if node in seen:
            continue
        seen.add(node)
        ordered.append(node)
        for child in children.get(node, []):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    for t in tables:
        if t not in seen:
            ordered.append(t)
    return ordered


def _coerce_value(value: Any, udt_name: str | None) -> Any:
    if value is None:
        return None
    if udt_name == 'bytea':
        if isinstance(value, (bytes, memoryview)):
            return bytes(value)
        if isinstance(value, str):
            if not value:
                return b''
            try:
                return bytes.fromhex(value)
            except ValueError:
                return value.encode('utf-8')
    return value


class DatabaseTableHandler:
    key = 'database_table'

    def export(self, resource, work_dir: Path, log) -> ExportResult:
        work_dir.mkdir(parents=True, exist_ok=True)
        config = resource.config or {}
        tenant = config.get('__tenant__') or None
        tables = _resolve_tables(config)
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
            conditions = _tenant_conditions_for_table(table, tenant)
            data_path = work_dir / f'{table}.jsonl'
            cols, row_count = _export_table_jsonl(table, data_path, conditions=conditions)
            schema = {'table': table, 'columns': cols, 'row_count': row_count}
            if conditions:
                schema['tenant_conditions'] = conditions
            schema_path = work_dir / f'{table}.schema.json'
            schema_path.write_text(json.dumps(schema, indent=2), encoding='utf-8')
            files.extend([data_path.name, schema_path.name])
            total += data_path.stat().st_size + schema_path.stat().st_size
            meta_tables.append(schema)
            log.info('database_table.exported', table=table, rows=row_count)
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
            delete += current
            insert += backup_rows
        return DryRunReport(
            resource_code=resource.code,
            tables_changed=tables_changed,
            rows_to_delete=delete,
            rows_to_insert=insert,
            rows_to_update=update,
            notes=[
                'Tablo geri yükleme: FK topo-sıra + session_replication_role=replica '
                '+ DELETE (CASCADE yok; hub tablolar dışındaki veriyi silmez).',
            ],
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

        pending: list[dict[str, Any]] = []
        for t in meta.get('tables') or []:
            table = t.get('table')
            if not table:
                continue
            data_path = payload_dir / f'{table}.jsonl'
            if not data_path.exists():
                continue
            if not _table_exists(table):
                return RestoreResult(ok=False, message=f'Tablo yok: {table}')
            pending.append({
                'table': table,
                'columns': t.get('columns') or [],
                'data_path': data_path,
                'tenant_conditions': t.get('tenant_conditions') or [],
            })

        if not pending:
            return RestoreResult(ok=True, message='geri yüklenecek tablo yok', meta=meta)

        # Tenant kapsamı: herhangi bir tabloda tenant koşulu varsa bu bir
        # kurum-bazlı yedektir → SADECE o kuruma ait satırlar silinir/eklenir;
        # diğer kurumların verisi ASLA silinmez (veri güvenliği).
        tenant_scoped = any(p['tenant_conditions'] for p in pending)

        insert_order = _topo_sort_tables([p['table'] for p in pending])
        by_table = {p['table']: p for p in pending}
        ordered = [by_table[t] for t in insert_order if t in by_table]
        # Truncate: çocuklar önce (ters sıra), CASCADE kullanma
        truncate_order = list(reversed(ordered))

        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("SET LOCAL session_replication_role = 'replica'")
                # CASCADE yok: dış tabloları boşaltmaz. replica rolü FK kontrollerini gevşetir.
                for item in truncate_order:
                    quoted = _quote_ident(item['table'])
                    conds = item['tenant_conditions']
                    if tenant_scoped and not conds:
                        # Paylaşılan/global tablo (tenant sütunu yok) — SİLME.
                        continue
                    where_sql, where_params = _where_clause(conds)
                    cur.execute(f'DELETE FROM {quoted}{where_sql}', where_params)  # noqa: S608
                for item in ordered:
                    table = item['table']
                    udt = _column_udt_types(table)
                    # Kolonları gerçek DB kolonlarıyla sınırla (whitelist);
                    # manifest'ten gelen bilinmeyen/enjeksiyon adlarını ele.
                    valid_cols = set(udt.keys())
                    quoted_table = _quote_ident(table)
                    # Tenant kapsamında paylaşılan tabloya çakışma olursa dokunma.
                    conflict_sql = (
                        ' ON CONFLICT DO NOTHING'
                        if tenant_scoped and not item['tenant_conditions']
                        else ''
                    )
                    with item['data_path'].open(encoding='utf-8') as fh:
                        for line in fh:
                            line = line.strip()
                            if not line:
                                continue
                            row = json.loads(line)
                            candidate = item['columns'] or list(row.keys())
                            use_cols = [c for c in candidate if c in valid_cols]
                            if not use_cols:
                                continue
                            placeholders = ', '.join(['%s'] * len(use_cols))
                            col_sql = ', '.join(_quote_ident(c) for c in use_cols)
                            values = [_coerce_value(row.get(c), udt.get(c)) for c in use_cols]
                            cur.execute(
                                f'INSERT INTO {quoted_table} ({col_sql}) '  # noqa: S608
                                f'VALUES ({placeholders}){conflict_sql}',
                                values,
                            )
                cur.execute("SET LOCAL session_replication_role = 'origin'")
        msg = 'tablolar geri yüklendi (kurum kapsamlı)' if tenant_scoped else 'tablolar geri yüklendi'
        return RestoreResult(ok=True, message=msg, meta=meta)
