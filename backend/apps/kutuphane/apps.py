"""
Kütüphane App Config
"""
from django.apps import AppConfig


class KutuphaneConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.kutuphane'
    verbose_name = 'Kütüphane Yönetimi'
