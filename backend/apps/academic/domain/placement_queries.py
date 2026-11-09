"""Aktif öğrenci yerleşim sorguları.

Pasife alınan öğrenciler (`Ogrenci.aktif_mi=False`) sınıf listesi, PDF,
yoklama ve mevcutluk sayımlarında yer almamalıdır. Tüm liste/count
yolları bu yardımcıyı kullanır.
"""
from __future__ import annotations

from django.db.models import Q, QuerySet

from apps.academic.domain.student_class_placement import StudentClassPlacement


def active_student_placements(*, on_date=None, **filters) -> QuerySet[StudentClassPlacement]:
    """is_active yerleşimler + yalnızca aktif öğrenciler."""
    qs = StudentClassPlacement.objects.filter(
        is_active=True,
        student__aktif_mi=True,
        **filters,
    )
    if on_date is not None:
        qs = qs.filter(Q(start_date__isnull=True) | Q(start_date__lte=on_date)).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=on_date)
        )
    return qs
