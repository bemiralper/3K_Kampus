"""
Koç–öğrenci erişim kapsamı (kaynak havuzu, manuel ödev).
"""
from django.db.models import Q


def get_coach_profile(user):
    """Giriş yapmış kullanıcının aktif koç profili."""
    if not user or not user.is_authenticated:
        return None
    try:
        personel = user.personel
        cp = personel.coach_profile
        if cp and cp.is_active and cp.is_coach:
            return cp
    except Exception:
        pass
    return None


_RESOURCE_ADMIN_ROLES = ('super_admin', 'admin', 'mudur', 'mudir_yardimcisi')


def _has_resource_admin_role(user):
    try:
        return user.user_role.role.code in _RESOURCE_ADMIN_ROLES
    except Exception:
        return False


def is_resource_admin(user):
    """
    Kurum yöneticisi / admin — tüm öğrencilere erişim.

    Süper kullanıcı ve super_admin / admin / müdür rolleri koç profilinden
    önce gelir: Kitap Atamaları detayı yönetici olarak açılabilmeli.

    is_staff olan rehberler (rolü yönetici değil) aktif koç profili varsa
    kurum geneli liste görmez; koç kapsamı (scoped_student_ids) uygulanır.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or _has_resource_admin_role(user):
        return True
    if get_coach_profile(user) is not None:
        return False
    return bool(user.is_staff)


def can_access_all_coaches(user) -> bool:
    """Admin veya muhasebe — koç yönetimi/atama ekranlarında tam koç listesi."""
    if is_resource_admin(user):
        return True
    from shared.permissions import user_can_manage_coach_assignment

    return user_can_manage_coach_assignment(user) and get_coach_profile(user) is None


def get_active_coach_student_ids(coach_profile):
    """Yönetici sayısı ile aynı: yalnızca aktif birincil atama."""
    from apps.coaching.models import CoachStudentAssignment

    return CoachStudentAssignment.objects.filter(
        coach=coach_profile,
        is_primary=True,
        end_date__isnull=True,
    ).values_list('student_id', flat=True)


def get_active_assignment_student_ids(coach_profile):
    """Aktif tüm atamalar (birincil + yardımcı). Sohbet görünürlüğü için."""
    from apps.coaching.models import CoachStudentAssignment

    return CoachStudentAssignment.objects.filter(
        coach=coach_profile,
        end_date__isnull=True,
    ).values_list('student_id', flat=True)


def scoped_student_ids(user):
    """
    Erişilebilir öğrenci ID'leri.
    None → admin, filtre yok.
    Koç → yalnızca aktif birincil atama (ödev/kaynak eski öğrenciyi listede tutmaz).
    """
    if is_resource_admin(user):
        return None

    coach_profile = get_coach_profile(user)
    if coach_profile is not None:
        return set(get_active_coach_student_ids(coach_profile))

    allowed = set()
    from apps.student_resources.models import StudentResourceAssignment

    allowed.update(
        StudentResourceAssignment.objects.filter(coach=user, is_active=True)
        .values_list('student_id', flat=True)
    )

    from apps.coaching.assignment_manual.models import ManualAssignment

    allowed.update(
        ManualAssignment.objects.filter(coach=user, is_active=True)
        .values_list('student_id', flat=True)
    )

    return allowed


def user_can_access_student(user, student_id):
    allowed = scoped_student_ids(user)
    if allowed is None:
        return True
    try:
        return int(student_id) in allowed
    except (TypeError, ValueError):
        return False


def filter_by_student_scope(queryset, user, student_field='student_id'):
    allowed = scoped_student_ids(user)
    if allowed is None:
        return queryset
    if not allowed:
        return queryset.none()
    return queryset.filter(**{f'{student_field}__in': allowed})


def filter_manual_assignments(queryset, user):
    if is_resource_admin(user):
        return queryset
    allowed = scoped_student_ids(user)
    if not allowed:
        return queryset.filter(coach=user)
    return queryset.filter(Q(student_id__in=allowed) | Q(coach=user))


def filter_by_assignment_scope(queryset, user, assignment_prefix='assignment'):
    """AssignmentLesson / AssignmentTask gibi ilişkili queryset'ler."""
    if is_resource_admin(user):
        return queryset
    allowed = scoped_student_ids(user)
    q = Q(**{f'{assignment_prefix}__coach': user})
    if allowed:
        q = q | Q(**{f'{assignment_prefix}__student_id__in': allowed})
    return queryset.filter(q)
