"""Finans modülü — yalnızca kaynak tanımı (yedekleme kodu yok)."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='finans.cariler',
        name='Cariler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Cari hesaplar, hareketler, etiketler ve dosya meta kayıtları.',
        config={
            'models': [
                'finans.CariHesap',
                'finans.CariHareket',
                'finans.CariEtiket',
                'finans.CariDosya',
                'finans.CariKayitliGorunum',
            ],
        },
        priority=40,
    ),
    ResourceSpec(
        code='finans.gelirler',
        name='Gelirler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Gelir kayıtları, tahsilatlar ve gelir kategorileri.',
        config={
            'models': [
                'finans.GelirKaydi',
                'finans.GelirTahsilat',
                'finans.GelirKategorisi',
                'finans.GelirKaynagi',
            ],
        },
        priority=41,
    ),
    ResourceSpec(
        code='finans.giderler',
        name='Giderler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Gider kayıtları, taksitler ve ödemeler.',
        config={
            'models': [
                'finans.GiderKaydi',
                'finans.GiderTaksit',
                'finans.GiderOdeme',
                'finans.GiderKategorisi',
            ],
        },
        priority=42,
    ),
    ResourceSpec(
        code='finans.mali_hesaplar',
        name='Mali Hesaplar',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Mali hesaplar, bakiyeler, transferler ve ödeme yöntemleri.',
        config={
            'models': [
                'finans.MaliHesap',
                'finans.MaliHesapYetkilisi',
                'finans.BakiyeHareketi',
                'finans.DonemBakiye',
                'finans.HesapTransferi',
                'finans.OdemeYontemi',
            ],
        },
        priority=43,
    ),
    ResourceSpec(
        code='finans.files',
        name='Finans Belgeleri',
        resource_type=ResourceType.MEDIA,
        description='Gelir/gider belgeleri, dekontlar ve cari dosyaları.',
        config={'relative_to': 'media', 'path': 'finans'},
        priority=44,
    ),
]
