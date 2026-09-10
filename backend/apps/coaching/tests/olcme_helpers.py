"""Ölçme API testleri için yetki atama."""
from apps.roller.models import Permission, Role, RolePermission, UserRole


def grant_olcme_write(user, kurum=None):
    perm, _ = Permission.objects.get_or_create(
        code='olcme.write',
        defaults={
            'name': 'Ölçme Yazma',
            'module': 'olcme',
            'permission_type': 'write',
        },
    )
    role, _ = Role.objects.get_or_create(
        code='olcme_write_test',
        defaults={'name': 'Ölçme Yazma Test', 'level': 80},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(
        user=user,
        defaults={'role': role, 'kurum': kurum},
    )
    return role
