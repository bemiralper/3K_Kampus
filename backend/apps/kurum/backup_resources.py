"""Kurum — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='kurum.kayitlar',
        name='Kurumlar',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Kurum kayıtları.',
        config={'models': ['kurum.Kurum']},
        priority=15,
    ),
    ResourceSpec(
        code='kurum.files',
        name='Kurum Logoları',
        resource_type=ResourceType.MEDIA,
        description='Kurum logo ve favicon dosyaları.',
        config={'relative_to': 'media', 'path': 'kurum'},
        priority=16,
    ),
]
