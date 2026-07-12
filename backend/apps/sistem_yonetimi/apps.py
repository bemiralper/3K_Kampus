from django.apps import AppConfig


class SistemYonetimiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.sistem_yonetimi'
    verbose_name = 'Sistem Yönetimi'

    def ready(self):
        # Registry registrations (import side-effects)
        from apps.sistem_yonetimi.registry import builtins  # noqa: F401
