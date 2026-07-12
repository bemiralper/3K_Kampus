"""
Personel App Config
"""
from django.apps import AppConfig


class PersonelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.personel'
    verbose_name = 'Personel Yönetimi'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            # Migrate / partial boot sırasında yedekleme henüz hazır olmayabilir
            pass
