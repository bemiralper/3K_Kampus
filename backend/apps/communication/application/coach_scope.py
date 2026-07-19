"""
Koç kapsamı — konuşma erişimi ve toplu gönderim.
"""
from __future__ import annotations

from django.core.exceptions import PermissionDenied
from django.db.models import Q

from apps.coaching.services.coach_access import (
    get_coach_profile,
    is_resource_admin,
    scoped_student_ids,
)
from shared.permissions import user_has_any_permission

COACH_AUDIENCE_TYPES = frozenset({'coach_students', 'coach_parents', 'custom_ids', 'filtered'})


def _has_staff_messaging_access(user) -> bool:
    """Muhasebe vb. — öğrenci/finans erişimi olan iletişim kullanıcıları."""
    if not user_has_any_permission(user, 'communication.read', 'communication.write'):
        return False
    return user_has_any_permission(
        user,
        'ogrenci.read',
        'ogrenci.write',
        'ogrenci.manage',
        'finans.read',
        'finans.manage',
    )


def filter_conversations_for_user(qs, user):
    """Koç yalnızca atandığı veya kapsamındaki öğrencilerin konuşmalarını görür."""
    if is_resource_admin(user):
        return qs
    if user_has_any_permission(user, 'communication.manage'):
        return qs

    # Koç profili staff messaging izinlerinden önce uygulanır — aksi halde
    # ogrenci.read + communication.read olan koçlar kurum geneli görürdü.
    coach_profile = get_coach_profile(user)
    if coach_profile:
        allowed = scoped_student_ids(user)
        if allowed is None:
            return qs
        if not allowed:
            return qs.filter(assigned_coach=coach_profile)
        return qs.filter(
            Q(assigned_coach=coach_profile) | Q(ogrenci_id__in=allowed)
        )

    if _has_staff_messaging_access(user):
        return qs

    allowed = scoped_student_ids(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()
    return qs.filter(ogrenci_id__in=allowed)


def user_can_access_conversation(user, conversation) -> bool:
    if is_resource_admin(user):
        return True
    if user_has_any_permission(user, 'communication.manage'):
        return True

    coach_profile = get_coach_profile(user)
    if coach_profile:
        if conversation.assigned_coach_id == coach_profile.id:
            return True
        if conversation.ogrenci_id:
            allowed = scoped_student_ids(user)
            if allowed is None:
                return True
            return conversation.ogrenci_id in allowed
        return False

    if _has_staff_messaging_access(user):
        return bool(conversation.ogrenci_id or conversation.veli_id)

    if conversation.ogrenci_id:
        allowed = scoped_student_ids(user)
        if allowed is None:
            return True
        return conversation.ogrenci_id in allowed

    return False


def assign_coach_to_conversation(conversation) -> None:
    """Gelen mesajda öğrenci koç atamasından konuşmaya koç bağla."""
    if conversation.assigned_coach_id:
        return
    if not conversation.ogrenci_id:
        return

    from apps.coaching.models import CoachStudentAssignment

    assignment = CoachStudentAssignment.objects.filter(
        student_id=conversation.ogrenci_id,
        end_date__isnull=True,
        coach__is_active=True,
    ).select_related('coach').first()

    if assignment:
        conversation.assigned_coach = assignment.coach
        conversation.save(update_fields=['assigned_coach', 'updated_at'])


def is_coach_bulk_user(user) -> bool:
    """Gerçek koç profili olan, admin olmayan bulk kullanıcı."""
    if not user or not user.is_authenticated:
        return False
    if is_resource_admin(user):
        return False
    if user_has_any_permission(user, 'communication.manage'):
        return False
    return get_coach_profile(user) is not None


def assert_coach_audience(user, audience_filter: dict) -> None:
    """Koç yalnızca kendi kitlelerine gönderebilir."""
    if not is_coach_bulk_user(user):
        return

    allowed = scoped_student_ids(user)
    if not allowed:
        raise PermissionDenied('Toplu gönderim için yetkiniz yok.')

    audience_type = audience_filter.get('audience_type', '')
    if audience_type not in COACH_AUDIENCE_TYPES:
        raise PermissionDenied('Koç yalnızca kendi öğrenci/veli kitlesine gönderebilir.')

    ogrenci_ids = audience_filter.get('ogrenci_ids') or []
    for oid in ogrenci_ids:
        if int(oid) not in allowed:
            raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')

    veli_ids = audience_filter.get('veli_ids') or []
    if veli_ids:
        from apps.ogrenci.domain.models import OgrenciVeli

        kurum_id = audience_filter.get('_kurum_id')
        for vid in veli_ids:
            qs = OgrenciVeli.objects.filter(id=vid)
            if kurum_id:
                qs = qs.filter(ogrenci__kurum_id=kurum_id)
            veli = qs.first()
            if veli and veli.ogrenci_id not in allowed:
                raise PermissionDenied('Seçilen alıcılar koç kapsamının dışında.')
