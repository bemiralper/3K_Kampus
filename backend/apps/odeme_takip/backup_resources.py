"""Ödeme takip — yalnızca kaynak tanımı."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry import ResourceSpec

RESOURCES = [
    ResourceSpec(
        code='odeme_takip.sozlesmeler',
        name='Sözleşmeler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Öğrenci sözleşmeleri ve ilişkili ödeme takip kayıtları.',
        config={
            'tables': [
                'sozlesme',
                'sozlesme_kalemi',
                'taksit',
                'tahsilat',
                'tahsilat_dagitim',
                'sozlesme_fesih',
                'sozlesme_gecmisi',
                'sozlesme_indirimi',
                'indirim_turu',
            ],
        },
        priority=50,
    ),
    ResourceSpec(
        code='odeme_takip.cek_senet',
        name='Çek / Senet',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Çek-senet detay, dosya ve log kayıtları.',
        config={'tables': ['cek_senet_detay', 'cek_senet_dosya', 'cek_senet_log']},
        priority=51,
    ),
    ResourceSpec(
        code='odeme_takip.files',
        name='Çek/Senet Dosyaları',
        resource_type=ResourceType.MEDIA,
        description='cek_senet medya klasörü.',
        config={'relative_to': 'media', 'path': 'cek_senet'},
        priority=52,
    ),
]
