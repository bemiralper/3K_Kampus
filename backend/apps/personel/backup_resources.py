"""Personel — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='personel.kayitlar',
        name='Personel',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Personel, görevlendirme ve aktivite logları.',
        config={
            'models': [
                'personel.Personel',
                'personel.PersonelGorevlendirme',
                'personel.PersonelAktiviteLog',
            ],
        },
        priority=70,
    ),
    ResourceSpec(
        code='personel.files',
        name='Personel Dosyaları',
        resource_type=ResourceType.MEDIA,
        description='Personel fotoğraf ve sözleşme dosyaları.',
        config={'relative_to': 'media', 'path': 'personel'},
        priority=71,
    ),
]
