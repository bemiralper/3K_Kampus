"""
Kurum erişim politikası — kullanıcının erişebileceği kurumlar.

Kurallar:
- süper kullanıcı → tüm aktif kurumlar
- personel → bağlı Personel.kurum + aynı e-posta ile diğer kurumlardaki aktif personel kayıtları
- kurum seçici yalnızca birden fazla erişilebilir kurum varsa gösterilir
"""
from __future__ import annotations

from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel


def get_allowed_kurumlar_for_user(user):
    """Kullanıcının erişebileceği aktif kurumları döndürür (QuerySet)."""
    base_qs = Kurum.objects.filter(aktif_mi=True).order_by('ad')

    if getattr(user, 'is_superuser', False):
        return base_qs

    kurum_ids: set[int] = set()

    try:
        personel = user.personel
        if personel and personel.aktif_mi and personel.kurum_id:
            kurum_ids.add(personel.kurum_id)
    except Personel.DoesNotExist:
        pass
    except Exception:
        pass

    email = (getattr(user, 'email', None) or '').strip()
    if email:
        extra_ids = (
            Personel.objects.filter(aktif_mi=True, email__iexact=email)
            .values_list('kurum_id', flat=True)
            .distinct()
        )
        kurum_ids.update(extra_ids)

    if not kurum_ids:
        return Kurum.objects.none()

    return base_qs.filter(id__in=kurum_ids)


def user_linked_kurum_ids(user) -> set[int]:
    """Kullanıcının bağlı olduğu kurum kimlikleri (personel, e-posta, rol ataması).

    Boş küme = hiç kurum bağı yok (UserRole.kurum boşsa "global rol").
    """
    ids: set[int] = set()
    if not user or not getattr(user, 'is_authenticated', False):
        return ids
    ids.update(get_allowed_kurumlar_for_user(user).values_list('id', flat=True))
    try:
        role_kurum_id = user.user_role.kurum_id
    except Exception:
        role_kurum_id = None
    if role_kurum_id:
        ids.add(int(role_kurum_id))
    return ids


def user_can_access_kurum(user, kurum_id) -> bool:
    """İstenen kurum kullanıcının bağlı olduğu kurumlardan biri mi.

    Kurum bağı olan hesap yalnız kendi kurumlarına erişir. Hiç kurum bağı
    olmayan hesap (Personel yok, rol kurumu boş) sistemde "global rol"
    sayılır ve mevcut davranış korunur.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    try:
        kurum_id = int(kurum_id)
    except (TypeError, ValueError):
        return False
    linked = user_linked_kurum_ids(user)
    if not linked:
        return True
    return kurum_id in linked


def user_needs_kurum_picker(user) -> bool:
    """Login sonrası kurum seçimi gerekir mi?"""
    return get_allowed_kurumlar_for_user(user).count() > 1


def serialize_kurum(kurum) -> dict:
    return {
        'id': kurum.id,
        'ad': kurum.ad,
        'kod': getattr(kurum, 'kod', '') or '',
        'aktif_mi': kurum.aktif_mi,
    }
