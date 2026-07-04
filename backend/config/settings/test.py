"""
Test Settings
"""
from .base import *

DEBUG = True

# Test database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'test_lms_db',
        'USER': 'taner',
        'PASSWORD': '',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# Password hashers (faster for tests)
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Email
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
