"""
Cari v2 — Etkin yetki çözümleyici (Yetkiler sekmesi için).

Cari modülü finans modül izinlerini kullanır (finans.read/write/delete/manage).
`finans.manage` yetkisi tüm finans.* alt yetkilerini kapsar; bu nedenle
muhasebe rolü (finans.manage) cari modülünde tam yetkilidir.
"""
from __future__ import annotations

from shared.permissions import user_has_any_permission, user_has_permission


def cari_effective_permissions(user) -> dict:
    """Kullanıcının cari modülündeki etkin yetkilerini döndürür."""
    can_view = user_has_any_permission(
        user, 'finans.read', 'finans.write', 'finans.manage',
    )
    can_edit = user_has_any_permission(user, 'finans.write', 'finans.manage')
    can_delete = user_has_any_permission(user, 'finans.delete', 'finans.manage')
    can_manage = user_has_permission(user, 'finans.manage')

    role_code = None
    role_name = None
    try:
        user_role = getattr(user, 'user_role', None)
        if user_role and user_role.role:
            role_code = user_role.role.code
            role_name = user_role.role.name
    except Exception:
        pass

    return {
        'can_view': can_view,
        'can_create': can_edit,
        'can_edit': can_edit,
        'can_delete': can_delete,
        'can_manage': can_manage,
        'can_export': can_view,
        'is_superuser': bool(getattr(user, 'is_superuser', False)),
        'role_code': role_code,
        'role_name': role_name,
    }
