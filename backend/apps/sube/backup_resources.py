"""Şube — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='sube.kayitlar',
        name='Şubeler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Şube kayıtları.',
        config={'models': ['sube.Sube']},
        priority=17,
    ),
    ResourceSpec(
        code='sube.files',
        name='Şube Logoları',
        resource_type=ResourceType.MEDIA,
        description='Şube logo dosyaları.',
        config={'relative_to': 'media', 'path': 'sube_branding'},
        priority=18,
    ),
]
