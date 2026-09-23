"""Sohbet devri hedefleri — aday listesi ve hedef doğrulaması tek yerden.

`TransferCandidatesView` ile `ConversationTransferView` aynı kuralı kullanır:
hedef, aynı kurumda aktif Personel hesabı olan, iletişim yetkisi taşıyan ve
aktif şubeye erişebilen bir kullanıcıdır (K-05).
"""
from __future__ import annotations

from django.db.models import Q

from apps.personel.domain.models import Personel
from apps.personel.domain.user_account import resolve_personel_user
from shared.permissions import user_has_any_permission


def candidate_personel_qs(kurum_id: int, sube_id: int | None, q: str = ''):
    qs = Personel.objects.filter(kurum_id=kurum_id, aktif_mi=True).select_related('sube')
    if sube_id is not None:
        qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
    if q:
        qs = qs.filter(
            Q(ad__icontains=q)
            | Q(soyad__icontains=q)
            | Q(email__icontains=q)
            | Q(telefon__icontains=q)
        )
    return qs.order_by('soyad', 'ad')


def user_has_communication_access(user) -> bool:
    if not user or not getattr(user, 'is_active', False):
        return False
    if user_has_any_permission(
        user, 'communication.read', 'communication.write', 'communication.manage',
    ):
        return True
    from apps.coaching.services.coach_access import get_coach_profile

    return get_coach_profile(user) is not None


def personel_for_user(kurum_id: int, user) -> Personel | None:
    """Kullanıcının bu kurumdaki aktif personel kaydı (FK veya kardeş kayıt)."""
    if not user:
        return None
    direct = Personel.objects.filter(user_id=user.id, kurum_id=kurum_id, aktif_mi=True).first()
    if direct:
        return direct
    for p in Personel.objects.filter(kurum_id=kurum_id, aktif_mi=True).filter(
        Q(email__iexact=(user.email or '').strip()) | Q(tc_kimlik_no=user.username),
    ):
        if resolve_personel_user(p) == user:
            return p
    return None


def validate_transfer_target(kurum_id: int, sube_id: int | None, to_user) -> str | None:
    """Uygun değilse Türkçe hata metni, uygunsa None."""
    from apps.communication.application.coach_scope import _has_full_inbox_access
    from shared.sube_access import get_allowed_subeler_for_user

    if not to_user or not getattr(to_user, 'is_active', False):
        return 'Hedef kullanıcı aktif değil.'
    if getattr(to_user, 'is_superuser', False):
        return None
    if personel_for_user(kurum_id, to_user) is None:
        return 'Hedef kullanıcı bu kurumda aktif personel değil.'
    if not user_has_communication_access(to_user):
        return 'Hedef kullanıcının iletişim yetkisi yok.'
    if sube_id is not None and not _has_full_inbox_access(to_user):
        if not get_allowed_subeler_for_user(to_user, kurum_id=kurum_id).filter(id=sube_id).exists():
            return 'Hedef kullanıcı bu şubeye erişemiyor.'
    return None
