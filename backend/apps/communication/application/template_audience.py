"""
Mesaj şablonu hedef kitle (admin / koç / muhasebe) çözümlemesi.
"""
from __future__ import annotations

from django.core.exceptions import PermissionDenied

from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin
from apps.communication.domain.enums import TemplateAudienceScope
from shared.permissions import user_has_any_permission


def visible_audience_scopes_for_user(user) -> list[str]:
    """Kullanıcının görebileceği şablon kitleleri."""
    if not user or not user.is_authenticated:
        return []

    if is_resource_admin(user) or user_has_any_permission(
        user, 'communication.manage', 'communication.bulk'
    ):
        return [
            TemplateAudienceScope.GENEL,
            TemplateAudienceScope.ADMIN,
            TemplateAudienceScope.COACH,
            TemplateAudienceScope.MUHASEBE,
        ]

    scopes: list[str] = [TemplateAudienceScope.GENEL]
    if get_coach_profile(user):
        scopes.append(TemplateAudienceScope.COACH)
    if user_has_any_permission(user, 'finans.read', 'finans.manage'):
        scopes.append(TemplateAudienceScope.MUHASEBE)
    return list(dict.fromkeys(scopes))


def assert_can_write_template(user, audience_scope: str) -> None:
    """Şablon oluşturma/güncelleme yetkisi — kitle bazlı."""
    if not user or not user.is_authenticated:
        raise PermissionDenied('Yetkisiz.')

    scope = audience_scope or TemplateAudienceScope.GENEL

    if is_resource_admin(user) or user_has_any_permission(
        user, 'communication.manage', 'communication.bulk'
    ):
        return

    if scope == TemplateAudienceScope.COACH:
        if get_coach_profile(user):
            return
        raise PermissionDenied('Koç şablonu oluşturmak için koç profili gerekir.')

    if scope == TemplateAudienceScope.MUHASEBE:
        if user_has_any_permission(user, 'finans.read', 'finans.manage'):
            return
        raise PermissionDenied('Muhasebe şablonu için finans yetkisi gerekir.')

    if scope in (TemplateAudienceScope.ADMIN, TemplateAudienceScope.GENEL):
        raise PermissionDenied('Bu kitle için şablon yönetimi yetkiniz yok.')

    raise PermissionDenied('Şablon yönetimi için yetkiniz yok.')
