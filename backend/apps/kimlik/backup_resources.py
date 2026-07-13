"""Kimlik — Kisi kayıtları (öğrenci/personel/veli FK kökü)."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='kimlik.kisiler',
        name='Kişiler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Merkezi kişi (Kisi) kayıtları — öğrenci, personel ve veli referansları.',
        config={'models': ['kimlik.Kisi']},
        priority=19,
    ),
]
