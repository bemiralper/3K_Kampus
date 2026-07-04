"""
Django Settings Package
"""
import os

env = os.environ.get('DJANGO_ENV', 'development')

if env == 'production':
    from .production import *
elif env == 'test':
    from .test import *
elif env == 'demo':
    from .demo import *
else:
    from .development import *
