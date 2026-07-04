"""
İletişim modülü DRF izinleri.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS

from shared.permissions import user_has_any_permission, user_has_permission


class CommunicationModulePermission(BasePermission):
    """GET → communication.read/manage; yazma → communication.write/manage."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_any_permission(
                request.user,
                'communication.read',
                'communication.write',
                'communication.manage',
            )
        return user_has_any_permission(
            request.user,
            'communication.write',
            'communication.manage',
        )


class CommunicationConfigPermission(BasePermission):
    """WABA yapılandırma — communication.config veya manage."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_any_permission(
            request.user,
            'communication.config',
            'communication.manage',
        )


class CommunicationManagePermission(BasePermission):
    """Log ve admin işlemleri — communication.manage."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_permission(request.user, 'communication.manage')


class CommunicationBulkPermission(BasePermission):
    """Toplu gönderim — communication.bulk, manage veya koç write kapsamı."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if user_has_any_permission(
            request.user,
            'communication.bulk',
            'communication.manage',
        ):
            return True
        from apps.coaching.services.coach_access import scoped_student_ids

        allowed = scoped_student_ids(request.user)
        if allowed is not None and user_has_any_permission(
            request.user,
            'communication.write',
            'communication.read',
        ):
            return True
        if request.method in SAFE_METHODS:
            return user_has_any_permission(
                request.user,
                'communication.read',
                'communication.bulk',
                'communication.manage',
            )
        return False


class TemplateWritePermission(BasePermission):
    """Hazır yanıt şablonu yazma — admin, koç (coach kapsamı) veya muhasebe."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if user_has_any_permission(
            request.user,
            'communication.bulk',
            'communication.manage',
        ):
            return True
        from apps.coaching.services.coach_access import get_coach_profile, is_resource_admin

        if is_resource_admin(request.user):
            return True
        if get_coach_profile(request.user) and user_has_any_permission(
            request.user,
            'communication.read',
            'communication.write',
        ):
            return True
        if user_has_any_permission(request.user, 'finans.read', 'finans.manage'):
            return True
        return False
