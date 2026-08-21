"""
Koç değişikliği servisi.

Öğrencinin birincil koç atamasını sonlandırır, yeni birincil atama oluşturur
ve o güne kadar verilen ödev / görüşme / program / kaynağı yeni koça taşır.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional

from django.db import transaction

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.ogrenci.domain.models import Ogrenci

logger = logging.getLogger(__name__)


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
    transferred: dict | None = None


def get_active_primary_assignment(student_id: int) -> Optional[CoachStudentAssignment]:
    """Öğrencinin aktif birincil koç atamasını döndürür."""
    return (
        CoachStudentAssignment.objects.select_related('coach', 'coach__teacher', 'student')
        .filter(student_id=student_id, is_primary=True, end_date__isnull=True)
        .first()
    )


def end_active_assignments(
    *,
    student_id: int,
    coach_id: int | None = None,
    end_on: Optional[date] = None,
    exclude_id=None,
) -> int:
    """Öğrencinin (isteğe bağlı: belirli koçtaki) aktif atamalarını sonlandır."""
    qs = CoachStudentAssignment.objects.filter(
        student_id=student_id,
        end_date__isnull=True,
    )
    if coach_id is not None:
        qs = qs.filter(coach_id=coach_id)
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs.update(end_date=end_on or date.today())


def _coach_user_id(coach: CoachProfile) -> int | None:
    teacher = getattr(coach, 'teacher', None)
    if teacher is None and coach.teacher_id:
        teacher = getattr(coach, 'teacher', None)
    user_id = getattr(teacher, 'user_id', None) if teacher is not None else None
    return int(user_id) if user_id else None


def transfer_student_coaching_work(
    *,
    student_id: int,
    from_coach: CoachProfile,
    to_coach: CoachProfile,
) -> dict[str, int]:
    """Eski koçtaki öğrenci işini (ödev, görüşme, plan, kaynak, takvim) yeni koça taşı."""
    if from_coach.id == to_coach.id:
        return {}

    from_user_id = _coach_user_id(from_coach)
    to_user_id = _coach_user_id(to_coach)
    from_personel_id = from_coach.teacher_id
    to_personel_id = to_coach.teacher_id
    counts: dict[str, int] = {}

    from apps.coaching.assignment_manual.models import ManualAssignment
    from apps.coaching.models import CoachingEvent, GorusmeKaydi
    from apps.coaching.study_program.models import WeeklyProgram
    from apps.student_resources.models import StudentResourceAssignment

    if from_user_id and to_user_id:
        counts['odev'] = ManualAssignment.objects.filter(
            student_id=student_id, coach_id=from_user_id,
        ).update(coach_id=to_user_id)
        counts['program'] = WeeklyProgram.objects.filter(
            student_id=student_id, coach_id=from_user_id,
        ).update(coach_id=to_user_id)
        counts['kaynak'] = StudentResourceAssignment.objects.filter(
            student_id=student_id, coach_id=from_user_id,
        ).update(coach_id=to_user_id)

    counts['gorusme'] = GorusmeKaydi.objects.filter(
        ogrenci_id=student_id, koc_id=from_coach.id,
    ).update(koc_id=to_coach.id)
    counts['etkinlik'] = CoachingEvent.objects.filter(
        student_id=student_id, coach_id=from_coach.id,
    ).update(coach_id=to_coach.id)

    try:
        from apps.takvim.domain.models import Event

        takvim_q = Event.objects.filter(
            is_deleted=False,
            ogrenci_ids__contains=[int(student_id)],
        )
        moved = 0
        if from_user_id and to_user_id:
            moved += takvim_q.filter(ogretmen_id=from_user_id).update(ogretmen_id=to_user_id)
        if from_personel_id and to_personel_id and from_personel_id != from_user_id:
            moved += Event.objects.filter(
                is_deleted=False,
                ogrenci_ids__contains=[int(student_id)],
                ogretmen_id=from_personel_id,
            ).update(ogretmen_id=to_personel_id)
        counts['takvim'] = moved
    except Exception:
        logger.exception('Takvim koç devri başarısız student=%s', student_id)
        counts['takvim'] = 0

    if from_user_id and to_user_id:
        try:
            from apps.communication.domain.models import Conversation

            counts['sohbet'] = Conversation.objects.filter(
                ogrenci_id=student_id,
                claimed_by_user_id=from_user_id,
            ).update(claimed_by_user_id=to_user_id)
        except Exception:
            logger.exception('Sohbet claim devri başarısız student=%s', student_id)

    return {key: value for key, value in counts.items() if value}


def sync_student_assigned_coach(ogrenci_id: int) -> None:
    try:
        from apps.communication.application.conversation_router import (
            sync_assigned_coach_for_student,
        )

        sync_assigned_coach_for_student(ogrenci_id)
    except Exception:
        logger.exception('Sohbet koç senkronu başarısız student=%s', ogrenci_id)


def transfer_from_last_ended_primary(*, student_id: int, to_coach: CoachProfile) -> dict[str, int]:
    """Atama kaldırılıp yeniden verilince son koçtaki işi yeni koça taşı."""
    previous = (
        CoachStudentAssignment.objects.select_related('coach', 'coach__teacher')
        .filter(student_id=student_id, is_primary=True, end_date__isnull=False)
        .order_by('-end_date', '-updated_at')
        .first()
    )
    if not previous or previous.coach_id == to_coach.id or not previous.coach:
        return {}
    to_loaded = (
        CoachProfile.objects.select_related('teacher').filter(pk=to_coach.id).first()
        or to_coach
    )
    return transfer_student_coaching_work(
        student_id=student_id,
        from_coach=previous.coach,
        to_coach=to_loaded,
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
    2. Yeni koça birincil atama oluştur
    3. Eski koçtaki ödev / görüşme / program / kaynağı yeni koça taşı
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
            end_active_assignments(
                student_id=student.id,
                coach_id=previous.coach_id,
                end_on=transfer_date,
            )

        new_assignment = CoachStudentAssignment.objects.create(
            coach=new_coach,
            student=student,
            start_date=transfer_date,
            is_primary=True,
            created_by=created_by,
        )

        transferred: dict[str, int] = {}
        if previous:
            old_coach = (
                CoachProfile.objects.select_related('teacher')
                .filter(pk=previous.coach_id)
                .first()
            )
            new_coach_loaded = (
                CoachProfile.objects.select_related('teacher')
                .filter(pk=new_coach.id)
                .first()
                or new_coach
            )
            if old_coach:
                transferred = transfer_student_coaching_work(
                    student_id=student.id,
                    from_coach=old_coach,
                    to_coach=new_coach_loaded,
                )

    # Transaction dışında bildirim (başarısızlık atamayı geri almasın)
    try:
        from apps.coaching.services.assignment_notification import (
            CoachingAssignmentNotificationService,
        )

        notifier = CoachingAssignmentNotificationService()
        if previous and previous.coach_id != new_coach.id:
            old_coach = (
                CoachProfile.objects.select_related('teacher')
                .filter(pk=previous.coach_id)
                .first()
            )
            if old_coach:
                notifier.notify_student_removed(old_coach, student)
        new_coach_loaded = (
            CoachProfile.objects.select_related('teacher')
            .filter(pk=new_coach.id)
            .first()
            or new_coach
        )
        notifier.notify_students_assigned(new_coach_loaded, [student])
    except Exception:
        # Bildirim hatası koç değişikliğini etkilemez
        logger.exception('Koç değişikliği bildirimi başarısız')

    sync_student_assigned_coach(student.id)

    return CoachChangeResult(
        previous_assignment=previous,
        new_assignment=new_assignment,
        transferred=transferred,
    )
