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

    # Günü birlik deneme öğrencisi pasife alındığında gelecekteki açık sınav
    # koltukları boşaltılır ve henüz girilmemiş açık sınavların ücreti kapatılır.
    from apps.ogrenci.domain.models import Ogrenci
    from apps.ogrenci.services.kayit_turu import is_gunu_birlik_kayit

    ogrenci = Ogrenci.objects.filter(pk=ogrenci_id).first()
    if ogrenci is not None and is_gunu_birlik_kayit(ogrenci):
        from apps.coaching.olcme_degerlendirme.models import ExamParticipant, StudentAnswer
        from apps.ogrenci_kayit.application.deneme_ucret import void_deneme_ucreti
        from apps.ogrenci_kayit.application.sinav_uygunluk import exam_is_open

        open_parts = list(
            ExamParticipant.objects.filter(student_id=ogrenci_id)
            .select_related('exam')
            .prefetch_related('exam__exam_sessions')
        )
        touched_exams = {}
        for part in open_parts:
            exam = part.exam
            if not exam_is_open(exam):
                continue
            if StudentAnswer.objects.filter(session__exam=exam, student_id=ogrenci_id).exists():
                continue
            touched_exams[exam.id] = exam
            part.delete()
        for exam in touched_exams.values():
            if not ExamParticipant.objects.filter(exam=exam, student_id=ogrenci_id).exists():
                void_deneme_ucreti(ogrenci=ogrenci, exam=exam)
