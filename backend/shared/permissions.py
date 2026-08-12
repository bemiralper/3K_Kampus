"""
Ortak rol tabanlı izin yardımcıları — DRF ve Django function view'lar için.
"""
from functools import wraps

from django.http import JsonResponse
from rest_framework.permissions import BasePermission, SAFE_METHODS

from shared.api_helpers import require_api_login


def _user_role(user):
    try:
        user_role = user.user_role
        if user_role and user_role.role:
            return user_role.role
    except Exception:
        pass
    return None


def user_has_permission(user, code: str) -> bool:
    """Kullanıcının belirtilen yetkiye (veya modül manage) sahip olup olmadığını kontrol eder."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    role = _user_role(user)
    if not role:
        return False

    if role.has_permission('sistem.admin'):
        return True
    if role.has_permission(code):
        return True

    if '.' in code:
        module = code.split('.', 1)[0]
        if role.has_permission(f'{module}.manage'):
            return True

    return False


def user_has_any_permission(user, *codes: str) -> bool:
    return any(user_has_permission(user, code) for code in codes)


def user_has_module_permission(user, module: str, *, write: bool = False) -> bool:
    """Modül read/write/manage yetkilerini method-aware kontrol eder."""
    if write:
        return user_has_any_permission(user, f'{module}.write', f'{module}.manage')
    return user_has_any_permission(
        user,
        f'{module}.read',
        f'{module}.write',
        f'{module}.manage',
    )


def user_permission_codes(user) -> list[str]:
    """Kullanıcının aktif rolündeki tüm yetki kodlarını döndürür."""
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser:
        return ['sistem.admin']

    role = _user_role(user)
    if not role:
        return []

    return list(role.get_all_permissions().values_list('code', flat=True))


class HasPermission(BasePermission):
    """Tek bir yetki kodu gerektirir."""

    def __init__(self, code: str):
        self.code = code

    def has_permission(self, request, view):
        return user_has_permission(request.user, self.code)


class HasAnyPermission(BasePermission):
    """Verilen yetkilerden birini gerektirir."""

    def __init__(self, *codes: str):
        self.codes = codes

    def has_permission(self, request, view):
        return user_has_any_permission(request.user, *self.codes)


class FinansModulePermission(BasePermission):
    """GET → finans.read/write/manage; POST/PUT/PATCH → finans.write/manage; DELETE → finans.delete/manage."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return user_has_any_permission(
                request.user,
                'finans.read',
                'finans.write',
                'finans.manage',
            )
        if request.method == 'DELETE':
            return user_has_any_permission(
                request.user,
                'finans.delete',
                'finans.manage',
            )
        return user_has_any_permission(
            request.user,
            'finans.write',
            'finans.manage',
        )


class FinansManagePermission(BasePermission):
    """Ödeme takip modülü — finans.manage gerektirir."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_permission(request.user, 'finans.manage')


class CommunicationModulePermission(BasePermission):
    """GET → communication.read/write/manage; yazma → communication.write/manage."""

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


class OgrenciKayitReadPermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_any_permission(request.user, 'ogrenci.read', 'ogrenci.write', 'ogrenci.manage')


class OgrenciKayitWritePermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_any_permission(request.user, 'ogrenci.write', 'ogrenci.manage')


def user_can_manage_coach_assignment(user) -> bool:
    """Koç atama/değiştirme — admin, muhasebe rolü veya ogrenci.manage."""
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    role = _user_role(user)
    if role and role.code == 'muhasebe':
        return True
    return user_has_permission(user, 'ogrenci.manage')


class CoachAssignmentManagePermission(BasePermission):
    """Koç-öğrenci ataması oluşturma, güncelleme ve silme."""

    def has_permission(self, request, view):
        return user_can_manage_coach_assignment(request.user)


def _permission_denied_json():
    return JsonResponse(
        {'success': False, 'error': 'Bu işlem için yetkiniz yok.'},
        status=403,
    )


def api_permission_required(*read_codes, write_codes=None):
    """Django JSON API view'ları için method-aware izin kontrolü."""

    def decorator(view_func):
        @wraps(view_func)
        @require_api_login
        def wrapper(request, *args, **kwargs):
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                codes = read_codes
            else:
                codes = write_codes or read_codes
            if not user_has_any_permission(request.user, *codes):
                return _permission_denied_json()
            return view_func(request, *args, **kwargs)

        return wrapper

    return decorator


require_personel_read_api = api_permission_required(
    'personel.read', 'personel.write', 'personel.manage',
)
require_personel_write_api = api_permission_required(
    'personel.write', 'personel.manage',
    write_codes=('personel.write', 'personel.manage'),
)
require_personel_manage_api = api_permission_required('personel.manage')

require_ogrenci_api = api_permission_required(
    'ogrenci.read', 'ogrenci.write', 'ogrenci.manage',
    write_codes=('ogrenci.write', 'ogrenci.manage'),
)
require_ogrenci_delete_api = api_permission_required(
    'ogrenci.delete', 'ogrenci.manage',
    write_codes=('ogrenci.delete', 'ogrenci.manage'),
)
require_kurum_api = api_permission_required(
    'kurum.read', 'kurum.write', 'kurum.manage',
    write_codes=('kurum.write', 'kurum.manage'),
)
require_sube_api = api_permission_required(
    'sube.read', 'sube.write', 'sube.manage',
    write_codes=('sube.write', 'sube.manage'),
)
require_roller_api = api_permission_required(
    'roller.read', 'roller.write', 'roller.manage',
    write_codes=('roller.write', 'roller.manage'),
)
require_roller_manage_api = api_permission_required(
    'roller.manage',
    write_codes=('roller.manage',),
)
require_sinif_api = api_permission_required(
    'sinif.read', 'sinif.write', 'sinif.manage',
    write_codes=('sinif.write', 'sinif.manage'),
)
def _user_is_active_coach(user) -> bool:
    """Koç profili olan kullanıcılar ders/sınıf lookup GET için yeterli."""
    try:
        from apps.coaching.services.coach_access import get_coach_profile
        return get_coach_profile(user) is not None
    except Exception:
        return False


def require_egitim_tanimlari_api(view_func):
    """
    Eğitim tanımları API — yazma için rol yetkisi şart.
    GET/HEAD/OPTIONS: egitim_tanimlari.* veya aktif koç profili
    (kitap atama / ödev paketleri ders seçicisi).
    """

    @wraps(view_func)
    @require_api_login
    def wrapper(request, *args, **kwargs):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            allowed = user_has_any_permission(
                request.user,
                'egitim_tanimlari.read',
                'egitim_tanimlari.write',
                'egitim_tanimlari.manage',
            ) or _user_is_active_coach(request.user)
        else:
            allowed = user_has_any_permission(
                request.user,
                'egitim_tanimlari.write',
                'egitim_tanimlari.manage',
            )
        if not allowed:
            return _permission_denied_json()
        return view_func(request, *args, **kwargs)

    return wrapper
require_egitim_paketleri_api = api_permission_required(
    'egitim_paketleri.read', 'egitim_paketleri.write', 'egitim_paketleri.manage',
    write_codes=('egitim_paketleri.write', 'egitim_paketleri.manage'),
)
require_gorev_api = api_permission_required(
    'gorev.read', 'gorev.write', 'gorev.manage',
    write_codes=('gorev.write', 'gorev.manage'),
)


def require_module_permission(module: str, *, manage_only: bool = False):
    """Personel vb. Django JSON API uçları için modül bazlı izin."""

    def decorator(view_func):
        @wraps(view_func)
        @require_api_login
        def wrapper(request, *args, **kwargs):
            if manage_only:
                allowed = user_has_permission(request.user, f'{module}.manage')
            elif request.method in ('GET', 'HEAD', 'OPTIONS'):
                allowed = user_has_module_permission(request.user, module, write=False)
            else:
                allowed = user_has_module_permission(request.user, module, write=True)
            if not allowed:
                return _permission_denied_json()
            return view_func(request, *args, **kwargs)

        return wrapper

    return decorator
