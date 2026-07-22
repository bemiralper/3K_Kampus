"""
Production Settings
"""
from django.core.exceptions import ImproperlyConfigured

from .base import *

DEBUG = False

LMS_ENVIRONMENT = 'production'
DEMO_DATABASE_ALLOWED = False
ENVIRONMENT_LABEL = os.environ.get('ENVIRONMENT_LABEL', 'Canlı')

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '').split(',') if h.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured('ALLOWED_HOSTS production ortamında zorunludur.')

if not os.environ.get('SECRET_KEY') or SECRET_KEY.startswith('django-insecure-'):
    raise ImproperlyConfigured('SECRET_KEY production ortamında güçlü ve benzersiz olmalıdır.')

if not os.environ.get('DB_NAME'):
    raise ImproperlyConfigured('DB_NAME production ortamında zorunludur.')

if not WHATSAPP_APP_SECRET:
    raise ImproperlyConfigured(
        'WHATSAPP_APP_SECRET production ortamında zorunludur (webhook HMAC doğrulaması).'
    )

# Database — DB_SSLMODE: require (managed DB), prefer veya disable (aynı sunucu PG)
_db_sslmode = os.environ.get('DB_SSLMODE', 'require').strip()
_db_options = {}
if _db_sslmode and _db_sslmode.lower() != 'disable':
    _db_options['sslmode'] = _db_sslmode

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME'),
        'USER': os.environ.get('DB_USER'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),
        'HOST': os.environ.get('DB_HOST'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'CONN_MAX_AGE': 600,
        'OPTIONS': _db_options,
    }
}

# Nginx / reverse proxy arkasında HTTPS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

# Security
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'true').lower() in ('1', 'true', 'yes')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

_hsts = int(os.environ.get('SECURE_HSTS_SECONDS', '0'))
if _hsts > 0:
    SECURE_HSTS_SECONDS = _hsts
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# CSRF — HTTPS login (Next.js same-origin proxy + doğrudan API)
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()
]
CSRF_TRUSTED_ORIGINS.extend(
    o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS_EXTRA', '').split(',') if o.strip()
)
if FRONTEND_URL and FRONTEND_URL not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(FRONTEND_URL)

# CORS — production'da FRONTEND_URL (+ opsiyonel ek origin'ler)
CORS_ALLOW_ALL_ORIGINS = False
_cors = [o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]
if FRONTEND_URL and FRONTEND_URL not in _cors:
    _cors.append(FRONTEND_URL)
if _cors:
    CORS_ALLOWED_ORIGINS = _cors

# Email
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL') or os.environ.get('EMAIL_HOST_USER') or 'no-reply@localhost'
SERVER_EMAIL = DEFAULT_FROM_EMAIL
