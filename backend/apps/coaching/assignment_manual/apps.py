"""
Manuel Ödev Atama App Config
"""
from django.apps import AppConfig


class AssignmentManualConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.coaching.assignment_manual'
    verbose_name = 'Manuel Ödev Atama'
