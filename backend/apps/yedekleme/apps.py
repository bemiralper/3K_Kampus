from django.apps import AppConfig


class YedeklemeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.yedekleme'
    verbose_name = 'Yedekleme ve Geri Yükleme'

    def ready(self):
        from apps.yedekleme.registry import register_resources
        from apps.yedekleme.registry.system_resources import SYSTEM_RESOURCES

        register_resources('system', SYSTEM_RESOURCES)
        # DB sync is deferred to first request / management command to avoid
        # migrate-time issues; also exposed via API sync endpoint.
