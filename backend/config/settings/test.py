"""
Test Settings
"""
import os
from .base import *

DEBUG = True

# `apps` namespace paketi nedeniyle keşif kökü backend/ olmalı (bkz. config/test_runner.py)
TEST_RUNNER = 'config.test_runner.LmsTestRunner'

# Native: localhost:5432 / taner. Docker: compose DB_* (db:5432, user lms).
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('TEST_DB_NAME', 'test_lms_db'),
        'USER': os.environ.get('DB_USER', 'taner'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Password hashers (faster for tests)
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Email
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
