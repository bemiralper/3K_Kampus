"""Ortam ve veritabanı bilgisi."""
from django.conf import settings

PRODUCTION_DB_NAMES = frozenset({'lms_db', 'lms_production', 'production'})


def get_environment_info() -> dict:
    db = settings.DATABASES['default']
    db_name = db['NAME']
    env = getattr(settings, 'LMS_ENVIRONMENT', 'development')
    demo_allowed = getattr(settings, 'DEMO_DATABASE_ALLOWED', False)

    warnings = []
    if env == 'production':
        warnings.append('Canlı ortam — demo işlemleri devre dışı.')
    elif not demo_allowed and db_name in PRODUCTION_DB_NAMES:
        warnings.append(
            f'Bağlı DB ({db_name}) canlı veritabanı olabilir. '
            'Demo geliştirme için DJANGO_ENV=demo ve DB_NAME=lms_demo_db kullanın.'
        )

    return {
        'environment': env,
        'label': getattr(settings, 'ENVIRONMENT_LABEL', env.title()),
        'db_name': db_name,
        'db_host': db.get('HOST', 'localhost'),
        'demo_allowed': demo_allowed,
        'operational_reset_allowed': env != 'production',
        'is_demo_environment': env == 'demo',
        'is_production': env == 'production',
        'warnings': warnings,
        'workflow_hint': (
            'Kod değişiklikleri git ile canlıya alınır; migrate her iki DB\'de ayrı çalıştırılır. '
            'Demo verisi canlıya kopyalanmaz.'
        ),
    }


def assert_operational_reset_allowed() -> str | None:
    info = get_environment_info()
    if info['is_production']:
        return 'Canlı ortamda operasyonel sıfırlama yapılamaz.'
    return None


def assert_demo_operations_allowed() -> str | None:
    info = get_environment_info()
    if info['is_production']:
        return 'Canlı ortamda demo işlemi yapılamaz.'
    if not info['demo_allowed']:
        return (
            'Demo işlemleri bu ortamda kapalı. '
            'Backend\'i DJANGO_ENV=demo ile başlatın veya setup_demo_database çalıştırın.'
        )
    return None
