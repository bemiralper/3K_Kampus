"""
Çalışma Programı App Config
"""
from django.apps import AppConfig


class StudyProgramConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.coaching.study_program'
    verbose_name = 'Çalışma Programı'
