"""Kaynak kütüphanesi: admin ve aktif koçlar okuyup yazabilir."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin


def can_manage_resources(user):
    """Kitap/ünite/konu/içerik yazma — admin veya aktif koç."""
    if not user or not user.is_authenticated:
        return False
    if is_resource_admin(user):
        return True
    return get_coach_profile(user) is not None


class IsAuthenticatedResourceReadOrAdminWrite(BasePermission):
    """Geriye dönük ad: yazma artık admin + koç."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return can_manage_resources(request.user)
