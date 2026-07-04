"""
Kütüphane API — koç operasyonel erişim ve altyapı yazma yetkisi.
"""
from django.http import JsonResponse

from apps.coaching.services.coach_access import (
    filter_by_student_scope,
    get_coach_profile,
    is_resource_admin,
    user_can_access_student,
)


def is_kutuphane_infra_admin(user):
    """Salon/masa/dolap altyapısı oluşturma — yalnızca kurum yöneticileri."""
    return is_resource_admin(user)


def kutuphane_forbidden(message='Bu işlem için yetkiniz yok'):
    return JsonResponse({'success': False, 'error': message}, status=403)


def require_infra_admin(request):
    if not is_kutuphane_infra_admin(request.user):
        return kutuphane_forbidden()
    return None


def is_kutuphane_operational_coach(user):
    """
    Masa/dolap ataması, izin, yoklama — tüm koçlar kurum genelinde işlem yapabilir.
    """
    if is_resource_admin(user):
        return True
    return get_coach_profile(user) is not None


def require_kutuphane_operational_access(request, student_id):
    """Atama, izin, geçici oturma — koçlar tüm öğrenciler için."""
    if is_kutuphane_operational_coach(request.user):
        return None
    if student_id is None:
        return kutuphane_forbidden('Öğrenci seçilmedi')
    if not user_can_access_student(request.user, int(student_id)):
        return kutuphane_forbidden('Bu öğrenciye erişim yetkiniz yok')
    return None


def filter_kutuphane_assignments_qs(queryset, user, student_field='ogrenci_id'):
    """Atama listeleri — koçlar kurum geneli görür."""
    if is_kutuphane_operational_coach(user):
        return queryset
    return filter_by_student_scope(queryset, user, student_field=student_field)
