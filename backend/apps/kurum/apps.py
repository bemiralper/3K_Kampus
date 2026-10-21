"""
Kurum App Config
"""
from django.apps import AppConfig


class KurumConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.kurum'
    verbose_name = 'Kurum Yönetimi'

    def ready(self):
        # Django'nun UPPER() karşılaştırması İ ile i'yi ayırır (İncesu ≠ incesu).
        # Varsayılan icontains/iexact kayıtlarından sonra değiştirilmeli.
        from shared.turkish_search import register_turkish_lookups
        register_turkish_lookups()
        try:
            from apps.yedekleme.registry import register_resources
            from .backup_resources import RESOURCES
            register_resources(self.label, RESOURCES)
        except Exception:
            # Migrate / partial boot sırasında yedekleme henüz hazır olmayabilir
            pass
