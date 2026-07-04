"""
Development Settings
"""
from .base import *

DEBUG = True

LMS_ENVIRONMENT = 'development'
# Geliştirmede varsayılan lms_db — demo seed kapalı (ayrı demo DB kullanın)
DEMO_DATABASE_ALLOWED = os.environ.get('DEMO_DATABASE_ALLOWED', '').lower() in ('1', 'true', 'yes')
ENVIRONMENT_LABEL = os.environ.get('ENVIRONMENT_LABEL', 'Geliştirme')

ALLOWED_HOSTS = [
    'localhost', '127.0.0.1', '[::1]', '0.0.0.0',
    '192.168.1.9', '192.168.1.12',
    '192.168.2.7', '192.168.2.9',
]

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'lms_db'),
        'USER': os.environ.get('DB_USER', 'taner'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Email backend for development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# CORS - Allow all origins for development
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# CSRF - Trust localhost origins for development
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://192.168.1.9:3000',
    'http://192.168.1.9:3001',
    'http://192.168.1.12:3000',
    'http://192.168.1.12:3001',
    'http://192.168.2.7:3000',
    'http://192.168.2.7:3001',
    'http://192.168.2.9:3000',
    'http://192.168.2.9:3001',
]
_extra_csrf = [o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS_EXTRA', '').split(',') if o.strip()]
CSRF_TRUSTED_ORIGINS.extend(_extra_csrf)

# Farklı LAN IP'lerinden erişim (192.168.x.x:3000 vb.)
_csrf_idx = MIDDLEWARE.index('django.middleware.csrf.CsrfViewMiddleware')
MIDDLEWARE.insert(_csrf_idx, 'shared.middleware.dev_lan_csrf.DevLanCsrfMiddleware')

# CSRF and Session cookies for development
# Use Lax on plain http://localhost — SameSite=None requires Secure, which Chrome
# rejects without HTTPS and breaks browser login/session even when credentials are valid.
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_DOMAIN = None
CSRF_COOKIE_NAME = 'lms_csrftoken'

SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = False
SESSION_COOKIE_DOMAIN = None
SESSION_COOKIE_PATH = '/'

# Çek/senet portföy akışı — geliştirmede açık
CEK_SENET_V2_ENABLED = os.environ.get('CEK_SENET_V2_ENABLED', 'true').lower() in ('1', 'true', 'yes')
