"""Eğitim paketleri — paket tanımları."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='egitim_paketleri.paketler',
        name='Eğitim Paketleri',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Ek hizmet, grup dersi, premium, yayın, özel ders, deneme ve davranış paketleri.',
        config={
            'models': [
                'egitim_paketleri.EkHizmet',
                'egitim_paketleri.GrupDersi',
                'egitim_paketleri.PremiumPaket',
                'egitim_paketleri.YayinPaketi',
                'egitim_paketleri.OzelDers',
                'egitim_paketleri.Deneme',
                'egitim_paketleri.DavranisPaketi',
            ],
        },
        priority=35,
    ),
]
