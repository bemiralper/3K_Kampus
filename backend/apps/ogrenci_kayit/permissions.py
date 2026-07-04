"""Öğrenci kayıt API yetkileri."""
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.views import APIView as DRFAPIView

from shared.permissions import user_has_module_permission


class OgrenciKayitModulePermission(BasePermission):
    def has_permission(self, request, view):
        write = request.method not in SAFE_METHODS
        return user_has_module_permission(request.user, "ogrenci", write=write)


class OgrenciKayitAPIView(DRFAPIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]
