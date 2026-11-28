"""Öğrenci kayıt API yetkileri."""
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.views import APIView as DRFAPIView

from shared.permissions import user_has_any_permission, user_has_module_permission


class OgrenciKayitModulePermission(BasePermission):
    def has_permission(self, request, view):
        write = request.method not in SAFE_METHODS
        return user_has_module_permission(request.user, "ogrenci", write=write)


class GunuBirlikReadPermission(BasePermission):
    """Öğrenci veya Ölçme modülünde okuma/yazma yetkisi olan personel."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            user_has_module_permission(request.user, "ogrenci", write=False)
            or user_has_module_permission(request.user, "olcme", write=False)
        )


class GunuBirlikWritePermission(BasePermission):
    """Toplu deneme kaydı / Excel: öğrenci yazma veya ölçme yazma yetkisi."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            user_has_module_permission(request.user, "ogrenci", write=True)
            or user_has_module_permission(request.user, "olcme", write=True)
        )


class GunuBirlikDurumPermission(BasePermission):
    """Pasife alma: ogrenci.delete/manage; yeniden aktifleştirme: ogrenci.write/delete/manage."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        aktif_raw = request.data.get("aktif_mi") if hasattr(request, "data") else None
        if aktif_raw is True or str(aktif_raw).lower() in ("true", "1"):
            return user_has_any_permission(
                request.user, "ogrenci.write", "ogrenci.delete", "ogrenci.manage"
            )
        return user_has_any_permission(request.user, "ogrenci.delete", "ogrenci.manage")


class OgrenciKayitAPIView(DRFAPIView):
    permission_classes = [IsAuthenticated, OgrenciKayitModulePermission]
