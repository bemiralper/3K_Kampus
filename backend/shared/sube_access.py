"""
Şube erişim politikası — kullanıcının görebileceği şubeler.

Kurallar:
- kurum_yoneticisi → kurumdaki tüm şubeler (global şube seçici erişimi)
- Diğer roller (muhasebe dahil) → aktif eğitim yılındaki PersonelGorevlendirme kayıtlarındaki şubeler
- Süper kullanıcı → tüm şubeler (opsiyonel kurum filtresi)

Not: muhasebe rolü Mali Hesap yetkilisi picker'ında listelenir (finans-yetkililer API)
      ancak global şube picker erişimi yalnızca kurum_yoneticisi içindir.
"""
from __future__ import annotations

from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.sube.domain.models import Sube

# Kurum genelinde tüm şubelere erişebilen roller (şube seçici / context)
GLOBAL_SUBE_ROLE_CODES = frozenset({'kurum_yoneticisi'})


def get_user_role_code(user) -> str | None:
    try:
        user_role = user.user_role
        if user_role and user_role.role:
            return user_role.role.code
    except Exception:
        pass
    return None


def user_has_global_sube_access(user) -> bool:
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_role_code(user) in GLOBAL_SUBE_ROLE_CODES


def get_allowed_subeler_for_user(user, kurum_id=None, egitim_yili_id=None):
    """
    Kullanıcının erişebileceği aktif şubeleri döndürür (QuerySet).
    """
    base_qs = Sube.objects.filter(aktif_mi=True).select_related('kurum').order_by('ad')

    if getattr(user, 'is_superuser', False):
        if kurum_id:
            return base_qs.filter(kurum_id=kurum_id)
        return base_qs

    role_code = get_user_role_code(user)

    personel = None
    try:
        personel = user.personel
    except Personel.DoesNotExist:
        personel = None
    except Exception:
        personel = None

    if not personel:
        if kurum_id:
            return base_qs.filter(kurum_id=kurum_id)
        return Sube.objects.none()

    kid = kurum_id or personel.kurum_id

    if role_code in GLOBAL_SUBE_ROLE_CODES:
        return base_qs.filter(kurum_id=kid)

    gorev_qs = PersonelGorevlendirme.objects.filter(
        personel=personel,
        kurum_id=kid,
        aktif_mi=True,
    )
    if egitim_yili_id:
        gorev_qs = gorev_qs.filter(egitim_yili_id=egitim_yili_id)

    sube_ids = set(gorev_qs.values_list('gorev_sube_id', flat=True))
    if personel.sube_id:
        sube_ids.add(personel.sube_id)
    if not sube_ids:
        return Sube.objects.none()

    return base_qs.filter(id__in=sube_ids)


def user_needs_sube_picker(user, kurum_id=None, egitim_yili_id=None) -> bool:
    """Login sonrası zorunlu şube seçimi gerekir mi? (çok şubeli, global rol değil)"""
    if user_has_global_sube_access(user):
        return False
    subeler = get_allowed_subeler_for_user(user, kurum_id=kurum_id, egitim_yili_id=egitim_yili_id)
    return subeler.count() > 1


def user_requires_login_sube_selection(user, kurum_id=None, egitim_yili_id=None) -> bool:
    """
    Login akışında şube seçimi zorunlu mu?

    kurum_yoneticisi ve süper kullanıcı girişte şube seçer;
    diğer personel yalnızca birden fazla görev şubesi varsa seçer.
    """
    if getattr(user, 'is_superuser', False):
        return True
    if get_user_role_code(user) in GLOBAL_SUBE_ROLE_CODES:
        return True
    return user_needs_sube_picker(user, kurum_id=kurum_id, egitim_yili_id=egitim_yili_id)


def serialize_sube(sube) -> dict:
    return {
        'id': sube.id,
        'ad': sube.ad,
        'kod': getattr(sube, 'kod', '') or '',
        'aktif_mi': sube.aktif_mi,
        'kurum_id': sube.kurum_id,
        'kurum_ad': sube.kurum.ad if sube.kurum_id else '',
    }
