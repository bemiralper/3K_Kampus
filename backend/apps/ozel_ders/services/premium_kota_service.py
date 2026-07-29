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


@transaction.atomic
def set_kota(premium_paket_id: int, rows: list[dict[str, Any]]) -> list[dict]:
    PremiumPaketDersKota.objects.filter(premium_paket_id=premium_paket_id).delete()
    created = []
    for row in rows:
        ders_id = row.get('ders_id')
        if not ders_id:
            raise OzelDersError('ders_id zorunlu.', 'ders_id')
        k = PremiumPaketDersKota.objects.create(
            premium_paket_id=premium_paket_id,
            ders_id=ders_id,
            haftalik_adet=int(row.get('haftalik_adet') or 1),
            varsayilan_sure_dk=int(row.get('varsayilan_sure_dk') or 60),
        )
        created.append(k)
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
