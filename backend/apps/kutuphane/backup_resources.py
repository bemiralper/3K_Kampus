"""Kütüphane / etüt — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='kutuphane.salon',
        name='Etüt Salonu',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Salon, masa, dolap ve oturum tanımları.',
        config={
            'tables': [
                'kutuphane_salon',
                'kutuphane_oturum_tanimi',
                'kutuphane_masa',
                'kutuphane_dolap',
                'kutuphane_masa_atama',
                'kutuphane_dolap_atama',
            ],
        },
        is_default=False,
        priority=90,
    ),
    ResourceSpec(
        code='kutuphane.yoklama',
        name='Etüt Yoklama',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Yoklama oturum ve kayıtları.',
        config={
            'tables': [
                'kutuphane_yoklama_oturum',
                'kutuphane_yoklama_kayit',
                'kutuphane_yoklama_bildirim_ayar',
                'kutuphane_yoklama_bildirim_log',
            ],
        },
        is_default=False,
        priority=91,
    ),
]
