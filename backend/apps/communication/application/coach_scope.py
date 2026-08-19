"""
Koç kapsamı — konuşma erişimi, ticket görünürlüğü ve toplu gönderim.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.db.models import Q

from apps.coaching.services.coach_access import (
    get_coach_profile,
    is_resource_admin,
    scoped_student_ids,
)
from apps.communication.domain.enums import (
    CommunicationDepartment,
    ConversationStatus,
    MessageDirection,
    RecipientType,
)
from shared.permissions import user_has_any_permission

COACH_AUDIENCE_TYPES = frozenset({'coach_students', 'coach_parents', 'custom_ids', 'filtered'})

# Ticket routing claim filtrelerinin üstünde kalan roller (koç profili olsa bile).
FULL_INBOX_ROLE_CODES = frozenset({'super_admin', 'kurum_yoneticisi'})


def _ticket_routing_enabled() -> bool:
    return bool(getattr(settings, 'COMMUNICATION_TICKET_ROUTING', True))


def _has_full_inbox_access(user) -> bool:
    """
    Süper Yönetici / Yönetici — tüm sohbetler (devredilmiş / başkasının claim'i dahil).

    is_resource_admin aktif koç profilinde False döner; iletişim yönetiminde ise
    koç kimliği claim gizlemeyi tetiklememeli. Rol kodu yedeği, seed eksik
    permission atamalarında da aynı korumayı verir.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    if user_has_any_permission(user, 'communication.manage', 'sistem.admin'):
        return True
    try:
        role = user.user_role.role
        if role and role.code in FULL_INBOX_ROLE_CODES:
            return True
    except Exception:
        pass
    return False


def _bypasses_claim_visibility(user) -> bool:
    """Claim / ticket gizleme uygulanmaz (yönetici veya coach'suz resource admin)."""
    return _has_full_inbox_access(user) or is_resource_admin(user)


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


def _legacy_filter_conversations_for_user(qs, user):
    if _bypasses_claim_visibility(user):
        return qs

    coach_profile = get_coach_profile(user)
    if coach_profile:
        allowed = scoped_student_ids(user)
        # Kayıtsız numara (RAW_PHONE) — koçlar "yeni gelen" olarak görebilsin.
        unmatched = (
            Q(contact_type=RecipientType.RAW_PHONE)
            & Q(ogrenci_id__isnull=True)
            & Q(veli_id__isnull=True)
        )
        if allowed is None:
            return qs
        if not allowed:
            return qs.filter(Q(assigned_coach=coach_profile) | unmatched)
        return qs.filter(
            Q(assigned_coach=coach_profile) | Q(ogrenci_id__in=allowed) | unmatched
        )

    if _has_staff_messaging_access(user):
        return qs

    allowed = scoped_student_ids(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()
    return qs.filter(ogrenci_id__in=allowed)


def filter_conversations_for_user(
    qs,
    user,
    *,
    inbox: str | None = None,
    kurum_id: int | None = None,
    sube_id: int | None = None,
):
    """
    Ticket routing açıkken koç görünürlüğü:
    - kendi assigned_coach sohbetleri
    - kendi claimed sohbetleri
    - Yeni Gelenler (unclaimed + koçsuz/bilinmeyen, aynı department)
    - Destek Gerekiyor (NEEDS_SUPPORT + unclaimed veya kendi)
    Başkasının claim ettiği sohbetler (kendi assigned değilse) görünmez.

    Ardından WhatsApp hesap (allowed_roles / şube) kapsamı uygulanır.
    """
    if not _ticket_routing_enabled():
        qs = _legacy_filter_conversations_for_user(qs, user)
        return filter_by_accessible_whatsapp_accounts(
            qs, user, kurum_id=kurum_id, sube_id=sube_id,
        )

    if _bypasses_claim_visibility(user):
        qs = _apply_inbox_filter(qs, inbox, coach_profile=None, user=user, is_admin=True)
        return filter_by_accessible_whatsapp_accounts(
            qs, user, kurum_id=kurum_id, sube_id=sube_id,
        )

    coach_profile = get_coach_profile(user)
    if coach_profile:
        from apps.communication.domain.enums import CommunicationDepartment
        allowed = scoped_student_ids(user) or set()
        scoped_students_q = Q(ogrenci_id__in=allowed) if allowed else Q(pk__in=[])
        visibility = (
            Q(assigned_coach=coach_profile)
            | Q(claimed_by_user=user)
            | scoped_students_q
            | (
                Q(claimed_by_user__isnull=True)
                & Q(department=CommunicationDepartment.COACHING)
                & (
                    Q(assigned_coach__isnull=True)
                    | (
                        Q(contact_type=RecipientType.RAW_PHONE)
                        & Q(ogrenci_id__isnull=True)
                    )
                )
                & ~Q(status=ConversationStatus.ARCHIVED)
            )
            | (
                Q(status=ConversationStatus.NEEDS_SUPPORT)
                & Q(department=CommunicationDepartment.COACHING)
                & (
                    Q(claimed_by_user__isnull=True)
                    | Q(claimed_by_user=user)
                    | Q(assigned_coach=coach_profile)
                    | scoped_students_q
                )
            )
        )
        # Başkasının claim ettiği ama kendi öğrencisi / ataması olan sohbetler görünür kalır.
        other_claim_block = (
            Q(claimed_by_user__isnull=False)
            & ~Q(claimed_by_user=user)
            & ~Q(assigned_coach=coach_profile)
            & ~scoped_students_q
        )
        qs = qs.filter(visibility).exclude(other_claim_block)
        qs = _apply_inbox_filter(qs, inbox, coach_profile=coach_profile, user=user, is_admin=False)
        return filter_by_accessible_whatsapp_accounts(
            qs, user, kurum_id=kurum_id, sube_id=sube_id,
        )

    if _has_staff_messaging_access(user):
        qs = _apply_inbox_filter(qs, inbox, coach_profile=None, user=user, is_admin=True)
        return filter_by_accessible_whatsapp_accounts(
            qs, user, kurum_id=kurum_id, sube_id=sube_id,
        )

    allowed = scoped_student_ids(user)
    if allowed is None:
        qs = qs
    elif not allowed:
        qs = qs.none()
    else:
        qs = qs.filter(ogrenci_id__in=allowed)
    return filter_by_accessible_whatsapp_accounts(
        qs, user, kurum_id=kurum_id, sube_id=sube_id,
    )


def filter_by_accessible_whatsapp_accounts(
    qs,
    user,
    *,
    kurum_id: int | None = None,
    sube_id: int | None = None,
):
    """
    Sohbetleri kullanıcının rol/şube ile erişebildiği WhatsApp hesaplarıyla sınırla.
    Süper Yönetici / Yönetici / communication.manage → filtre yok.
    (is_staff tek başına tüm WhatsApp hesaplarını açmaz.)
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return qs.none()
    if _has_full_inbox_access(user):
        return qs

    if kurum_id is None:
        # Çağıran kurum vermediyse güvenli tarafta kal
        return qs

    from apps.communication.application.account_resolver import AccountResolver
    from apps.communication.domain.enums import Channel
    from apps.communication.domain.models import CommunicationChannelConfig

    # Hiç WhatsApp hesabı yoksa (test / eski kurulum) filtre uygulama
    if not CommunicationChannelConfig.objects.filter(
        kurum_id=kurum_id, channel=Channel.WHATSAPP, is_active=True,
    ).exists():
        return qs

    accessible = AccountResolver.list_accessible(
        kurum_id=kurum_id,
        user=user,
        sube_id=sube_id,
        active_only=True,
    )
    if not accessible:
        return qs.none()

    ids = [cfg.id for cfg in accessible]
    default_ids = {cfg.id for cfg in accessible if cfg.is_default}
    account_q = Q(channel_config_id__in=ids)
    # Hesap atanmamış eski sohbetler yalnızca erişilebilir varsayılan hesaba düşer
    if default_ids:
        account_q |= Q(channel_config_id__isnull=True)
    from apps.communication.application.account_resolver import _is_accounting_staff

    if _is_accounting_staff(user):
        # Makbuz/şablon gönderimi koç hattına düşse bile muhasebe kendi
        # gönderimini ve ACCOUNTING departmanındaki sohbetleri görsün.
        account_q |= Q(department=CommunicationDepartment.ACCOUNTING)
        account_q |= Q(
            messages__sender_user_id=user.id,
            messages__direction=MessageDirection.OUTBOUND,
        )
        return qs.filter(account_q).distinct()
    return qs.filter(account_q)


def _apply_inbox_filter(qs, inbox, *, coach_profile, user, is_admin: bool):
    if not inbox or inbox == 'all':
        return qs

    if inbox == 'mine':
        if coach_profile:
            return qs.filter(Q(assigned_coach=coach_profile) | Q(claimed_by_user=user)).exclude(
                status=ConversationStatus.ARCHIVED,
            )
        return qs.filter(claimed_by_user=user).exclude(status=ConversationStatus.ARCHIVED)

    if inbox == 'new':
        return qs.filter(
            claimed_by_user__isnull=True,
            assigned_coach__isnull=True,
        ).exclude(status=ConversationStatus.ARCHIVED)

    if inbox == 'needs_support':
        return qs.filter(status=ConversationStatus.NEEDS_SUPPORT)

    if inbox == 'unassigned':
        return qs.filter(assigned_coach__isnull=True).exclude(status=ConversationStatus.ARCHIVED)

    if inbox == 'archived':
        return qs.filter(status=ConversationStatus.ARCHIVED)

    return qs


def _user_can_access_conversation_account(user, conversation) -> bool:
    """WhatsApp hesabı rol/şube kapsamı — yönetici değilse zorunlu."""
    if _has_full_inbox_access(user):
        return True

    from apps.communication.application.account_resolver import AccountResolver

    from apps.communication.domain.enums import Channel
    from apps.communication.domain.models import CommunicationChannelConfig

    if not CommunicationChannelConfig.objects.filter(
        kurum_id=conversation.kurum_id, channel=Channel.WHATSAPP, is_active=True,
    ).exists():
        return True

    cfg = getattr(conversation, 'channel_config', None)
    if cfg is None and conversation.channel_config_id:
        cfg = CommunicationChannelConfig.objects.filter(id=conversation.channel_config_id).first()

    sube_id = getattr(conversation, 'sube_id', None)
    from apps.communication.application.account_resolver import _is_accounting_staff

    if _is_accounting_staff(user) and _accounting_owns_conversation(user, conversation):
        return True
    if cfg is None:
        # Legacy sohbet: yalnızca varsayılan hesaba erişimi olan görebilir
        accessible = AccountResolver.list_accessible(
            kurum_id=conversation.kurum_id,
            user=user,
            sube_id=sube_id,
        )
        return any(c.is_default for c in accessible)

    return AccountResolver.user_can_access_account(user, cfg, sube_id)


def _accounting_owns_conversation(user, conversation) -> bool:
    if getattr(conversation, 'department', None) == CommunicationDepartment.ACCOUNTING:
        return True
    from apps.communication.domain.models import Message

    return Message.objects.filter(
        conversation=conversation,
        sender_user_id=user.id,
        direction=MessageDirection.OUTBOUND,
    ).exists()


def user_can_access_conversation(user, conversation) -> bool:
    if _bypasses_claim_visibility(user):
        return True

    if not _user_can_access_conversation_account(user, conversation):
        return False

    if not _ticket_routing_enabled():
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

    coach_profile = get_coach_profile(user)
    if coach_profile:
        if conversation.assigned_coach_id == coach_profile.id:
            return True
        if conversation.claimed_by_user_id == user.id:
            return True
        allowed = scoped_student_ids(user) or set()
        # Yardımcı koç: atandığı öğrencinin sohbetlerini görür (primary olmasa da)
        if conversation.ogrenci_id and conversation.ogrenci_id in allowed:
            return True
        # Yeni gelenler / unclaimed queue
        if (
            not conversation.claimed_by_user_id
            and not conversation.assigned_coach_id
            and conversation.status != ConversationStatus.ARCHIVED
        ):
            return True
        if conversation.status == ConversationStatus.NEEDS_SUPPORT and (
            not conversation.claimed_by_user_id
            or conversation.claimed_by_user_id == user.id
            or (conversation.ogrenci_id and conversation.ogrenci_id in allowed)
        ):
            return True
        return False

    if _has_staff_messaging_access(user):
        return bool(conversation.ogrenci_id or conversation.veli_id or conversation.contact_phone)

    if conversation.ogrenci_id:
        allowed = scoped_student_ids(user)
        if allowed is None:
            return True
        return conversation.ogrenci_id in allowed

    return False


def assign_coach_to_conversation(conversation) -> None:
    """Gelen mesajda öğrenci koç atamasından konuşmaya koç bağla."""
    from apps.communication.application.conversation_router import (
        assign_coach_to_conversation as router_assign,
    )
    router_assign(conversation)


def is_coach_bulk_user(user) -> bool:
    """Gerçek koç profili olan, admin olmayan bulk kullanıcı."""
    if not user or not user.is_authenticated:
        return False
    if _bypasses_claim_visibility(user):
        return False
    return get_coach_profile(user) is not None


def assert_coach_bulk_audience(user, audience_type: str) -> None:
    if not is_coach_bulk_user(user):
        return
    if audience_type not in COACH_AUDIENCE_TYPES:
        raise PermissionDenied('Bu alıcı kitlesi için yetkiniz yok.')
