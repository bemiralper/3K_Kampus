"""
Rol Yönetimi App Configuration
"""
import sys

from django.apps import AppConfig


def _seed_roles_after_migrate(sender, **kwargs):
    if sender.name != 'apps.roller':
        return
    from apps.roller.seed import ensure_default_roles
    ensure_default_roles()


def _seed_roles_on_startup():
    if any(cmd in sys.argv for cmd in ('migrate', 'makemigrations', 'test', 'shell')):
        return
    try:
        from django.db import connection
        connection.ensure_connection()
        if 'system_role' not in connection.introspection.table_names():
            return
        from apps.roller.seed import ensure_default_roles
        ensure_default_roles()
    except Exception:
        pass


class RollerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.roller'
    verbose_name = 'Rol Yönetimi'

    def ready(self):
        from django.db.models.signals import post_migrate
        post_migrate.connect(_seed_roles_after_migrate, sender=self)
        _seed_roles_on_startup()
