"""Yayınevi adından ResourcePublisher çözümleme / oluşturma."""
from __future__ import annotations

import re

from apps.resources.models import ResourcePublisher


def normalize_publisher_ad(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').strip())


def resolve_or_create_publisher(kurum_id: int, ad: str, *, kisa_ad: str = '') -> ResourcePublisher | None:
    ad = normalize_publisher_ad(ad)
    if not kurum_id or not ad:
        return None
    existing = (
        ResourcePublisher.objects.filter(kurum_id=kurum_id, ad__iexact=ad)
        .order_by('id')
        .first()
    )
    if existing:
        return existing
    return ResourcePublisher.objects.create(
        kurum_id=kurum_id,
        ad=ad,
        kisa_ad=(kisa_ad or ad)[:100],
        aktif_mi=True,
    )
