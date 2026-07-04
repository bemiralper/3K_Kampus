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
