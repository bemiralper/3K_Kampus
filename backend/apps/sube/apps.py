from django.apps import AppConfig

class SubeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.sube'
    verbose_name = 'Şube Yönetimi'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            # Migrate / partial boot sırasında yedekleme henüz hazır olmayabilir
            pass
