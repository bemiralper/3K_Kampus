"""Akademik yazmada öğretmen sınırı.

`sinif.write` durur. Şube geneli yazma yönetici kapısındadır: akademik tam
yetki, `sinif.manage`, `egitim_tanimlari.write` veya `egitim_tanimlari.manage`.
Salt öğretmen yalnız kendi planına ve kendi oturumuna yazar.
"""
from __future__ import annotations

from shared.permissions import user_has_akademik_full_access, user_has_any_permission

BRANCH_WRITE_CODES = (
    'sinif.manage',
    'egitim_tanimlari.write',
    'egitim_tanimlari.manage',
)

# DRF @api_view sarmalayıcısının adı "view" olur; URL adı esas alınır.
TEACHER_OBJECT_WRITE_URLS = frozenset({
    'class-lesson-plan-update',
    'class-lesson-plan-delete',
    'lesson-session-materialize',
    'lesson-session-create',
    'lesson-session-action',
    'lesson-teacher-attendance',
    'lesson-student-attendance',
})


def user_administers_academic(user) -> bool:
    if user_has_akademik_full_access(user):
        return True
    return bool(
        user
        and getattr(user, 'is_authenticated', False)
        and user_has_any_permission(user, *BRANCH_WRITE_CODES)
    )


def teacher_personel_id(user) -> int | None:
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    from apps.personel.domain.models import Personel

    row = Personel.objects.filter(user_id=user.pk, aktif_mi=True).only('id').first()
    return row.id if row else None


def owns_plan(user, plan) -> bool:
    if user_administers_academic(user):
        return True
    personel_id = teacher_personel_id(user)
    return bool(personel_id and plan is not None and plan.ogretmen_id == personel_id)


def owns_session(user, session) -> bool:
    if user_administers_academic(user):
        return True
    personel_id = teacher_personel_id(user)
    if not personel_id or session is None:
        return False
    if session.ogretmen_id == personel_id or session.substitute_ogretmen_id == personel_id:
        return True
    plan = getattr(session, 'class_lesson_plan', None)
    if plan is not None:
        return plan.ogretmen_id == personel_id
    plan_id = getattr(session, 'class_lesson_plan_id', None)
    if not plan_id:
        return False
    from apps.academic.domain.class_lesson_plan import ClassLessonPlan

    owner_id = (
        ClassLessonPlan.objects.filter(pk=plan_id)
        .values_list('ogretmen_id', flat=True)
        .first()
    )
    return owner_id == personel_id


def owns_personel(user, personel_id) -> bool:
    if user_administers_academic(user):
        return True
    try:
        target = int(personel_id)
    except (TypeError, ValueError):
        return False
    return teacher_personel_id(user) == target


def view_allows_teacher_object_write(request) -> bool:
    match = getattr(request, 'resolver_match', None)
    if match is None:
        return False
    return (match.url_name or '') in TEACHER_OBJECT_WRITE_URLS
