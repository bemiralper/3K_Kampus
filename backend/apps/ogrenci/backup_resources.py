"""Öğrenci — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='ogrenci.kayitlar',
        name='Öğrenciler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Öğrenci, adres, veli ve paket kayıtları.',
        config={
            'models': [
                'ogrenci.Ogrenci',
                'ogrenci.OgrenciKayit',
                'ogrenci.OgrenciAdres',
                'ogrenci.OgrenciVeli',
                'ogrenci.OgrenciEgitimPaketi',
                'ogrenci.OgrenciEkHizmet',
            ],
        },
        priority=60,
    ),
    ResourceSpec(
        code='ogrenci.files',
        name='Öğrenci Profilleri',
        resource_type=ResourceType.MEDIA,
        description='Öğrenci profil fotoğrafları.',
        config={'relative_to': 'media', 'path': 'ogrenci'},
        is_default=True,
        priority=61,
    ),
]
