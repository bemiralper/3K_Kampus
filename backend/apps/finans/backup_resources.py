"""Finans modülü — yalnızca kaynak tanımı (yedekleme kodu yok)."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='finans.tanimlar',
        name='Finans Tanımları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Maliyet merkezi, proje, masraf türü ve açıklama şablonları.',
        config={
            'models': [
                'finans.MaliyetMerkezi',
                'finans.Proje',
                'finans.MasrafTuru',
                'finans.AciklamaSablonu',
            ],
        },
        priority=39,
    ),
    ResourceSpec(
        code='finans.cariler',
        name='Cariler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Cari hesaplar, hareketler, etiketler ve dosya meta kayıtları (M2M dahil).',
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
        description='Gelir kayıtları, tahsilatlar ve gelir kategorileri (etiket M2M dahil).',
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
        description='Gider kayıtları, taksitler ve ödemeler (etiket M2M dahil).',
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
        code='finans.islem_masrafi',
        name='İşlem Masrafları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='İşlem masrafı kayıtları.',
        # IslemMasrafi modeli app registry'ye boot'ta import edilmediğinden
        # (apps.get_model çözemez) doğrudan tablo adıyla tanımlanır.
        config={'tables': ['finans_islem_masrafi']},
        priority=44,
    ),
    ResourceSpec(
        code='finans.islem_log',
        name='Finans İşlem Logları',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Finans işlem audit logları.',
        config={'models': ['finans.FinansIslemLog']},
        is_default=False,
        priority=45,
    ),
    ResourceSpec(
        code='finans.files',
        name='Finans Belgeleri',
        resource_type=ResourceType.MEDIA,
        description='Gelir/gider belgeleri, dekontlar ve cari dosyaları.',
        config={'relative_to': 'media', 'path': 'finans'},
        priority=46,
    ),
]
