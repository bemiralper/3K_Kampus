"""Sistem kaynakları — motorun tanıdığı varsayılan resource tanımları."""

from apps.yedekleme.domain.models import ResourceType
from apps.yedekleme.registry.specs import ResourceSpec

SYSTEM_RESOURCES = [
    ResourceSpec(
        code='system.database',
        name='Tam Veritabanı',
        resource_type=ResourceType.DATABASE_TABLE,
        description='PostgreSQL tam dump (pg_dump -Fc). Tüm tablolar.',
        handler_key='database_full',
        config={},
        is_default=True,
        compress=True,
        priority=10,
        is_restorable=True,
        is_system=True,
    ),
    ResourceSpec(
        code='system.media',
        name='Medya Dosyaları',
        resource_type=ResourceType.MEDIA,
        description='MEDIA_ROOT altındaki tüm yüklenen dosyalar.',
        handler_key='file_directory',
        config={'relative_to': 'media', 'path': ''},
        is_default=True,
        compress=True,
        priority=20,
        is_restorable=True,
        is_system=True,
    ),
    ResourceSpec(
        code='system.settings',
        name='Uygulama Ayarları',
        resource_type=ResourceType.CONFIGURATION,
        description='Yedekleme ve kritik runtime ayarlarının anlık görüntüsü.',
        handler_key='configuration',
        config={
            'keys': [
                'TIME_ZONE',
                'LANGUAGE_CODE',
                'MEDIA_URL',
                'STATIC_URL',
                'BACKUP_CONFIG',
            ],
        },
        is_default=True,
        compress=True,
        priority=30,
        is_restorable=True,
        is_system=True,
    ),
    ResourceSpec(
        code='system.logs',
        name='Uygulama Logları',
        resource_type=ResourceType.LOGS,
        description='LOG_DIR varsa log klasörü (opsiyonel).',
        handler_key='file_directory',
        config={'relative_to': 'log_dir', 'path': ''},
        is_default=False,
        compress=True,
        priority=200,
        is_restorable=False,
        is_system=True,
    ),
]
