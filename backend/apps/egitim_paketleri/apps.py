from django.apps import AppConfig


class EgitimPaketleriConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.egitim_paketleri'
    verbose_name = 'Eğitim Paketleri'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            pass
