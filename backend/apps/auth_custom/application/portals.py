"""
Giriş sonrası panel seçimi.

Koç, yönetici ve muhasebe panelleri ayrı uygulamalardır. Bir personelin
aktif görevlendirmeleri birden fazla panele düşüyorsa oturumda tek bir
panel seçilir; yetkiler o panelin rolünden gelir.
"""
from apps.roller.models import Role

PORTAL_ADMIN = 'admin'
PORTAL_COACH = 'coach'
PORTAL_MUHASEBE = 'muhasebe'

PORTALS = (PORTAL_ADMIN, PORTAL_COACH, PORTAL_MUHASEBE)

PORTAL_LABELS = {
    PORTAL_ADMIN: 'Yönetici Paneli',
    PORTAL_COACH: 'Koç Paneli',
    PORTAL_MUHASEBE: 'Muhasebe Paneli',
}

SESSION_KEY = 'active_portal'

_COACH_CODES = frozenset({'koc'})
_MUHASEBE_CODES = frozenset({'muhasebe'})


def portal_for_role_code(code: str | None) -> str:
    normalized = (code or '').strip().lower()
    if normalized in _COACH_CODES:
        return PORTAL_COACH
    if normalized in _MUHASEBE_CODES:
        return PORTAL_MUHASEBE
    return PORTAL_ADMIN


def _user_role_obj(user):
    try:
        user_role = user.user_role
    except Exception:
        return None
    role = getattr(user_role, 'role', None)
    if role is None or getattr(role, 'silindi_mi', False) or not getattr(role, 'is_active', True):
        return None
    return role


def _assignment_roles(user):
    try:
        personel = user.personel
    except Exception:
        return []
    if personel is None:
        return []
    from apps.personel.domain.models import PersonelGorevlendirme

    roles = []
    rows = (
        PersonelGorevlendirme.objects.filter(
            personel=personel,
            aktif_mi=True,
            rol__isnull=False,
            rol__silindi_mi=False,
            rol__is_active=True,
        )
        .select_related('rol')
    )
    for row in rows:
        if row.rol_id:
            roles.append(row.rol)
    return roles


def _has_active_coach_profile(user) -> bool:
    try:
        personel = user.personel
    except Exception:
        return False
    if personel is None:
        return False
    try:
        profile = personel.coach_profile
    except Exception:
        return False
    return bool(profile and profile.is_active and profile.is_coach)


def _prefer_role(current, candidate):
    if candidate is None:
        return current
    if current is None or candidate.level < current.level:
        return candidate
    return current


def portal_roles(user) -> dict:
    """Panel kodu → o panelde uygulanacak rol (yoksa None)."""
    chosen: dict = {}
    for role in [_user_role_obj(user), *_assignment_roles(user)]:
        if role is None:
            continue
        portal = portal_for_role_code(role.code)
        chosen[portal] = _prefer_role(chosen.get(portal), role)

    if _has_active_coach_profile(user) and PORTAL_COACH not in chosen:
        koc = Role.objects.filter(code__iexact='koc', is_active=True).first()
        chosen[PORTAL_COACH] = koc

    if getattr(user, 'is_superuser', False) and PORTAL_ADMIN not in chosen:
        login_role = _user_role_obj(user)
        if login_role is not None and portal_for_role_code(login_role.code) == PORTAL_ADMIN:
            chosen[PORTAL_ADMIN] = login_role
        else:
            chosen[PORTAL_ADMIN] = None

    return chosen


def portals_payload(user) -> list[dict]:
    roles = portal_roles(user)
    items = []
    for code in PORTALS:
        if code not in roles:
            continue
        role = roles[code]
        items.append({
            'code': code,
            'label': PORTAL_LABELS[code],
            'role_code': role.code if role is not None else None,
        })
    return items


def portal_is_selectable(user, portal: str) -> bool:
    if portal not in PORTALS:
        return False
    if portal in portal_roles(user):
        return True
    return bool(getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False))


def role_for_portal(user, portal: str):
    """Seçilen panelin rolü. Personelin o panelde rolü yoksa None (daraltma yok)."""
    return portal_roles(user).get(portal)


def session_portal(request) -> str | None:
    if request is None:
        return None
    portal = request.session.get(SESSION_KEY)
    if portal in PORTALS:
        return portal
    return None


def apply_active_portal(request) -> None:
    """Oturumdaki paneli kullanıcıya bağlar; yetki kontrolleri bu rolü kullanır."""
    user = getattr(request, 'user', None)
    if not user or not getattr(user, 'is_authenticated', False):
        return
    portal = session_portal(request)
    if not portal or not portal_is_selectable(user, portal):
        if portal:
            request.session.pop(SESSION_KEY, None)
        request.active_portal = None
        return
    request.active_portal = portal
    role = role_for_portal(user, portal)
    if role is not None:
        user._portal_role = role


def set_session_portal(request, portal: str) -> None:
    request.session[SESSION_KEY] = portal
    request.session.modified = True
    request.active_portal = portal
    role = role_for_portal(request.user, portal)
    if role is not None:
        request.user._portal_role = role
    elif hasattr(request.user, '_portal_role'):
        delattr(request.user, '_portal_role')
