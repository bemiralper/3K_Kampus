"""Website CMS — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='website.content',
        name='Kurumsal Site İçeriği',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Site ayarları, slider, duyuru ve diğer CMS kayıtları.',
        config={
            'models': [
                'website.SiteSettings',
                'website.HeroSlide',
                'website.Duyuru',
                'website.SinavTakvim',
                'website.NedenKart',
                'website.BasariIstatistik',
                'website.OgrenciYorumu',
                'website.SSS',
                'website.YasalMetin',
            ],
        },
        is_default=False,
        priority=110,
    ),
]
