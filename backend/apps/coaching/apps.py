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
