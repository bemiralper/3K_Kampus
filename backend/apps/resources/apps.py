from django.apps import AppConfig


class ResourcesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.resources'
    verbose_name = 'Kaynak Kütüphanesi'

    def ready(self):
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            # Migrate / partial boot sırasında yedekleme henüz hazır olmayabilir
            pass
        # Ödev görev başlıklarını içerik adıyla senkron tut (idempotent)
        try:
            from apps.coaching.assignment_manual import content_sync  # noqa: F401
        except Exception:
            pass
