"""
Django Base Settings
Enterprise-level multi-tenant architecture
"""
import os
from pathlib import Path

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BASE_DIR.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-key-change-in-production')

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.humanize',
    'rest_framework',
    'corsheaders',
    
    # Local apps
    'apps.kurum',
    'apps.sube',
    'apps.egitim_yili',
    'apps.egitim_tanimlari',
    'apps.egitim_paketleri',
    'apps.ogrenci',
    'apps.ogrenci_kayit',  # Yeni wizard sistemi
    'apps.oda',  # Fiziksel mekan yönetimi
    'apps.sinif',
    'apps.personel',
    'apps.finans',
    'apps.rapor',
    'apps.auth_custom',
    'apps.roller',  # Rol Yönetimi - Birimlerden bağımsız yetki sistemi
    'apps.term',   # Eğitim Dönemleri
    'apps.academic',  # Akademik Planlama - Zaman Şablonları ve Ders Saatleri
    'apps.coaching',  # Koçluk Yönetimi - Öğrenci koçluk ve mentörlük sistemi
    'apps.coaching.assignment_manual',  # Manuel Ödev Atama - Koç tarafından manuel ödev atama
    'apps.coaching.study_program',  # Çalışma Programı - Haftalık çalışma planlaması
    'apps.coaching.olcme_degerlendirme',  # Ölçme ve Değerlendirme - Sınav yönetimi ve analiz
    'apps.resources',  # Kaynak Kütüphanesi - Kitap bazlı içerik yönetimi
    'apps.student_resources',  # Öğrenci Kaynak Havuzu - Kaynak atama yönetimi
    'apps.kutuphane',  # Kütüphane Yönetimi - Etüt salonu ve koltuk yönetimi
    'apps.odeme_takip',  # Ödeme Takip - Sözleşme, taksit, tahsilat yönetimi
    'apps.takvim',  # Takvim - Merkezi etkinlik ve takvim yönetimi
    'apps.gorev',  # Görev Yönetimi - Görev, hatırlatma, planlama
    'apps.communication',  # İletişim Merkezi - WhatsApp / SMS / Email
    'apps.website',  # Kurumsal web sitesi / landing page CMS
    'apps.yedekleme',  # Platform geneli yedekleme ve geri yükleme
]

# WhatsApp Business Cloud API (dev: empty defaults)
WHATSAPP_PHONE_NUMBER_ID = os.environ.get('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_WABA_ID = os.environ.get('WHATSAPP_WABA_ID', '')
WHATSAPP_ACCESS_TOKEN = os.environ.get('WHATSAPP_ACCESS_TOKEN', '')
WHATSAPP_VERIFY_TOKEN = os.environ.get('WHATSAPP_VERIFY_TOKEN', '')
WHATSAPP_APP_SECRET = os.environ.get('WHATSAPP_APP_SECRET', '')
COMM_QUEUE_BATCH_SIZE = int(os.environ.get('COMM_QUEUE_BATCH_SIZE', '20'))
COMMUNICATION_QUEUE_BATCH_SIZE = int(
    os.environ.get('COMMUNICATION_QUEUE_BATCH_SIZE', str(COMM_QUEUE_BATCH_SIZE))
)
COMMUNICATION_QUEUE_THROTTLE_MS = int(os.environ.get('COMMUNICATION_QUEUE_THROTTLE_MS', '200'))

# Celery + Redis (opsiyonel — boş bırakılırsa cron/management command kullanılır)
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', '')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Europe/Istanbul'
CELERY_TASK_TRACK_STARTED = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# Ortam tanımı (demo / development / production / test)
LMS_ENVIRONMENT = os.environ.get('LMS_ENVIRONMENT', 'development')
# Demo veri seed/purge yalnızca demo ortamında (veya DEMO_DATABASE_ALLOWED=1 ile)
DEMO_DATABASE_ALLOWED = os.environ.get('DEMO_DATABASE_ALLOWED', '').lower() in ('1', 'true', 'yes')
ENVIRONMENT_LABEL = os.environ.get('ENVIRONMENT_LABEL', LMS_ENVIRONMENT.title())

# AI asistan (varsayılan kapalı — OpenAI entegrasyonu yok)
COMMUNICATION_AI_ENABLED = os.environ.get('COMMUNICATION_AI_ENABLED', 'False').lower() in (
    '1', 'true', 'yes',
)
COMMUNICATION_SSE_MAX_ITERATIONS = int(os.environ.get('COMMUNICATION_SSE_MAX_ITERATIONS', '0'))
COMMUNICATION_WHATSAPP_COST_USD = os.environ.get('COMMUNICATION_WHATSAPP_COST_USD', '0.0009')
COMMUNICATION_ATTACHMENT_MAX_BYTES = int(
    os.environ.get('COMMUNICATION_ATTACHMENT_MAX_BYTES', str(16 * 1024 * 1024)),
)
COMMUNICATION_TOKEN_ENCRYPTION_KEY = os.environ.get('COMMUNICATION_TOKEN_ENCRYPTION_KEY', '')
COMMUNICATION_MEDIA_STORAGE = os.environ.get('COMMUNICATION_MEDIA_STORAGE', 'local')
COMMUNICATION_MEDIA_PUBLIC_BASE_URL = os.environ.get('COMMUNICATION_MEDIA_PUBLIC_BASE_URL', '')
SITE_URL = os.environ.get('SITE_URL', '')
AWS_S3_BUCKET = os.environ.get('AWS_S3_BUCKET', '')
AWS_S3_REGION = os.environ.get('AWS_S3_REGION', 'auto')
AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL', '')
AWS_S3_PUBLIC_URL_BASE = os.environ.get('AWS_S3_PUBLIC_URL_BASE', '')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'shared.middleware.session_idle_timeout.SessionIdleTimeoutMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    
    # Custom middleware - MUST be after SessionMiddleware and AuthenticationMiddleware
    'shared.middleware.active_context.ActiveContextMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            BASE_DIR / 'templates',
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                
                # Custom context processor
                'shared.context.active_context_processor',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'tr-tr'
TIME_ZONE = 'Europe/Istanbul'
USE_I18N = True
USE_TZ = True

# Frontend base URL
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'EXCEPTION_HANDLER': 'shared.drf_exception_handler.api_exception_handler',
}

# CORS (Frontend ile entegrasyon)
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://localhost:3002",
]
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-kurum-id",
    "x-sube-id",
    "x-egitimyili-id",
]

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = []

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Platform geneli yedekleme (super admin / yedekleme.* izinleri)
BACKUP_CONFIG = {
    'local_root': Path(os.environ.get('BACKUP_LOCAL_ROOT', str(BASE_DIR / 'private' / 'backups'))),
    'file_roots': [MEDIA_ROOT],
    'exclude_patterns': ['__pycache__', '*.pyc', '.DS_Store', 'Thumbs.db'],
    'remote_provider': os.environ.get('BACKUP_REMOTE_PROVIDER', 'local'),
    'encryption_provider': os.environ.get('BACKUP_ENCRYPTION_PROVIDER', 'none'),
    'retention': {
        'daily': int(os.environ.get('BACKUP_RETENTION_DAILY', '7')),
        'weekly': int(os.environ.get('BACKUP_RETENTION_WEEKLY', '4')),
        'monthly': int(os.environ.get('BACKUP_RETENTION_MONTHLY', '12')),
        'manual': int(os.environ.get('BACKUP_RETENTION_MANUAL', '30')),
        'max_age_days': int(os.environ.get('BACKUP_MAX_AGE_DAYS', '0')) or None,
    },
}

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Session configuration
SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_AGE = 86400 * 7  # 7 days
SESSION_SAVE_EVERY_REQUEST = True  # Refresh session on every request
SESSION_COOKIE_NAME = 'lms_sessionid'
SESSION_IDLE_TIMEOUT_SECONDS = int(os.environ.get('SESSION_IDLE_TIMEOUT_SECONDS', '900'))  # 15 dk

# Multi-tenant configuration
TENANT_SESSION_KEYS = {
    'kurum': 'active_kurum_id',
    'sube': 'active_sube_id',
    'egitim_yili': 'active_egitim_yili_id',
}
