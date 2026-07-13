from django.apps import AppConfig


class KimlikConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.kimlik'
    verbose_name = 'Kimlik Birleştirme'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            pass
