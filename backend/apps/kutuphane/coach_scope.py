"""
Kütüphane API — koç / muhasebe / admin operasyonel erişim.
"""
from django.http import JsonResponse

from apps.coaching.services.coach_access import (
    filter_by_student_scope,
    get_coach_profile,
    is_resource_admin,
    user_can_access_student,
)


def _role_code(user):
    try:
        return user.user_role.role.code
    except Exception:
        return None


def _has_finans_portal_permissions(user):
    try:
        perms = set(user.user_role.role.get_all_permissions().values_list('code', flat=True))
        return bool(perms & {'finans.manage', 'finans.write', 'finans.read'})
    except Exception:
        return False


def is_kutuphane_full_access(user):
    """
    Kütüphane modülünde tam yetki — admin paneli, muhasebe portalı ve koç portalı.
    """
    if not user or not user.is_authenticated:
        return False
    if is_resource_admin(user):
        return True
    if get_coach_profile(user) is not None:
        return True
    if _role_code(user) == 'muhasebe':
        return True
    if _has_finans_portal_permissions(user):
        return True
    return False


def is_kutuphane_infra_admin(user):
    """Salon/masa/dolap altyapısı — tüm portal kullanıcıları."""
    return is_kutuphane_full_access(user)


def kutuphane_forbidden(message='Bu işlem için yetkiniz yok'):
    return JsonResponse({'success': False, 'error': message}, status=403)


def require_infra_admin(request):
    if not is_kutuphane_infra_admin(request.user):
        return kutuphane_forbidden()
    return None


def is_kutuphane_operational_coach(user):
    """Atama, izin, yoklama — tüm portal kullanıcıları kurum genelinde."""
    return is_kutuphane_full_access(user)


def require_kutuphane_operational_access(request, student_id):
    if is_kutuphane_operational_coach(request.user):
        return None
    if student_id is None:
        return kutuphane_forbidden('Öğrenci seçilmedi')
    if not user_can_access_student(request.user, int(student_id)):
        return kutuphane_forbidden('Bu öğrenciye erişim yetkiniz yok')
    return None


def filter_kutuphane_assignments_qs(queryset, user, student_field='ogrenci_id'):
    """Atama listeleri — portal kullanıcıları kurum geneli görür."""
    if is_kutuphane_operational_coach(user):
        return queryset
    return filter_by_student_scope(queryset, user, student_field=student_field)
