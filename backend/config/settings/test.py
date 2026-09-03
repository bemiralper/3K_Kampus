"""
Test Settings
"""
from .base import *

DEBUG = True

# `apps` namespace paketi nedeniyle keşif kökü backend/ olmalı (bkz. config/test_runner.py)
TEST_RUNNER = 'config.test_runner.LmsTestRunner'

# Test database — varsayılan native Homebrew kurulumu; Docker içinde koşarken
# TEST_DB_* değişkenleriyle (ör. TEST_DB_HOST=db TEST_DB_USER=lms) yönlendirilir.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('TEST_DB_NAME', 'test_lms_db'),
        'USER': os.environ.get('TEST_DB_USER', 'taner'),
        'PASSWORD': os.environ.get('TEST_DB_PASSWORD', ''),
        'HOST': os.environ.get('TEST_DB_HOST', 'localhost'),
        'PORT': os.environ.get('TEST_DB_PORT', '5432'),
    }
}

# Password hashers (faster for tests)
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Email
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
