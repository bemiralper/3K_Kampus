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
        # Snapshot bilgilendirme amaçlıdır; runtime Django settings'e uygulanmaz.
        is_restorable=False,
        is_system=True,
    ),
    ResourceSpec(
        code='system.auth',
        name='Kimlik Doğrulama (Kullanıcı/Grup/İzin)',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Django auth kullanıcı, grup, izin ve içerik tipleri (M2M dahil).',
        handler_key='database_table',
        config={
            'models': [
                'contenttypes.ContentType',
                'auth.Permission',
                'auth.Group',
                'auth.User',
            ],
        },
        is_default=False,
        compress=True,
        priority=15,
        is_restorable=True,
        is_system=True,
    ),
    ResourceSpec(
        code='system.roller',
        name='Roller ve Yetkiler',
        resource_type=ResourceType.DATABASE_TABLE,
        description='Uygulama rol/izin sistemi (system_role, system_permission, atamalar).',
        handler_key='database_table',
        config={
            'tables': [
                'system_permission',
                'system_role',
                'system_role_permission',
                'system_user_role',
            ],
        },
        is_default=False,
        compress=True,
        priority=16,
        is_restorable=True,
        is_system=True,
    ),
    ResourceSpec(
        code='system.logs',
        name='Uygulama Logları',
        resource_type=ResourceType.LOGS,
        description='LOG_DIR varsa log klasörü (opsiyonel).',
        handler_key='file_directory',
        # Tek log dosyası 50 MB'ı aşarsa yedeğe alınmaz (sınırsız büyüme koruması).
        config={'relative_to': 'log_dir', 'path': '', 'max_file_bytes': 50 * 1024 * 1024},
        is_default=False,
        compress=True,
        priority=200,
        is_restorable=False,
        is_system=True,
    ),
]
