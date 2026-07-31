"""
WhatsApp hesap çözümleyici — rol + şube hibrit kapsam.
"""
from __future__ import annotations

from apps.communication.domain.enums import Channel, WhatsAppAccountScope
from apps.communication.domain.models import CommunicationChannelConfig


class AccountResolveError(Exception):
    def __init__(self, message: str, code: str = 'no_account'):
        self.message = message
        self.code = code
        super().__init__(message)


def _user_role_id(user) -> int | None:
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    ur = getattr(user, 'user_role', None) or getattr(user, 'userrole', None)
    if ur is None:
        try:
            from apps.roller.models import UserRole
            ur = UserRole.objects.filter(user=user).select_related('role').first()
        except Exception:
            return None
    if ur and getattr(ur, 'role_id', None):
        return ur.role_id
    return None


class AccountResolver:
    """Kullanıcı + şube bağlamında kullanılabilir WhatsApp hesaplarını çözer."""

    @staticmethod
    def list_for_kurum(kurum_id: int, *, active_only: bool = False):
        qs = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).prefetch_related('allowed_subes', 'allowed_roles').order_by('-is_default', 'name')
        if active_only:
            qs = qs.filter(is_active=True)
        return qs

    @staticmethod
    def list_accessible(
        *,
        kurum_id: int,
        user,
        sube_id: int | None,
        active_only: bool = True,
    ):
        role_id = _user_role_id(user)
        qs = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).prefetch_related('allowed_subes', 'allowed_roles')
        if active_only:
            qs = qs.filter(is_active=True)

        # Superuser / sistem.admin: tüm hesaplar
        if user and (getattr(user, 'is_superuser', False) or _has_sistem_admin(user)):
            return list(qs.order_by('-is_default', 'name'))

        candidates = []
        for cfg in qs.order_by('-is_default', 'name'):
            if not _role_allowed(cfg, role_id):
                continue
            if not _sube_allowed(cfg, sube_id):
                continue
            candidates.append(cfg)
        return candidates

    @staticmethod
    def resolve(
        *,
        kurum_id: int,
        user=None,
        sube_id: int | None = None,
        preferred_id=None,
        allow_inactive: bool = False,
        raise_if_missing: bool = True,
    ) -> CommunicationChannelConfig | None:
        """
        preferred_id verilmişse önce onu doğrular (erişim + kapsam).
        Yoksa erişilebilir hesaplardan varsayılan / tek aday seçer.
        """
        if preferred_id:
            cfg = CommunicationChannelConfig.objects.filter(
                id=preferred_id,
                kurum_id=kurum_id,
                channel=Channel.WHATSAPP,
            ).prefetch_related('allowed_subes', 'allowed_roles').first()
            if cfg and (allow_inactive or cfg.is_active):
                if user is None or _user_can_use(cfg, user, sube_id):
                    return cfg
                if raise_if_missing:
                    raise AccountResolveError(
                        'Seçilen WhatsApp hesabına bu rol/şube ile erişilemez.',
                        code='forbidden_account',
                    )

        accessible = AccountResolver.list_accessible(
            kurum_id=kurum_id,
            user=user,
            sube_id=sube_id,
            active_only=not allow_inactive,
        )
        if not accessible:
            # Geriye uyum: rol atanmamış legacy hesap veya bulk yetkisiyle varsayılan
            fallback = (
                CommunicationChannelConfig.objects.filter(
                    kurum_id=kurum_id,
                    channel=Channel.WHATSAPP,
                    is_active=True,
                )
                .order_by('-is_default', 'created_at')
                .first()
            )
            if fallback:
                roles_empty = not fallback.allowed_roles.exists()
                elevated = user and (
                    getattr(user, 'is_superuser', False)
                    or _has_sistem_admin(user)
                    or _has_comm_manage(user)
                )
                sube_ok = fallback.scope_type == WhatsAppAccountScope.ALL_SUBES or (
                    sube_id and fallback.allowed_subes.filter(id=sube_id).exists()
                ) or (sube_id is None and fallback.scope_type == WhatsAppAccountScope.ALL_SUBES)
                if sube_ok and (roles_empty or elevated or user is None):
                    return fallback
            if raise_if_missing:
                raise AccountResolveError(
                    'Bu rol/şube için tanımlı WhatsApp hesabı yok.',
                    code='no_account',
                )
            return None

        defaults = [c for c in accessible if c.is_default]
        if len(defaults) == 1:
            return defaults[0]
        if len(accessible) == 1:
            return accessible[0]
        return defaults[0] if defaults else accessible[0]

    @staticmethod
    def get_by_id(kurum_id: int, account_id) -> CommunicationChannelConfig | None:
        return CommunicationChannelConfig.objects.filter(
            id=account_id,
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).prefetch_related('allowed_subes', 'allowed_roles').first()

    @staticmethod
    def get_by_phone_number_id(phone_number_id: str) -> CommunicationChannelConfig | None:
        if not phone_number_id:
            return None
        return CommunicationChannelConfig.objects.filter(
            phone_number_id=phone_number_id,
            is_active=True,
            channel=Channel.WHATSAPP,
        ).first()


def _has_sistem_admin(user) -> bool:
    try:
        from shared.permissions import user_has_permission
        return user_has_permission(user, 'sistem.admin')
    except Exception:
        return False


def _has_comm_manage(user) -> bool:
    try:
        from shared.permissions import user_has_any_permission
        return user_has_any_permission(
            user, 'communication.manage', 'communication.config', 'communication.bulk',
        )
    except Exception:
        return False


def _role_allowed(cfg: CommunicationChannelConfig, role_id: int | None) -> bool:
    # Hiç rol atanmamışsa (legacy) tüm rollere açık say
    role_ids = list(cfg.allowed_roles.values_list('id', flat=True))
    if not role_ids:
        return True
    if role_id is None:
        return False
    return role_id in role_ids


def _sube_allowed(cfg: CommunicationChannelConfig, sube_id: int | None) -> bool:
    if cfg.scope_type == WhatsAppAccountScope.ALL_SUBES:
        return True
    if sube_id is None:
        return False
    return cfg.allowed_subes.filter(id=sube_id).exists()


def _user_can_use(cfg: CommunicationChannelConfig, user, sube_id: int | None) -> bool:
    if getattr(user, 'is_superuser', False) or _has_sistem_admin(user):
        return True
    return _role_allowed(cfg, _user_role_id(user)) and _sube_allowed(cfg, sube_id)
