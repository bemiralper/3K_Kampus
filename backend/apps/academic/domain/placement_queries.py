"""Aktif öğrenci yerleşim sorguları.

Pasife alınan öğrenciler (`Ogrenci.aktif_mi=False`) sınıf listesi, PDF,
yoklama ve mevcutluk sayımlarında yer almamalıdır. Tüm liste/count
yolları bu yardımcıyı kullanır.
"""
from __future__ import annotations

from django.db.models import QuerySet

from apps.academic.domain.student_class_placement import StudentClassPlacement


def active_student_placements(**filters) -> QuerySet[StudentClassPlacement]:
    """is_active yerleşimler + yalnızca aktif öğrenciler."""
    return StudentClassPlacement.objects.filter(
        is_active=True,
        student__aktif_mi=True,
        **filters,
    )
