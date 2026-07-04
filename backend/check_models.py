import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.development'
import django
django.setup()
from django.apps import apps
app = apps.get_app_config('odeme_takip')
for m in app.get_models():
    print(m.__name__, m._meta.app_label)
