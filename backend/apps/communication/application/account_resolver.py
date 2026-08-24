"""
WhatsApp hesap çözümleyici — rol + şube hibrit kapsam.
"""
from __future__ import annotations

import re

from apps.communication.domain.enums import Channel, CommunicationDepartment, WhatsAppAccountScope
from apps.communication.domain.models import CommunicationChannelConfig

# test_koc_wa / koc — 'kocaman' gibi rastgele eşleşmesin.
_KOC_ROLE_RE = re.compile(r'(^|_)koc($|_)')


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


def _is_active_coach(user) -> bool:
    """Aktif koç profili — rol kaydı eksik/yanlış olsa bile koçluk hattına erişim için."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    try:
        from apps.coaching.services.coach_access import get_coach_profile
        return get_coach_profile(user) is not None
    except Exception:
        return False


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

        # Superuser / sistem.admin / communication.manage: tüm hesaplar
        if user and (
            getattr(user, 'is_superuser', False)
            or _has_sistem_admin(user)
            or _has_comm_manage(user)
        ):
            return list(qs.order_by('-is_default', 'name'))

        is_coach = _is_active_coach(user)
        is_accounting = _is_accounting_staff(user)
        candidates = []
        for cfg in qs.order_by('-is_default', 'name'):
            if not _account_role_allows(
                cfg, role_id, is_coach=is_coach, is_accounting=is_accounting,
            ):
                continue
            if not _sube_allowed(cfg, sube_id):
                continue
            candidates.append(cfg)
        return candidates

    @staticmethod
    def accessible_account_ids(
        *,
        kurum_id: int,
        user,
        sube_id: int | None,
        active_only: bool = True,
    ) -> set:
        return {
            cfg.id
            for cfg in AccountResolver.list_accessible(
                kurum_id=kurum_id,
                user=user,
                sube_id=sube_id,
                active_only=active_only,
            )
        }

    @staticmethod
    def user_can_access_account(user, cfg, sube_id: int | None) -> bool:
        if cfg is None:
            return False
        return _user_can_use(cfg, user, sube_id)

    @staticmethod
    def resolve(
        *,
        kurum_id: int,
        user=None,
        sube_id: int | None = None,
        preferred_id=None,
        prefer_department: str | None = None,
        allow_inactive: bool = False,
        raise_if_missing: bool = True,
    ) -> CommunicationChannelConfig | None:
        """
        preferred_id verilmişse önce onu doğrular (erişim + kapsam).
        Yoksa kullanıcının rolüne bağlanan numarayı seçer; varsayılan hat bunu ezmez.
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

        return _pick_accessible_account(
            accessible, user=user, prefer_department=prefer_department,
        )

    @staticmethod
    def for_department(
        kurum_id: int,
        department: str,
        *,
        sube_id: int | None = None,
        user=None,
    ) -> CommunicationChannelConfig | None:
        """
        İşlem türünün hattı — `department` alanına değil rol bağlamasına bakar.

        Muhasebe olayı → `muhasebe` rolünün bağlı olduğu numara.
        Koçluk olayı → `koc` rolünün bağlı olduğu numara.
        İki rol aynı hatta ise o ortak hat kullanılır (süper yönetici
        tüm hesapları görse bile departman alanı bunu ezmez).
        """
        qs = list(
            CommunicationChannelConfig.objects.filter(
                kurum_id=kurum_id,
                channel=Channel.WHATSAPP,
                is_active=True,
            )
            .prefetch_related('allowed_subes', 'allowed_roles')
            .order_by('-is_default', 'name')
        )
        in_scope = [cfg for cfg in qs if _sube_allowed(cfg, sube_id)]
        role_bound = [
            cfg for cfg in in_scope
            if _cfg_has_department_role(cfg, department)
        ]
        if role_bound:
            return _pick_role_bound_for_department(role_bound, department)

        dept_matches = [cfg for cfg in in_scope if cfg.department == department]
        elevated = user is not None and (
            getattr(user, 'is_superuser', False)
            or _has_sistem_admin(user)
            or _has_comm_manage(user)
        )
        if user is not None and not elevated:
            dept_matches = [
                cfg for cfg in dept_matches
                if _user_can_use(cfg, user, sube_id)
            ]
        if dept_matches:
            return _stable_pick_account(dept_matches, department)
        return None

    @staticmethod
    def shared_waba_account_ids(kurum_id: int, channel_config_id) -> list:
        """Aynı WABA'daki tüm hesap id'leri — şablon numaralar arasında paylaşılır."""
        if not channel_config_id:
            return []
        cfg = CommunicationChannelConfig.objects.filter(
            id=channel_config_id,
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
        ).first()
        if cfg is None:
            return [channel_config_id]
        ids = [cfg.id]
        waba = (cfg.waba_id or '').strip()
        if not waba:
            return ids
        ids.extend(
            CommunicationChannelConfig.objects.filter(
                kurum_id=kurum_id,
                channel=Channel.WHATSAPP,
                waba_id=waba,
            ).exclude(id=cfg.id).values_list('id', flat=True)
        )
        return ids

    @staticmethod
    def sibling_access_token(cfg: CommunicationChannelConfig | None) -> str:
        """İkinci numara çoğu zaman token'sız kaydedilir; aynı kurum/WABA token'ını kullan."""
        if cfg is None:
            return ''
        from apps.communication.application.token_crypto import decrypt_access_token

        qs = CommunicationChannelConfig.objects.filter(
            kurum_id=cfg.kurum_id,
            channel=Channel.WHATSAPP,
            is_active=True,
        ).exclude(pk=cfg.pk).exclude(access_token_encrypted='')
        waba = (cfg.waba_id or '').strip()
        candidates: list[CommunicationChannelConfig] = []
        if waba:
            candidates.extend(qs.filter(waba_id=waba).order_by('-is_default', 'name'))
        seen = {item.pk for item in candidates}
        candidates.extend(
            item for item in qs.order_by('-is_default', 'name') if item.pk not in seen
        )
        for sibling in candidates:
            token = decrypt_access_token(sibling.access_token_encrypted)
            if token:
                return token
        return ''

    @staticmethod
    def source_for_shared_meta(kurum_id: int, source_account_id=None) -> CommunicationChannelConfig | None:
        """Aynı Meta'ya eklenen ikinci numara için kaynak hesap."""
        if source_account_id:
            found = CommunicationChannelConfig.objects.filter(
                id=source_account_id,
                kurum_id=kurum_id,
                channel=Channel.WHATSAPP,
            ).first()
            if found is not None:
                return found
        from apps.communication.infrastructure.repository import ChannelConfigRepository
        return ChannelConfigRepository.get_whatsapp_config(kurum_id)

    @staticmethod
    def apply_shared_meta_credentials(data: dict, source: CommunicationChannelConfig) -> dict:
        """Token / WABA / App ID / webhook — kaynak hesaptan kopyala (boş alanlar)."""
        if not (data.get('waba_id') or '').strip():
            data['waba_id'] = source.waba_id or ''
        if not (data.get('app_id') or '').strip():
            data['app_id'] = source.app_id or ''
        if not (data.get('webhook_verify_token') or '').strip():
            data['webhook_verify_token'] = source.webhook_verify_token or ''
        if not data.get('access_token_encrypted') and source.access_token_encrypted:
            data['access_token_encrypted'] = source.access_token_encrypted
        if not data.get('app_secret_encrypted') and source.app_secret_encrypted:
            data['app_secret_encrypted'] = source.app_secret_encrypted
        return data

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

    @staticmethod
    def find_active_by_phone(
        kurum_id: int,
        phone_number_id: str,
        *,
        exclude_id=None,
    ) -> CommunicationChannelConfig | None:
        """Aynı kurumdaki aktif hat — başka kuruma sızmaz."""
        if not phone_number_id:
            return None
        qs = CommunicationChannelConfig.objects.filter(
            kurum_id=kurum_id,
            channel=Channel.WHATSAPP,
            phone_number_id=phone_number_id,
            is_active=True,
        ).prefetch_related('allowed_subes', 'allowed_roles')
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.first()

    @staticmethod
    def assign_subes(
        account: CommunicationChannelConfig,
        sube_ids: list[int] | None,
        *,
        scope_type: str | None = None,
        replace: bool = True,
        copy_bindings: bool = True,
    ) -> dict:
        """
        Mevcut WhatsApp numarasını şubelere bağla.

        Token / WABA tekrar girilmez. SELECTED_SUBES'te yeni eklenen şubelere
        kaynak şubenin bildirim eşlemeleri kopyalanır.
        """
        from apps.communication.application.notification_binding_service import (
            copy_sube_scoped_settings,
        )
        from apps.sube.domain.models import Sube

        wanted_scope = scope_type or account.scope_type
        previous = set(account.allowed_subes.values_list('id', flat=True))
        requested = [int(sid) for sid in (sube_ids or []) if sid]

        if wanted_scope == WhatsAppAccountScope.ALL_SUBES:
            account.scope_type = WhatsAppAccountScope.ALL_SUBES
            if previous:
                account.allowed_subes.clear()
            account.save(update_fields=['scope_type', 'updated_at'])
            return {
                'added_sube_ids': [],
                'copied_bindings': 0,
                'scope_type': account.scope_type,
            }

        valid = set(
            Sube.objects.filter(
                kurum_id=account.kurum_id,
                id__in=requested,
            ).values_list('id', flat=True)
        )
        target = valid if replace else (previous | valid)
        added = sorted(target - previous)

        account.scope_type = WhatsAppAccountScope.SELECTED_SUBES
        account.save(update_fields=['scope_type', 'updated_at'])
        account.allowed_subes.set(target)

        copied = 0
        source_id = next(iter(previous), None)
        if copy_bindings and added and source_id:
            copied = copy_sube_scoped_settings(
                account.kurum_id,
                source_id,
                added,
                channel_config_id=account.id,
            )
        return {
            'added_sube_ids': added,
            'copied_bindings': copied,
            'scope_type': account.scope_type,
        }


def _cfg_role_ids(cfg: CommunicationChannelConfig) -> list[int]:
    cache = getattr(cfg, '_prefetched_objects_cache', None) or {}
    if 'allowed_roles' in cache:
        return [role.id for role in cfg.allowed_roles.all()]
    return list(cfg.allowed_roles.values_list('id', flat=True))


def _cfg_role_codes(cfg: CommunicationChannelConfig) -> list[str]:
    cache = getattr(cfg, '_prefetched_objects_cache', None) or {}
    if 'allowed_roles' in cache:
        return [role.code or '' for role in cfg.allowed_roles.all()]
    return list(cfg.allowed_roles.values_list('code', flat=True))


def _role_code_matches_department(code: str, department: str) -> bool:
    raw = (code or '').strip().lower()
    if not raw:
        return False
    if department == CommunicationDepartment.ACCOUNTING:
        return 'muhasebe' in raw
    if department == CommunicationDepartment.COACHING:
        return raw == 'koc' or bool(_KOC_ROLE_RE.search(raw))
    return False


def _cfg_has_department_role(cfg: CommunicationChannelConfig, department: str) -> bool:
    return any(
        _role_code_matches_department(code, department)
        for code in _cfg_role_codes(cfg)
    )


def _cfg_is_shared_coaching_accounting(cfg: CommunicationChannelConfig) -> bool:
    return (
        _cfg_has_department_role(cfg, CommunicationDepartment.COACHING)
        and _cfg_has_department_role(cfg, CommunicationDepartment.ACCOUNTING)
    )


def _stable_pick_account(pool: list, department: str | None = None):
    if not pool:
        return None
    if department:
        dept_matches = [cfg for cfg in pool if cfg.department == department]
        if dept_matches:
            pool = dept_matches
    defaults = [cfg for cfg in pool if cfg.is_default]
    if defaults:
        return defaults[0]
    return pool[0]


def _pick_role_bound_for_department(candidates: list, department: str):
    """Ortak hat (koc+muhasebe) varsa o; yoksa yalnızca bu rolün olduğu hat."""
    shared = [cfg for cfg in candidates if _cfg_is_shared_coaching_accounting(cfg)]
    if shared:
        return _stable_pick_account(shared, department)
    dedicated = [
        cfg for cfg in candidates
        if not _cfg_is_shared_coaching_accounting(cfg)
    ]
    return _stable_pick_account(dedicated or candidates, department)


def _pick_accessible_account(accessible, *, user, prefer_department: str | None):
    """
    Rolüne bağlanan numara önce gelir.

    Koç rolü A numarasında, muhasebe B numarasında ise herkes kendi
    rolünün hattını kullanır. Varsayılan (is_default) hat bunu ezemez.
    Aynı rol birden fazla hatta varsa, yalnızca o rolün olduğu hat tercih edilir.
    """
    role_id = _user_role_id(user)
    pool = list(accessible)
    if role_id:
        role_matched = [cfg for cfg in pool if role_id in _cfg_role_ids(cfg)]
        if role_matched:
            dedicated = [
                cfg for cfg in role_matched
                if set(_cfg_role_ids(cfg)) == {role_id}
            ]
            pool = dedicated or role_matched

    if prefer_department:
        dept_matches = [cfg for cfg in pool if cfg.department == prefer_department]
        if dept_matches:
            pool = dept_matches

    defaults = [cfg for cfg in pool if cfg.is_default]
    if len(defaults) == 1:
        return defaults[0]
    if len(pool) == 1:
        return pool[0]
    return defaults[0] if defaults else pool[0]


def _has_sistem_admin(user) -> bool:
    try:
        from shared.permissions import user_has_permission
        return user_has_permission(user, 'sistem.admin')
    except Exception:
        return False


def _has_comm_manage(user) -> bool:
    """Hesap kapsamını aşan yönetim yetkisi (bulk/config tek başına yetmez)."""
    try:
        from shared.permissions import user_has_any_permission
        return user_has_any_permission(user, 'communication.manage')
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


def _is_accounting_staff(user) -> bool:
    """Muhasebe / finans yetkili — ACCOUNTING hattına rol listesi boş kalsa da erişir."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    try:
        from shared.permissions import user_has_any_permission
        if not user_has_any_permission(user, 'communication.read', 'communication.write'):
            return False
        return user_has_any_permission(user, 'finans.read', 'finans.manage')
    except Exception:
        return False


def _account_role_allows(
    cfg: CommunicationChannelConfig,
    role_id: int | None,
    *,
    is_coach: bool = False,
    is_accounting: bool = False,
) -> bool:
    """
    Rol kapsamı + koç güvenli ağı.

    Admin portal → koç görünümü impersonation değildir; manage yetkisi tüm hesapları açar.
    Gerçek koçta allowed_roles Koç'u içermezse veya UserRole eksikse inbox boş kalıyordu.
    Aktif CoachProfile, COACHING departmanlı hatlara şube kapsamında erişebilir.
    """
    if _role_allowed(cfg, role_id):
        return True
    if is_coach and cfg.department == CommunicationDepartment.COACHING:
        return True
    if is_accounting and cfg.department == CommunicationDepartment.ACCOUNTING:
        return True
    return False


def _sube_allowed(cfg: CommunicationChannelConfig, sube_id: int | None) -> bool:
    if cfg.scope_type == WhatsAppAccountScope.ALL_SUBES:
        return True
    if sube_id is None:
        return False
    return cfg.allowed_subes.filter(id=sube_id).exists()


def _user_can_use(cfg: CommunicationChannelConfig, user, sube_id: int | None) -> bool:
    if getattr(user, 'is_superuser', False) or _has_sistem_admin(user):
        return True
    if _has_comm_manage(user):
        return True
    return _account_role_allows(
        cfg,
        _user_role_id(user),
        is_coach=_is_active_coach(user),
        is_accounting=_is_accounting_staff(user),
    ) and _sube_allowed(cfg, sube_id)
