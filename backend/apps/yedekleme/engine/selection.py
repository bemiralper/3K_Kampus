"""Kaynak seçimi yardımcıları."""

from __future__ import annotations

from pathlib import Path

from apps.yedekleme.domain.models import BackupKind, BackupResource, ResourceType
from apps.yedekleme.engine.handlers.file_directory import _resolve_source_path


FILE_TYPES = {
    ResourceType.FILE_DIRECTORY,
    ResourceType.MEDIA,
    ResourceType.LOGS,
    ResourceType.CACHE,
    ResourceType.EXPORT,
    ResourceType.OTHER,
}

DB_TYPES = {ResourceType.DATABASE_TABLE}
SETTINGS_TYPES = {ResourceType.CONFIGURATION}


def resolve_resources(
    kind: str,
    resource_codes: list[str] | None = None,
) -> list[BackupResource]:
    qs = BackupResource.objects.filter(is_active=True)
    if kind == BackupKind.SELECTED:
        if not resource_codes:
            raise ValueError('Seçili kaynak yedeği için resource_codes gerekli')
        qs = qs.filter(code__in=resource_codes)
    elif kind == BackupKind.DATABASE:
        qs = qs.filter(resource_type__in=DB_TYPES)
        # Prefer full dump when present for database kind
        full = list(qs.filter(handler_key='database_full'))
        if full:
            qs = BackupResource.objects.filter(pk__in=[r.pk for r in full])
    elif kind == BackupKind.FILES:
        qs = qs.filter(resource_type__in=FILE_TYPES)
    elif kind == BackupKind.SETTINGS:
        qs = qs.filter(resource_type__in=SETTINGS_TYPES)
    elif kind == BackupKind.FULL:
        qs = qs.filter(is_default=True)
    else:
        raise ValueError(f'Bilinmeyen yedek türü: {kind}')

    resources = list(qs.order_by('priority', 'code'))

    # Tam dump varken tablo-seviye export gereksiz ve restore'da yıkıcıdır.
    # SELECTED türünde kullanıcı bilinçli seçtiyse bırakılır; restore tarafı yine atlar.
    if kind in (BackupKind.FULL, BackupKind.DATABASE) and any(
        r.handler_key == 'database_full' for r in resources
    ):
        resources = [r for r in resources if r.handler_key != 'database_table']

    # Medya kökü paketteyken alt klasörler aynı dosyayı ikinci kez yazar.
    # SELECTED türünde kullanıcı bilinçli seçtiyse alt klasör de kalır.
    if kind in (BackupKind.FULL, BackupKind.FILES):
        resources = _drop_nested_file_resources(resources)

    if not resources:
        raise ValueError('Yedeklenecek aktif kaynak bulunamadı')
    return resources


def _drop_nested_file_resources(resources: list[BackupResource]) -> list[BackupResource]:
    located: list[tuple[BackupResource, Path]] = []
    for resource in resources:
        if resource.handler_key != 'file_directory':
            continue
        path = _resolve_source_path(resource.config or {})
        if path is None:
            continue
        located.append((resource, path))

    drop_ids: set[int] = set()
    for resource, path in located:
        for other, other_path in located:
            if resource.pk == other.pk:
                continue
            if path == other_path:
                if (resource.priority, resource.code) > (other.priority, other.code):
                    drop_ids.add(resource.pk)
                continue
            if _is_inside(path, other_path):
                drop_ids.add(resource.pk)
    return [resource for resource in resources if resource.pk not in drop_ids]


def _is_inside(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
    except ValueError:
        return False
    return child != parent
