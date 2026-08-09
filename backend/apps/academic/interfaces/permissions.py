"""Akademik Operasyon modülü — ortak yetkilendirme yardımcıları.

Önceden bu modüldeki view'ların büyük çoğunluğu `AllowAny` (DRF) ya da hiçbir
yetki/login kontrolü olmadan (plain Django view) çalışıyordu. Bu dosya, hem DRF
`@api_view` uçları hem de düz Django JSON view'ları için tek bir okuma/yazma
yetki modeli sağlar.

Okuma (GET/HEAD/OPTIONS): sinif.read / sinif.write / sinif.manage /
    egitim_tanimlari.read / egitim_tanimlari.manage
Yazma (POST/PUT/PATCH/DELETE): sinif.write / sinif.manage / egitim_tanimlari.manage

`user_has_any_permission` süper kullanıcıyı ve `sistem.admin` yetkisini de
otomatik olarak kapsar (bkz. shared/permissions.py).
"""
from functools import wraps

from django.http import JsonResponse
from rest_framework.permissions import BasePermission, SAFE_METHODS

from shared.permissions import user_has_any_permission

ACADEMIC_READ_CODES = (
    'sinif.read', 'sinif.write', 'sinif.manage',
    'egitim_tanimlari.read', 'egitim_tanimlari.manage',
)
ACADEMIC_WRITE_CODES = ('sinif.write', 'sinif.manage', 'egitim_tanimlari.manage')


def user_can_read_academic(user) -> bool:
    return bool(user and user.is_authenticated and user_has_any_permission(user, *ACADEMIC_READ_CODES))


def user_can_write_academic(user) -> bool:
    return bool(user and user.is_authenticated and user_has_any_permission(user, *ACADEMIC_WRITE_CODES))


class AcademicModulePermission(BasePermission):
    """DRF `@api_view` uçları için method-aware modül izni.

    GET/HEAD/OPTIONS → okuma yetkisi; diğer metodlar → yazma yetkisi ister.
    """

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_any_permission(request.user, *ACADEMIC_READ_CODES)
        return user_has_any_permission(request.user, *ACADEMIC_WRITE_CODES)


def academic_view_permission(view_func):
    """Düz Django JSON view'ları için login + method-aware modül izni.

    `@csrf_exempt` / `@require_http_methods` ile birlikte, `def` satırına en
    yakın decorator olarak eklenmelidir.
    """

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {'success': False, 'error': 'Oturum açmanız gerekiyor. Lütfen tekrar giriş yapın.'},
                status=401,
            )
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            allowed = user_has_any_permission(request.user, *ACADEMIC_READ_CODES)
        else:
            allowed = user_has_any_permission(request.user, *ACADEMIC_WRITE_CODES)
        if not allowed:
            return JsonResponse(
                {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
                status=403,
            )
        return view_func(request, *args, **kwargs)

    return wrapper
