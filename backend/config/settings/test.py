"""
Test Settings
"""
import os
import tempfile
from pathlib import Path

from .base import *

# Testler /var/lock kullanmaz. Üretim cron ile aynı dosya adı burada değildir.
_guard_dir = Path(tempfile.gettempdir()) / 'lms-yedek-test-guard'
_guard_dir.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('LMS_BACKUP_LOCK', str(_guard_dir / 'lms-backup.lock'))
os.environ.setdefault('LMS_BACKUP_HEARTBEAT', str(_guard_dir / 'backup.heartbeat'))

DEBUG = True

MOBILE_IDENTITY_ENABLED = True

# `apps` namespace paketi nedeniyle keşif kökü backend/ olmalı (bkz. config/test_runner.py)
TEST_RUNNER = 'config.test_runner.LmsTestRunner'

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

# Yalnızca izole test süreci aynı test veritabanını açsın diye.
# Üretim ayarı bu değişkeni okumaz.
_test_db_name = os.environ.get('LMS_TEST_DB_NAME', '').strip()
if _test_db_name:
    DATABASES['default']['NAME'] = _test_db_name

# Password hashers (faster for tests)
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Email
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# İletişim testleri: WhatsApp kimlik bilgisi yokken simüle gönderim başarılı sayılır
COMMUNICATION_ALLOW_STUB_SEND = True
# Test işlemi tek thread'de kalsın; paralel işçi başka bağlantıda satırı görmez.
COMMUNICATION_QUEUE_WORKERS = 1
