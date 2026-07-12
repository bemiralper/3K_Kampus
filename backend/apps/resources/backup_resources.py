"""Kaynaklar (kitap/ünite) — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='resources.books',
        name='Eğitim Kaynakları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Kitap, ünite, konu ve içerik tanımları.',
        config={
            'models': [
                'resources.BookType',
                'resources.ResourceBook',
                'resources.ResourceUnit',
                'resources.ResourceTopic',
                'resources.ResourceContent',
            ],
        },
        is_default=False,
        priority=120,
    ),
]
