from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.ozel_ders.domain.models import PremiumPaketDersKota
from apps.ozel_ders.services.errors import OzelDersError


def serialize_kota(k: PremiumPaketDersKota) -> dict:
    return {
        'id': k.id,
        'premium_paket': k.premium_paket_id,
        'ders': k.ders_id,
        'ders_ad': getattr(k.ders, 'display_name', None) or getattr(k.ders, 'ad', str(k.ders_id)),
        'haftalik_adet': k.haftalik_adet,
        'varsayilan_sure_dk': k.varsayilan_sure_dk,
    }


def list_kota(premium_paket_id: int) -> list[dict]:
    qs = PremiumPaketDersKota.objects.filter(
        premium_paket_id=premium_paket_id,
    ).select_related('ders')
    return [serialize_kota(k) for k in qs]


def _bounded_int(value, *, default: int, min_v: int, max_v: int, field: str) -> int:
    if value in (None, ''):
        return default
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise OzelDersError(f'{field} sayı olmalı.', field)
    if n < min_v or n > max_v:
        raise OzelDersError(f'{field} {min_v}-{max_v} arasında olmalı.', field)
    return n


@transaction.atomic
def set_kota(premium_paket_id: int, rows: list[dict[str, Any]], *, kurum_id: int | None = None) -> list[dict]:
    if not isinstance(rows, list):
        raise OzelDersError('Kota listesi geçersiz.', 'kotalar')
    clean: list[tuple[int, int, int]] = []
    seen: set[int] = set()
    for row in rows:
        if not isinstance(row, dict) or not row.get('ders_id'):
            raise OzelDersError('ders_id zorunlu.', 'ders_id')
        try:
            ders_id = int(row['ders_id'])
        except (TypeError, ValueError):
            raise OzelDersError('ders_id geçersiz.', 'ders_id')
        if ders_id in seen:
            raise OzelDersError('Aynı ders kotaya birden fazla eklenemez.', 'ders_id')
        seen.add(ders_id)
        clean.append((
            ders_id,
            _bounded_int(row.get('haftalik_adet'), default=1, min_v=1, max_v=14, field='haftalik_adet'),
            _bounded_int(row.get('varsayilan_sure_dk'), default=60, min_v=10, max_v=300, field='varsayilan_sure_dk'),
        ))
    if kurum_id is not None:
        from apps.ozel_ders.services.scope_guard import ensure_dersler
        ensure_dersler([c[0] for c in clean], kurum_id=kurum_id)

    PremiumPaketDersKota.objects.filter(premium_paket_id=premium_paket_id).delete()
    for ders_id, adet, sure in clean:
        PremiumPaketDersKota.objects.create(
            premium_paket_id=premium_paket_id,
            ders_id=ders_id,
            haftalik_adet=adet,
            varsayilan_sure_dk=sure,
        )
    return [serialize_kota(k) for k in PremiumPaketDersKota.objects.filter(
        premium_paket_id=premium_paket_id,
    ).select_related('ders')]


def suggest_slots_from_kota(premium_paket_id: int) -> list[dict]:
    """Öğretmen/saat boş iskelet — kullanıcı doldurur."""
    suggestions = []
    for k in PremiumPaketDersKota.objects.filter(
        premium_paket_id=premium_paket_id,
    ).select_related('ders'):
        for i in range(k.haftalik_adet):
            suggestions.append({
                'ders': k.ders_id,
                'ders_ad': getattr(k.ders, 'display_name', None) or getattr(k.ders, 'ad', ''),
                'sure_dk': k.varsayilan_sure_dk,
                'gun': None,
                'baslangic': None,
                'bitis': None,
                'ogretmen': None,
                'oda': None,
                'sira': i + 1,
            })
    return suggestions
