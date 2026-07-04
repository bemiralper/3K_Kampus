"""
Ogrenci App Config
"""
from django.apps import AppConfig


class OgrenciConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.ogrenci'
    verbose_name = 'Öğrenci Yönetimi'
