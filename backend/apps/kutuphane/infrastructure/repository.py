"""
Kütüphane Repository
Data access layer following Repository Pattern
"""
from typing import List, Optional
from datetime import date, datetime
from django.db.models import QuerySet, Q, Count, F
from django.utils import timezone

from apps.kutuphane.domain.models import (
    Library, SessionDefinition, Seat, Locker,
    SeatAssignment, LockerAssignment,
    AttendanceSession, AttendanceRecord,
    TemporarySeating,
    LibraryAuditLog,
    SubeDersProgrami, OgrenciIzin,
    LibraryStatus, SeatStatus, LockerStatus,
    AssignmentStatus, AttendanceSessionStatus,
    TemporarySeatingStatus, ExemptionType,
    AttendanceStatus, AttendanceType, SessionCode
)


# ──────────────────────────────────────
# LIBRARY REPOSITORY
# ──────────────────────────────────────

class LibraryRepository:
    """Kütüphane Salonu veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int, sube_id: int) -> QuerySet:
        return Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False
        )

    @staticmethod
    def get_aktif(kurum_id: int, sube_id: int) -> QuerySet:
        return Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False, durum=LibraryStatus.ACTIVE
        )

    @staticmethod
    def get_by_id(library_id) -> Optional[Library]:
        try:
            return Library.objects.get(id=library_id, is_deleted=False)
        except Library.DoesNotExist:
            return None

    @staticmethod
    def get_with_stats(kurum_id: int, sube_id: int) -> QuerySet:
        """İstatistiklerle beraber listele"""
        return Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False
        ).annotate(
            toplam_masa=Count('masalar', filter=Q(masalar__is_deleted=False)),
            dolu_masa=Count('masalar', filter=Q(
                masalar__is_deleted=False,
                masalar__durum=SeatStatus.OCCUPIED
            )),
            bos_masa=Count('masalar', filter=Q(
                masalar__is_deleted=False,
                masalar__durum=SeatStatus.AVAILABLE
            )),
            arizali_masa=Count('masalar', filter=Q(
                masalar__is_deleted=False,
                masalar__durum=SeatStatus.OUT_OF_SERVICE
            )),
            aktif_atama=Count('masalar__atamalar', filter=Q(
                masalar__atamalar__durum=AssignmentStatus.ACTIVE,
                masalar__is_deleted=False
            )),
        )

    @staticmethod
    def create(data: dict) -> Library:
        # Model'de olmayan alanları filtrele
        valid_fields = {f.name for f in Library._meta.get_fields()}
        clean_data = {k: v for k, v in data.items() if k in valid_fields}
        return Library.objects.create(**clean_data)

    @staticmethod
    def update(library_id, data: dict) -> Optional[Library]:
        library = LibraryRepository.get_by_id(library_id)
        if library:
            valid_fields = {f.name for f in Library._meta.get_fields()}
            for key, value in data.items():
                if key in valid_fields:
                    setattr(library, key, value)
            library.save()
        return library

    @staticmethod
    def soft_delete(library_id) -> bool:
        library = LibraryRepository.get_by_id(library_id)
        if library:
            library.is_deleted = True
            library.deleted_at = timezone.now()
            library.save()
            return True
        return False

    @staticmethod
    def search(kurum_id: int, sube_id: int, query: str) -> QuerySet:
        return Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False
        ).filter(
            Q(ad__icontains=query) | Q(kod__icontains=query)
        )

    @staticmethod
    def exists_by_kod(kurum_id: int, sube_id: int, kod: str, exclude_id=None) -> bool:
        qs = Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, kod=kod, is_deleted=False,
        )
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()

    @staticmethod
    def exists_by_ad(kurum_id: int, sube_id: int, ad: str, exclude_id=None) -> bool:
        qs = Library.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, ad=ad, is_deleted=False,
        )
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()


# ──────────────────────────────────────
# SEAT REPOSITORY
# ──────────────────────────────────────

class SeatRepository:
    """Masa veri erişim katmanı"""

    @staticmethod
    def get_all(library_id) -> QuerySet:
        return Seat.objects.filter(library_id=library_id, is_deleted=False)

    @staticmethod
    def get_by_id(seat_id) -> Optional[Seat]:
        try:
            return Seat.objects.get(id=seat_id, is_deleted=False)
        except Seat.DoesNotExist:
            return None

    @staticmethod
    def get_available(library_id) -> QuerySet:
        return Seat.objects.filter(
            library_id=library_id,
            is_deleted=False,
            durum=SeatStatus.AVAILABLE
        )

    @staticmethod
    def get_with_assignments(library_id) -> QuerySet:
        """Masa listesini aktif atamalarla beraber getir"""
        return Seat.objects.filter(
            library_id=library_id, is_deleted=False
        ).prefetch_related(
            'atamalar'
        ).order_by('sira', 'masa_no')

    @staticmethod
    def create(data: dict) -> Seat:
        return Seat.objects.create(**data)

    @staticmethod
    def bulk_create(seats_data: list) -> list:
        seats = [Seat(**data) for data in seats_data]
        return Seat.objects.bulk_create(seats)

    @staticmethod
    def update(seat_id, data: dict) -> Optional[Seat]:
        seat = SeatRepository.get_by_id(seat_id)
        if seat:
            for key, value in data.items():
                setattr(seat, key, value)
            seat.save()
        return seat

    @staticmethod
    def soft_delete(seat_id) -> bool:
        seat = SeatRepository.get_by_id(seat_id)
        if seat:
            seat.is_deleted = True
            seat.deleted_at = timezone.now()
            seat.save()
            return True
        return False

    @staticmethod
    def count_active(library_id) -> int:
        return Seat.objects.filter(library_id=library_id, is_deleted=False).count()

    @staticmethod
    def exists_by_no(library_id, masa_no: str, exclude_id=None) -> bool:
        qs = Seat.objects.filter(library_id=library_id, masa_no=masa_no, is_deleted=False)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()

    @staticmethod
    def get_status_counts(library_id) -> dict:
        """Durum bazlı masa sayıları"""
        counts = Seat.objects.filter(
            library_id=library_id, is_deleted=False
        ).values('durum').annotate(count=Count('id'))
        return {item['durum']: item['count'] for item in counts}


# ──────────────────────────────────────
# LOCKER REPOSITORY
# ──────────────────────────────────────

class LockerRepository:
    """Dolap veri erişim katmanı — Kurum bazlı"""

    @staticmethod
    def get_all(kurum_id: int, sube_id: int) -> QuerySet:
        return Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
        )

    @staticmethod
    def get_by_id(locker_id) -> Optional[Locker]:
        try:
            return Locker.objects.get(id=locker_id, is_deleted=False)
        except Locker.DoesNotExist:
            return None

    @staticmethod
    def get_available(kurum_id: int, sube_id: int) -> QuerySet:
        return Locker.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            is_deleted=False,
            durum=LockerStatus.AVAILABLE
        )

    @staticmethod
    def create(data: dict) -> Locker:
        return Locker.objects.create(**data)

    @staticmethod
    def bulk_create(lockers_data: list) -> list:
        lockers = [Locker(**data) for data in lockers_data]
        return Locker.objects.bulk_create(lockers)

    @staticmethod
    def update(locker_id, data: dict) -> Optional[Locker]:
        locker = LockerRepository.get_by_id(locker_id)
        if locker:
            for key, value in data.items():
                setattr(locker, key, value)
            locker.save()
        return locker

    @staticmethod
    def soft_delete(locker_id) -> bool:
        locker = LockerRepository.get_by_id(locker_id)
        if locker:
            locker.is_deleted = True
            locker.deleted_at = timezone.now()
            locker.save()
            return True
        return False

    @staticmethod
    def count_active(kurum_id: int, sube_id: int) -> int:
        return Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
        ).count()

    @staticmethod
    def get_status_counts(kurum_id: int, sube_id: int) -> dict:
        counts = Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
        ).values('durum').annotate(count=Count('id'))
        return {item['durum']: item['count'] for item in counts}


# ──────────────────────────────────────
# SESSION DEFINITION REPOSITORY
# ──────────────────────────────────────

class SessionDefinitionRepository:
    """Oturum Tanımı veri erişim katmanı"""

    @staticmethod
    def get_all(library_id) -> QuerySet:
        return SessionDefinition.objects.filter(library_id=library_id)

    @staticmethod
    def get_aktif(library_id) -> QuerySet:
        return SessionDefinition.objects.filter(library_id=library_id, aktif_mi=True)

    @staticmethod
    def get_by_id(definition_id) -> Optional[SessionDefinition]:
        try:
            return SessionDefinition.objects.get(id=definition_id)
        except SessionDefinition.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> SessionDefinition:
        return SessionDefinition.objects.create(**data)

    @staticmethod
    def update(definition_id, data: dict) -> Optional[SessionDefinition]:
        definition = SessionDefinitionRepository.get_by_id(definition_id)
        if definition:
            for key, value in data.items():
                setattr(definition, key, value)
            definition.save()
        return definition

    @staticmethod
    def delete(definition_id) -> bool:
        definition = SessionDefinitionRepository.get_by_id(definition_id)
        if definition:
            definition.delete()
            return True
        return False

    @staticmethod
    def check_time_overlap(library_id, start_time, end_time, exclude_id=None) -> bool:
        """Saat çakışması kontrolü"""
        qs = SessionDefinition.objects.filter(
            library_id=library_id,
            aktif_mi=True
        ).filter(
            Q(baslangic_saati__lt=end_time, bitis_saati__gt=start_time)
        )
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()


# ──────────────────────────────────────
# SEAT ASSIGNMENT REPOSITORY
# ──────────────────────────────────────

class SeatAssignmentRepository:
    """Masa Ataması veri erişim katmanı"""

    @staticmethod
    def get_all(library_id) -> QuerySet:
        return SeatAssignment.objects.filter(
            library_id=library_id
        ).select_related('seat', 'library')

    @staticmethod
    def get_aktif(library_id) -> QuerySet:
        return SeatAssignment.objects.filter(
            library_id=library_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('seat', 'library')

    @staticmethod
    def get_by_id(assignment_id) -> Optional[SeatAssignment]:
        try:
            return SeatAssignment.objects.select_related('seat', 'library').get(id=assignment_id)
        except SeatAssignment.DoesNotExist:
            return None

    @staticmethod
    def get_active_by_seat(seat_id) -> Optional[SeatAssignment]:
        try:
            return SeatAssignment.objects.get(
                seat_id=seat_id,
                durum=AssignmentStatus.ACTIVE
            )
        except SeatAssignment.DoesNotExist:
            return None

    @staticmethod
    def get_active_by_student(ogrenci_id: int) -> Optional[SeatAssignment]:
        """Öğrencinin herhangi bir salondaki aktif masa atamasını döndürür (en fazla 1 olabilir)"""
        return SeatAssignment.objects.filter(
            ogrenci_id=ogrenci_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('seat', 'library').first()

    @staticmethod
    def create(data: dict) -> SeatAssignment:
        return SeatAssignment.objects.create(**data)

    @staticmethod
    def update(assignment_id, data: dict) -> Optional[SeatAssignment]:
        assignment = SeatAssignmentRepository.get_by_id(assignment_id)
        if assignment:
            for key, value in data.items():
                setattr(assignment, key, value)
            assignment.save()
        return assignment

    @staticmethod
    def count_active(library_id) -> int:
        return SeatAssignment.objects.filter(
            library_id=library_id,
            durum=AssignmentStatus.ACTIVE
        ).count()

    @staticmethod
    def has_active_for_seat(seat_id) -> bool:
        return SeatAssignment.objects.filter(
            seat_id=seat_id,
            durum=AssignmentStatus.ACTIVE
        ).exists()


# ──────────────────────────────────────
# LOCKER ASSIGNMENT REPOSITORY
# ──────────────────────────────────────

class LockerAssignmentRepository:
    """Dolap Ataması veri erişim katmanı — Kurum bazlı"""

    @staticmethod
    def get_all(kurum_id: int) -> QuerySet:
        return LockerAssignment.objects.filter(
            kurum_id=kurum_id
        ).select_related('locker')

    @staticmethod
    def get_aktif(kurum_id: int) -> QuerySet:
        return LockerAssignment.objects.filter(
            kurum_id=kurum_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('locker')

    @staticmethod
    def get_by_id(assignment_id) -> Optional[LockerAssignment]:
        try:
            return LockerAssignment.objects.select_related('locker').get(id=assignment_id)
        except LockerAssignment.DoesNotExist:
            return None

    @staticmethod
    def get_active_by_locker(locker_id) -> Optional[LockerAssignment]:
        try:
            return LockerAssignment.objects.get(
                locker_id=locker_id,
                durum=AssignmentStatus.ACTIVE
            )
        except LockerAssignment.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> LockerAssignment:
        return LockerAssignment.objects.create(**data)

    @staticmethod
    def update(assignment_id, data: dict) -> Optional[LockerAssignment]:
        assignment = LockerAssignmentRepository.get_by_id(assignment_id)
        if assignment:
            for key, value in data.items():
                setattr(assignment, key, value)
            assignment.save()
        return assignment

    @staticmethod
    def count_active(kurum_id: int) -> int:
        return LockerAssignment.objects.filter(
            kurum_id=kurum_id,
            durum=AssignmentStatus.ACTIVE
        ).count()

    @staticmethod
    def get_active_by_student(ogrenci_id: int) -> Optional[LockerAssignment]:
        """Öğrencinin aktif dolap atamasını döndürür (en fazla 1 olabilir)"""
        return LockerAssignment.objects.filter(
            ogrenci_id=ogrenci_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('locker').first()

    @staticmethod
    def has_active_for_locker(locker_id) -> bool:
        return LockerAssignment.objects.filter(
            locker_id=locker_id,
            durum=AssignmentStatus.ACTIVE
        ).exists()


# ──────────────────────────────────────
# ATTENDANCE REPOSITORY
# ──────────────────────────────────────

class AttendanceRepository:
    """Yoklama veri erişim katmanı"""

    @staticmethod
    def get_sessions(library_id, tarih: date = None) -> QuerySet:
        qs = AttendanceSession.objects.filter(
            library_id=library_id
        )
        if tarih:
            qs = qs.filter(tarih=tarih)
        return qs

    @staticmethod
    def get_session_by_id(session_id) -> Optional[AttendanceSession]:
        try:
            return AttendanceSession.objects.select_related(
                'library'
            ).get(id=session_id)
        except AttendanceSession.DoesNotExist:
            return None

    @staticmethod
    def get_open_sessions(library_id) -> QuerySet:
        return AttendanceSession.objects.filter(
            library_id=library_id,
            durum=AttendanceSessionStatus.OPEN
        )

    @staticmethod
    def create_session(data: dict) -> AttendanceSession:
        return AttendanceSession.objects.create(**data)

    @staticmethod
    def get_records(session_id) -> QuerySet:
        return AttendanceRecord.objects.filter(
            attendance_session_id=session_id
        ).select_related('seat')

    @staticmethod
    def create_record(data: dict) -> AttendanceRecord:
        return AttendanceRecord.objects.create(**data)

    @staticmethod
    def update_record(record_id, data: dict) -> Optional[AttendanceRecord]:
        try:
            record = AttendanceRecord.objects.get(id=record_id)
            for key, value in data.items():
                setattr(record, key, value)
            record.save()
            return record
        except AttendanceRecord.DoesNotExist:
            return None

    @staticmethod
    def bulk_create_records(records_data: list) -> list:
        records = [AttendanceRecord(**data) for data in records_data]
        return AttendanceRecord.objects.bulk_create(records)

    @staticmethod
    def session_exists(library_id, periyot_kodu, tarih: date, ders_no=None) -> bool:
        qs = AttendanceSession.objects.filter(
            library_id=library_id,
            periyot_kodu=periyot_kodu,
            tarih=tarih
        )
        if ders_no is not None:
            qs = qs.filter(ders_no=ders_no)
        else:
            qs = qs.filter(ders_no__isnull=True)
        return qs.exists()

    @staticmethod
    def get_sessions_by_date_range(library_id, start_date: date, end_date: date) -> QuerySet:
        """Tarih aralığındaki yoklama oturumlarını getirir"""
        return AttendanceSession.objects.filter(
            library_id=library_id,
            tarih__gte=start_date,
            tarih__lte=end_date
        ).select_related('sube_ders_programi').order_by('tarih', 'periyot_kodu', 'ders_no')

    @staticmethod
    def get_lesson_sessions(library_id, periyot_kodu, tarih: date) -> QuerySet:
        """Belirli bir periyodun ders bazlı yoklama oturumlarını getirir"""
        return AttendanceSession.objects.filter(
            library_id=library_id,
            periyot_kodu=periyot_kodu,
            tarih=tarih,
            yoklama_tipi=AttendanceType.LESSON
        ).order_by('ders_no')

    @staticmethod
    def get_student_attendance_summary(ogrenci_id: int, library_id, start_date: date, end_date: date) -> QuerySet:
        """Öğrencinin tarih aralığındaki yoklama kayıtlarının özeti"""
        return AttendanceRecord.objects.filter(
            attendance_session__library_id=library_id,
            attendance_session__tarih__gte=start_date,
            attendance_session__tarih__lte=end_date,
            ogrenci_id=ogrenci_id
        ).select_related('attendance_session')


# ──────────────────────────────────────
# TEMPORARY SEATING REPOSITORY
# ──────────────────────────────────────

class TemporarySeatingRepository:
    """Geçici Oturma veri erişim katmanı"""

    @staticmethod
    def get_all(library_id) -> QuerySet:
        return TemporarySeating.objects.filter(
            library_id=library_id
        ).select_related('seat')

    @staticmethod
    def get_aktif(library_id) -> QuerySet:
        return TemporarySeating.objects.filter(
            library_id=library_id,
            durum=TemporarySeatingStatus.ACTIVE
        ).select_related('seat')

    @staticmethod
    def get_by_id(seating_id) -> Optional[TemporarySeating]:
        try:
            return TemporarySeating.objects.select_related('seat', 'library').get(id=seating_id)
        except TemporarySeating.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> TemporarySeating:
        return TemporarySeating.objects.create(**data)

    @staticmethod
    def count_active(library_id) -> int:
        return TemporarySeating.objects.filter(
            library_id=library_id,
            durum=TemporarySeatingStatus.ACTIVE
        ).count()

    @staticmethod
    def expire_overdue(library_id) -> int:
        """Süresi dolan geçici oturmaları EXPIRED yap"""
        now = timezone.now()
        updated = TemporarySeating.objects.filter(
            library_id=library_id,
            durum=TemporarySeatingStatus.ACTIVE,
            beklenen_bitis_zamani__lt=now
        ).update(
            durum=TemporarySeatingStatus.EXPIRED,
            gercek_bitis_zamani=now
        )
        return updated


# ──────────────────────────────────────
# AUDIT LOG REPOSITORY
# ──────────────────────────────────────

class AuditLogRepository:
    """Denetim Logu veri erişim katmanı"""

    @staticmethod
    def create(data: dict) -> LibraryAuditLog:
        return LibraryAuditLog.objects.create(**data)

    @staticmethod
    def get_by_entity(entity_type: str, entity_id) -> QuerySet:
        return LibraryAuditLog.objects.filter(
            entity_type=entity_type,
            entity_id=entity_id
        )

    @staticmethod
    def get_recent(limit: int = 20) -> QuerySet:
        return LibraryAuditLog.objects.all()[:limit]


# ──────────────────────────────────────
# ŞUBE DERS PROGRAMI REPOSITORY
# ──────────────────────────────────────

class SubeDersProgramiRepository:
    """Şube Ders Programı veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int) -> QuerySet:
        return SubeDersProgrami.objects.filter(kurum_id=kurum_id)

    @staticmethod
    def get_aktif(kurum_id: int) -> QuerySet:
        return SubeDersProgrami.objects.filter(kurum_id=kurum_id, aktif_mi=True)

    @staticmethod
    def get_by_id(program_id) -> Optional[SubeDersProgrami]:
        try:
            return SubeDersProgrami.objects.get(id=program_id)
        except SubeDersProgrami.DoesNotExist:
            return None

    @staticmethod
    def get_by_sube(sube_id: int) -> Optional[SubeDersProgrami]:
        """Şubenin aktif ders programını getirir"""
        return SubeDersProgrami.objects.filter(
            sube_id=sube_id, aktif_mi=True
        ).first()

    @staticmethod
    def get_by_sube_all(sube_id: int) -> QuerySet:
        """Şubenin tüm ders programlarını getirir"""
        return SubeDersProgrami.objects.filter(sube_id=sube_id)

    @staticmethod
    def create(data: dict) -> SubeDersProgrami:
        return SubeDersProgrami.objects.create(**data)

    @staticmethod
    def update(program_id, data: dict) -> Optional[SubeDersProgrami]:
        program = SubeDersProgramiRepository.get_by_id(program_id)
        if program:
            for key, value in data.items():
                setattr(program, key, value)
            program.save()
        return program

    @staticmethod
    def delete(program_id) -> bool:
        program = SubeDersProgramiRepository.get_by_id(program_id)
        if program:
            program.delete()
            return True
        return False

    @staticmethod
    def deactivate_others(sube_id: int, exclude_id=None):
        """Aynı şubenin diğer programlarını pasife al"""
        qs = SubeDersProgrami.objects.filter(sube_id=sube_id, aktif_mi=True)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        qs.update(aktif_mi=False)

    @staticmethod
    def get_subeler_with_program(kurum_id: int) -> list:
        """Programı olan şubeleri listeler"""
        return list(
            SubeDersProgrami.objects.filter(
                kurum_id=kurum_id, aktif_mi=True
            ).values_list('sube_id', flat=True)
        )


# ──────────────────────────────────────
# ÖĞRENCİ İZİN REPOSITORY
# ──────────────────────────────────────

class OgrenciIzinRepository:
    """Öğrenci İzin veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int) -> QuerySet:
        return OgrenciIzin.objects.filter(kurum_id=kurum_id)

    @staticmethod
    def get_aktif(kurum_id: int) -> QuerySet:
        return OgrenciIzin.objects.filter(kurum_id=kurum_id, aktif_mi=True)

    @staticmethod
    def get_by_id(izin_id) -> Optional[OgrenciIzin]:
        try:
            return OgrenciIzin.objects.get(id=izin_id)
        except OgrenciIzin.DoesNotExist:
            return None

    @staticmethod
    def get_by_ogrenci(ogrenci_id: int, aktif_only: bool = True) -> QuerySet:
        """Öğrencinin izinlerini getirir"""
        qs = OgrenciIzin.objects.filter(ogrenci_id=ogrenci_id)
        if aktif_only:
            qs = qs.filter(aktif_mi=True)
        return qs

    @staticmethod
    def get_by_ogrenci_and_day(ogrenci_id: int, gun: int, tarih: date) -> QuerySet:
        """Öğrencinin belirli bir gün için aktif izinlerini getirir"""
        return OgrenciIzin.objects.filter(
            ogrenci_id=ogrenci_id,
            gun=gun,
            aktif_mi=True,
            baslangic_tarihi__lte=tarih
        ).filter(
            Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=tarih)
        )

    @staticmethod
    def get_exempted_students_for_session(
        kurum_id: int, gun: int, periyot_kodu: str, tarih: date,
        library_id=None
    ) -> list:
        """
        Belirli bir gün ve periyotta izinli olan öğrenci ID'lerini döndürür.
        TAM_GUN izinliler de dahil edilir.
        """
        qs = OgrenciIzin.objects.filter(
            kurum_id=kurum_id,
            gun=gun,
            aktif_mi=True,
            baslangic_tarihi__lte=tarih
        ).filter(
            Q(bitis_tarihi__isnull=True) | Q(bitis_tarihi__gte=tarih)
        ).filter(
            # TAM_GUN izinli veya belirli periyotta izinli
            Q(izin_tipi='FULL_DAY') | Q(periyot_kodu=periyot_kodu)
        )

        # Salon bazlı veya genel
        if library_id:
            qs = qs.filter(Q(library_id=library_id) | Q(library__isnull=True))
        else:
            qs = qs.filter(library__isnull=True)

        return list(qs.values_list('ogrenci_id', flat=True).distinct())

    @staticmethod
    def get_by_library(library_id, aktif_only: bool = True) -> QuerySet:
        """Salona özel izinleri getirir"""
        qs = OgrenciIzin.objects.filter(library_id=library_id)
        if aktif_only:
            qs = qs.filter(aktif_mi=True)
        return qs

    @staticmethod
    def create(data: dict) -> OgrenciIzin:
        return OgrenciIzin.objects.create(**data)

    @staticmethod
    def update(izin_id, data: dict) -> Optional[OgrenciIzin]:
        izin = OgrenciIzinRepository.get_by_id(izin_id)
        if izin:
            for key, value in data.items():
                setattr(izin, key, value)
            izin.save()
        return izin

    @staticmethod
    def delete(izin_id) -> bool:
        izin = OgrenciIzinRepository.get_by_id(izin_id)
        if izin:
            izin.delete()
            return True
        return False

    @staticmethod
    def bulk_create(izinler_data: list) -> list:
        izinler = [OgrenciIzin(**data) for data in izinler_data]
        return OgrenciIzin.objects.bulk_create(izinler)

    @staticmethod
    def deactivate_by_ogrenci(ogrenci_id: int):
        """Öğrencinin tüm aktif izinlerini pasife al"""
        OgrenciIzin.objects.filter(
            ogrenci_id=ogrenci_id, aktif_mi=True
        ).update(aktif_mi=False)
