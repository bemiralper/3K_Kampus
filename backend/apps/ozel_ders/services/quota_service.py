"""Ders bazlı saat kotası — planlı + işlenen dakika, kalan, fazla PLANLANDI budama."""
from __future__ import annotations

from datetime import date
from typing import Optional

from django.db.models import Q
from django.utils import timezone

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    HakedisDurumu,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
)

QUOTA_STATUSES = (OturumDurumu.PLANLANDI, OturumDurumu.ISLENDI, OturumDurumu.ONLINE)
QUOTA_TURU = (OturumTuru.OZEL, OturumTuru.TELAFI)
_LOCKED_HAKEDIS = (HakedisDurumu.ONAYLANDI, HakedisDurumu.BORDOYA_ISLENDI)


def parse_hedef_dakika(value) -> Optional[int]:
    if value in (None, '', False):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n < 0:
        from apps.ozel_ders.services.errors import OzelDersError
        raise OzelDersError('Hedef süre negatif olamaz.', 'hedef_dakika')
    return n or None


def resolve_ders_hedef_dakika(*, ogrenci_id: int, ders_id: int) -> Optional[int]:
    values = list(
        BirebirHaftalikSlot.objects.filter(
            aktif=True,
            ders_id=ders_id,
            program__ogrenci_id=ogrenci_id,
            program__durum=ProgramDurumu.AKTIF,
            hedef_dakika__isnull=False,
            hedef_dakika__gt=0,
        ).values_list('hedef_dakika', flat=True)
    )
    return max(values) if values else None


def consumed_quota_minutes(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: Optional[int] = None,
) -> int:
    """Yalnızca işlenen (ISLENDI/ONLINE) süre — planlı oturumlar dahil değil."""
    qs = BirebirDersOturumu.objects.filter(
        ogrenci_id=ogrenci_id,
        ders_id=ders_id,
        is_active=True,
        oturum_turu__in=QUOTA_TURU,
        durum__in=(OturumDurumu.ISLENDI, OturumDurumu.ONLINE),
    )
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    total = 0
    for o in qs.only('start_time', 'end_time'):
        total += o.duration_minutes()
    return total


def close_future_planlandi(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: Optional[int] = None,
    today: Optional[date] = None,
) -> int:
    """Bu dersin bugünden sonraki planlı oturumlarını kapatır (işlenenlere dokunmaz)."""
    day = today or timezone.localdate()
    extras = (
        BirebirDersOturumu.objects.filter(
            ogrenci_id=ogrenci_id,
            ders_id=ders_id,
            is_active=True,
            durum=OturumDurumu.PLANLANDI,
            oturum_turu=OturumTuru.OZEL,
            session_date__gt=day,
        )
        .filter(Q(hakedis__isnull=True) | ~Q(hakedis__durum__in=_LOCKED_HAKEDIS))
    )
    if kurum_id:
        extras = extras.filter(kurum_id=kurum_id)
    deactivated = 0
    for oturum in extras:
        oturum.is_active = False
        oturum.save(update_fields=['is_active', 'updated_at'])
        deactivated += 1
    return deactivated


def used_quota_minutes(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: Optional[int] = None,
) -> int:
    qs = BirebirDersOturumu.objects.filter(
        ogrenci_id=ogrenci_id,
        ders_id=ders_id,
        is_active=True,
        oturum_turu__in=QUOTA_TURU,
        durum__in=QUOTA_STATUSES,
    )
    if kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    total = 0
    for o in qs.only('start_time', 'end_time'):
        total += o.duration_minutes()
    return total


def remaining_quota_minutes(
    *,
    ogrenci_id: int,
    ders_id: int,
    kurum_id: Optional[int] = None,
    hedef_dakika: Optional[int] = None,
) -> Optional[int]:
    hedef = hedef_dakika if hedef_dakika is not None else resolve_ders_hedef_dakika(
        ogrenci_id=ogrenci_id, ders_id=ders_id,
    )
    if not hedef:
        return None
    return max(hedef - used_quota_minutes(
        ogrenci_id=ogrenci_id, ders_id=ders_id, kurum_id=kurum_id,
    ), 0)


def trim_excess_planlandi(
    *,
    ogrenci_id: int,
    ders_id: int,
    hedef_dakika: Optional[int] = None,
    kurum_id: Optional[int] = None,
    today: Optional[date] = None,
) -> int:
    """Kota aşıldıysa en yeni gelecek PLANLANDI oturumlarını pasifleştirir."""
    hedef = hedef_dakika if hedef_dakika is not None else resolve_ders_hedef_dakika(
        ogrenci_id=ogrenci_id, ders_id=ders_id,
    )
    if not hedef:
        return 0
    used = used_quota_minutes(ogrenci_id=ogrenci_id, ders_id=ders_id, kurum_id=kurum_id)
    if used <= hedef:
        return 0

    day = today or timezone.localdate()
    extras = (
        BirebirDersOturumu.objects.filter(
            ogrenci_id=ogrenci_id,
            ders_id=ders_id,
            is_active=True,
            durum=OturumDurumu.PLANLANDI,
            oturum_turu=OturumTuru.OZEL,
            session_date__gt=day,
        )
        .filter(Q(hakedis__isnull=True) | ~Q(hakedis__durum__in=_LOCKED_HAKEDIS))
        .order_by('-session_date', '-id')
    )
    if kurum_id:
        extras = extras.filter(kurum_id=kurum_id)

    deactivated = 0
    for oturum in extras:
        if used <= hedef:
            break
        oturum.is_active = False
        oturum.save(update_fields=['is_active', 'updated_at'])
        used -= oturum.duration_minutes()
        deactivated += 1
    return deactivated
