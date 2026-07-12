from apps.yedekleme.registry.specs import ResourceSpec
from apps.yedekleme.registry.sync import pending_specs, register_resources, sync_registered_resources

__all__ = [
    'ResourceSpec',
    'register_resources',
    'sync_registered_resources',
    'pending_specs',
]
