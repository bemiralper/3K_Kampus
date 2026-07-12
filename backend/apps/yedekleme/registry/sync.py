"""In-memory resource registration + DB sync.

Yedekleme motoru modül isimlerini bilmez; yalnızca BackupResource satırlarını okur.
Modüller AppConfig.ready içinde register_resources(...) çağırır.
"""

from __future__ import annotations

import logging
from typing import Iterable

from apps.yedekleme.registry.specs import ResourceSpec

logger = logging.getLogger(__name__)

_PENDING: list[tuple[str, list[ResourceSpec]]] = []
_SYNCED = False


def register_resources(source_app: str, specs: Iterable[ResourceSpec]) -> None:
    """Modül kaynaklarını kuyruğa alır. AppConfig.ready içinde çağrılır."""
    specs_list = list(specs)
    _PENDING.append((source_app, specs_list))
    logger.debug('Queued %s backup resources from %s', len(specs_list), source_app)


def pending_specs() -> list[tuple[str, list[ResourceSpec]]]:
    return list(_PENDING)


def sync_registered_resources(*, deactivate_missing: bool = False) -> dict:
    """Koddan kayıtlı spec'leri BackupResource tablosuna yazar.

    - Yeni kodlar eklenir
    - Mevcutlarda name/type/description/handler/config/is_system güncellenir
    - Kullanıcı bayrakları (is_active, is_default, encrypt, compress, priority, is_restorable)
      yalnızca ilk oluşturmada spec'ten gelir; sonra UI yönetir
    - Silme yok. deactivate_missing=True ise kodda olmayan sistem dışı kayıtlar pasifleştirilir
    """
    from apps.yedekleme.domain.models import BackupResource

    created = updated = skipped = deactivated = 0
    seen_codes: set[str] = set()

    for source_app, specs in _PENDING:
        for spec in specs:
            seen_codes.add(spec.code)
            defaults_create = {
                'name': spec.name,
                'resource_type': spec.resource_type,
                'description': spec.description,
                'handler_key': spec.resolved_handler(),
                'config': dict(spec.config or {}),
                'is_active': True,
                'is_default': spec.is_default,
                'encrypt': spec.encrypt,
                'compress': spec.compress,
                'priority': spec.priority,
                'is_restorable': spec.is_restorable,
                'source_app': source_app,
                'is_system': spec.is_system,
            }
            obj, was_created = BackupResource.objects.get_or_create(
                code=spec.code,
                defaults=defaults_create,
            )
            if was_created:
                created += 1
                continue

            # Sync immutable-ish fields from code; preserve UI-managed flags
            changed = False
            for field, value in {
                'name': spec.name,
                'resource_type': spec.resource_type,
                'description': spec.description,
                'handler_key': spec.resolved_handler(),
                'config': dict(spec.config or {}),
                'source_app': source_app,
                'is_system': spec.is_system,
            }.items():
                if getattr(obj, field) != value:
                    setattr(obj, field, value)
                    changed = True
            if changed:
                obj.save()
                updated += 1
            else:
                skipped += 1

    if deactivate_missing:
        qs = BackupResource.objects.exclude(code__in=seen_codes).filter(is_active=True)
        deactivated = qs.update(is_active=False)

    global _SYNCED
    _SYNCED = True
    result = {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'deactivated': deactivated,
        'total_registered': len(seen_codes),
    }
    logger.info('Backup resource sync: %s', result)
    return result
