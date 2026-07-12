"""Resource handler protokolü ve ortak sonuç tipleri."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol


@dataclass
class ExportResult:
    files: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)
    bytes_written: int = 0


@dataclass
class RestoreAnalysis:
    resource_code: str
    present: bool = True
    estimated_seconds: float = 0
    size_bytes: int = 0
    missing_files: list[str] = field(default_factory=list)
    incompatibilities: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class DryRunReport:
    resource_code: str
    tables_changed: list[str] = field(default_factory=list)
    rows_to_delete: int = 0
    rows_to_insert: int = 0
    rows_to_update: int = 0
    files_to_add: int = 0
    files_to_replace: int = 0
    files_to_delete: int = 0
    notes: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class RestoreResult:
    ok: bool = True
    message: str = ''
    meta: dict[str, Any] = field(default_factory=dict)


class ResourceHandler(Protocol):
    key: str

    def export(self, resource, work_dir: Path, log) -> ExportResult: ...

    def analyze_restore(self, resource, payload_dir: Path) -> RestoreAnalysis: ...

    def dry_run(self, resource, payload_dir: Path) -> DryRunReport: ...

    def restore(self, resource, payload_dir: Path, *, dry_run: bool = False) -> RestoreResult: ...


class JobLog:
    """İnce sarmalayıcı — orchestrator adım logları yazar."""

    def __init__(self, write_fn):
        self._write = write_fn

    def info(self, step: str, **meta):
        self._write(step=step, success=True, metadata=meta)

    def error(self, step: str, error: str, **meta):
        self._write(step=step, success=False, error_message=error, metadata=meta)
