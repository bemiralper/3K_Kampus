"""
Koç değişikliği servisi.

Öğrencinin birincil koç atamasını sonlandırır ve yeni birincil atama oluşturur.
Öğrenciye bağlı ödev, program ve diğer kayıtlar silinmez; yalnızca aktif koç ilişkisi güncellenir.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from django.db import transaction

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.ogrenci.domain.models import Ogrenci


class CoachChangeError(Exception):
    """Koç değişikliği doğrulama / iş kuralı hatası."""

    def __init__(self, message: str, code: str = 'validation_error'):
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class CoachChangeResult:
    previous_assignment: Optional[CoachStudentAssignment]
    new_assignment: CoachStudentAssignment


def get_active_primary_assignment(student_id: int) -> Optional[CoachStudentAssignment]:
    """Öğrencinin aktif birincil koç atamasını döndürür."""
    return (
        CoachStudentAssignment.objects.select_related('coach', 'coach__teacher', 'student')
        .filter(student_id=student_id, is_primary=True, end_date__isnull=True)
        .first()
    )


def get_student_assignment_history(student_id: int):
    """Öğrencinin tüm koç atama geçmişi (aktif + sonlandırılmış)."""
    return (
        CoachStudentAssignment.objects.select_related('coach', 'coach__teacher', 'student')
        .filter(student_id=student_id)
        .order_by('-start_date', '-created_at')
    )


def change_primary_coach(
    *,
    student_id: int,
    new_coach_id: int,
    transfer_date: Optional[date] = None,
    created_by=None,
) -> CoachChangeResult:
    """
    Bir öğrencinin birincil koçunu değiştir.

    1. Mevcut aktif birincil atamayı transfer_date ile sonlandır
    2. Yeni koça birincil atama oluştur (aynı transfer_date başlangıç)
    """
    transfer_date = transfer_date or date.today()

    try:
        student = Ogrenci.objects.get(pk=student_id)
    except Ogrenci.DoesNotExist as exc:
        raise CoachChangeError('Öğrenci bulunamadı', code='student_not_found') from exc

    with transaction.atomic():
        try:
            new_coach = CoachProfile.objects.select_for_update().get(
                pk=new_coach_id, is_active=True
            )
        except CoachProfile.DoesNotExist as exc:
            raise CoachChangeError('Yeni koç bulunamadı veya aktif değil', code='coach_not_found') from exc

        previous = (
            CoachStudentAssignment.objects.select_for_update()
            .filter(student=student, is_primary=True, end_date__isnull=True)
            .first()
        )

        if previous and previous.coach_id == new_coach_id:
            raise CoachChangeError(
                'Öğrenci zaten bu koça atanmış',
                code='already_assigned',
            )

        if new_coach.available_capacity <= 0:
            raise CoachChangeError(
                f"Yeni koçun kapasitesi dolu ({new_coach.capacity}/{new_coach.capacity})",
                code='capacity_full',
            )

        if previous:
            previous.end_date = transfer_date
            previous.save(update_fields=['end_date', 'updated_at'])

        new_assignment = CoachStudentAssignment.objects.create(
            coach=new_coach,
            student=student,
            start_date=transfer_date,
            is_primary=True,
            created_by=created_by,
        )

    return CoachChangeResult(previous_assignment=previous, new_assignment=new_assignment)
