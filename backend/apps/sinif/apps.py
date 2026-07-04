"""
Sinif App Config
"""
from django.apps import AppConfig


class SinifConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.sinif'
    verbose_name = 'Sınıf Yönetimi'
