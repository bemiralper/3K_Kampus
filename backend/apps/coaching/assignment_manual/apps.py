"""
Manuel Ödev Atama App Config
"""
from django.apps import AppConfig


class AssignmentManualConfig(AppConfig):
    default = True
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.coaching.assignment_manual'
    verbose_name = 'Manuel Ödev Atama'

    def ready(self):
        # ResourceContent.ad → AssignmentTask.title senkronu
        from . import content_sync  # noqa: F401
