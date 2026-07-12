"""
Coaching App Configuration
"""
from django.apps import AppConfig


class CoachingConfig(AppConfig):
    """Coaching application configuration"""
    
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.coaching'
    verbose_name = 'Koçluk Yönetimi'
    verbose_name_plural = 'Koçluk Yönetimi'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            # Migrate / partial boot sırasında yedekleme henüz hazır olmayabilir
            pass
