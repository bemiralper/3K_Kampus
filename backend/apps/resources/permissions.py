"""Kaynak kütüphanesi: koçlar okuyabilir, yazma işlemleri yönetici gerektirir."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.coaching.services.coach_access import is_resource_admin


class IsAuthenticatedResourceReadOrAdminWrite(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_resource_admin(request.user)
