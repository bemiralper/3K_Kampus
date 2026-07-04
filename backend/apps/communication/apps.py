"""
Communication App Config — İletişim Merkezi (WhatsApp, SMS, Email)
"""
from django.apps import AppConfig


class CommunicationConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.communication'
    verbose_name = 'İletişim Merkezi'

    def ready(self):
        import apps.communication.signals  # noqa: F401
