"""
Demo ortamı — geliştirme ve test için ayrı PostgreSQL veritabanı (varsayılan: lms_demo_db).

Kullanım:
  DJANGO_ENV=demo python manage.py runserver
  DJANGO_ENV=demo python manage.py setup_demo_database --seed
"""
from .development import *

LMS_ENVIRONMENT = 'demo'
DEMO_DATABASE_ALLOWED = True

# Canlı veritabanından kopuk demo DB
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'lms_demo_db'),
        'USER': os.environ.get('DB_USER', 'taner'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Demo ortamında görsel ayrım (log / API)
ENVIRONMENT_LABEL = os.environ.get('ENVIRONMENT_LABEL', 'Demo')
