"""
Kurum App Config
"""
from django.apps import AppConfig


class KurumConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.kurum'
    verbose_name = 'Kurum Yönetimi'
