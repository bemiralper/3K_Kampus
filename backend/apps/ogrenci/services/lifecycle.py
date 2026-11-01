"""Öğrenci pasife alma işleminin modüller arası, atomik yan etkileri."""
from django.db import transaction
from django.utils import timezone


def assert_can_deactivate(ogrenci_id):
    from apps.odeme_takip.domain.enums import SozlesmeDurum
    from apps.odeme_takip.domain.models import Sozlesme

    if Sozlesme.objects.filter(ogrenci_id=ogrenci_id, durum=SozlesmeDurum.AKTIF).exists():
        raise ValueError('Bu öğrencinin aktif sözleşmesi bulunmaktadır. Önce sözleşmeyi iptal edin veya feshedin.')


@transaction.atomic
def deactivate_student_links(ogrenci_id):
    from apps.academic.domain.student_class_placement import StudentClassPlacement
    from apps.coaching.models import CoachStudentAssignment
    from apps.coaching.services.coach_student_visibility import close_open_coach_assignments
    from apps.kutuphane.domain.models import (
        AssignmentStatus, Seat, SeatAssignment, SeatStatus,
        Locker, LockerAssignment, LockerStatus,
    )
    from apps.ozel_ders.domain.models import BirebirOgrenciProgrami
    from apps.ozel_ders.services.sync_service import deactivate_programs

    StudentClassPlacement.objects.filter(student_id=ogrenci_id, is_active=True).update(is_active=False)
    close_open_coach_assignments([ogrenci_id], reason=CoachStudentAssignment.EndReason.OGRENCI_PASIF)
    seats = SeatAssignment.objects.filter(ogrenci_id=ogrenci_id, durum=AssignmentStatus.ACTIVE)
    seat_ids = list(seats.values_list('seat_id', flat=True))
    # Atama oluşturmayla aynı masa/dolap satırlarını kilitle.
    list(Seat.objects.select_for_update().filter(pk__in=seat_ids))
    seats.update(durum=AssignmentStatus.ENDED, sonlanma_tarihi=timezone.now(),
                 sonlanma_sebebi='Öğrenci pasife alındı')
    occupied = SeatAssignment.objects.filter(seat_id__in=seat_ids, durum=AssignmentStatus.ACTIVE).values('seat_id')
    Seat.objects.filter(pk__in=seat_ids, durum=SeatStatus.OCCUPIED).exclude(pk__in=occupied).update(durum=SeatStatus.AVAILABLE)

    lockers = LockerAssignment.objects.filter(ogrenci_id=ogrenci_id, durum=AssignmentStatus.ACTIVE)
    locker_ids = list(lockers.values_list('locker_id', flat=True))
    list(Locker.objects.select_for_update().filter(pk__in=locker_ids))
    lockers.update(durum=AssignmentStatus.ENDED, bitis_tarihi=timezone.localdate())
    occupied = LockerAssignment.objects.filter(locker_id__in=locker_ids, durum=AssignmentStatus.ACTIVE).values('locker_id')
    Locker.objects.filter(pk__in=locker_ids, durum=LockerStatus.ASSIGNED).exclude(pk__in=occupied).update(durum=LockerStatus.AVAILABLE)
    # Depozito, iade ve geçmiş hakediş bilgileri değiştirilmez.
    deactivate_programs(BirebirOgrenciProgrami.objects.filter(ogrenci_id=ogrenci_id))
