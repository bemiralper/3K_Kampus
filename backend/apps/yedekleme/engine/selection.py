"""Kaynak seçimi yardımcıları."""

from __future__ import annotations

from apps.yedekleme.domain.models import BackupKind, BackupResource, ResourceType


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
    if not resources:
        raise ValueError('Yedeklenecek aktif kaynak bulunamadı')
    return resources
