"""
Personel App Config
"""
from django.apps import AppConfig


class PersonelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.personel'
    verbose_name = 'Personel Yönetimi'
