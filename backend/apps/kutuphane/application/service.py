"""
Kütüphane Service
Business logic layer following Service Pattern
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta
from django.db import transaction
from django.utils import timezone

from apps.kutuphane.infrastructure.repository import (
    LibraryRepository, SeatRepository, LockerRepository,
    SessionDefinitionRepository, SeatAssignmentRepository,
    LockerAssignmentRepository, AttendanceRepository,
    TemporarySeatingRepository,
    AuditLogRepository,
    SubeDersProgramiRepository, OgrenciIzinRepository
)
from apps.kutuphane.domain.models import (
    Library, Seat, Locker, SeatAssignment, LockerAssignment,
    AttendanceSession, AttendanceRecord, TemporarySeating,
    SubeDersProgrami, OgrenciIzin,
    SeatStatus, LockerStatus, AssignmentStatus,
    AttendanceSessionStatus, TemporarySeatingStatus,
    LibraryStatus, AuditAction, AttendanceStatus,
    AttendanceType, ExemptionType, SessionCode
)


class LibraryService:
    """Kütüphane Salonu iş mantığı"""

    def __init__(self):
        self.repo = LibraryRepository()

    def list_libraries(self, kurum_id: int, sube_id: int) -> list:
        return list(self.repo.get_with_stats(kurum_id, sube_id))

    def get_library(self, library_id) -> Optional[Library]:
        return self.repo.get_by_id(library_id)

    @transaction.atomic
    def create_library(self, kurum_id: int, sube_id: int, data: dict, user_id: int) -> Library:
        self._validate_library_data(kurum_id, sube_id, data)
        data['kurum_id'] = kurum_id
        data['sube_id'] = sube_id
        data['created_by'] = user_id
        library = self.repo.create(data)
        AuditLogRepository.create({
            'entity_type': 'Library',
            'entity_id': library.id,
            'action': AuditAction.CREATE,
            'new_values': data,
            'performed_by': user_id,
            'description': f"Kütüphane '{library.ad}' oluşturuldu"
        })
        return library

    @transaction.atomic
    def update_library(self, library_id, data: dict, user_id: int) -> Optional[Library]:
        library = self.repo.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        self._validate_library_data(library.kurum_id, library.sube_id, data, exclude_id=library_id)

        # Kapasite düşürme kontrolü
        if 'kapasite' in data:
            aktif_masa = SeatRepository.count_active(library_id)
            if data['kapasite'] < aktif_masa:
                raise ValueError(
                    f"Aktif masa sayısı ({aktif_masa}) yeni kapasiteden ({data['kapasite']}) büyük"
                )

        old_values = {
            'ad': library.ad, 'kod': library.kod,
            'durum': library.durum, 'kapasite': library.kapasite
        }

        updated = self.repo.update(library_id, data)
        AuditLogRepository.create({
            'entity_type': 'Library',
            'entity_id': library_id,
            'action': AuditAction.UPDATE,
            'old_values': old_values,
            'new_values': data,
            'performed_by': user_id,
            'description': f"Kütüphane '{library.ad}' güncellendi"
        })
        return updated

    @transaction.atomic
    def delete_library(self, library_id, user_id: int) -> bool:
        library = self.repo.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        # Bağımlılık kontrolü
        aktif_masa_atama = SeatAssignmentRepository.count_active(library_id)
        if aktif_masa_atama > 0:
            raise ValueError(f"{aktif_masa_atama} aktif masa ataması var, silinemez")

        aktif_dolap_atama = LockerAssignmentRepository.count_active(library_id)
        if aktif_dolap_atama > 0:
            raise ValueError(f"{aktif_dolap_atama} aktif dolap ataması var, silinemez")

        open_sessions = AttendanceRepository.get_open_sessions(library_id)
        if open_sessions.exists():
            raise ValueError("Devam eden yoklama oturumu var, silinemez")

        result = self.repo.soft_delete(library_id)
        AuditLogRepository.create({
            'entity_type': 'Library',
            'entity_id': library_id,
            'action': AuditAction.DELETE,
            'performed_by': user_id,
            'description': f"Kütüphane '{library.ad}' silindi"
        })
        return result

    @transaction.atomic
    def change_status(self, library_id, new_status: str, user_id: int) -> Library:
        library = self.repo.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        old_status = library.durum

        # ACTIVE → INACTIVE ise açık oturum kontrolü
        if new_status == LibraryStatus.INACTIVE:
            open_sessions = AttendanceRepository.get_open_sessions(library_id)
            if open_sessions.exists():
                raise ValueError("Aktif yoklama oturumu var, pasife alınamaz")

        updated = self.repo.update(library_id, {'durum': new_status})
        AuditLogRepository.create({
            'entity_type': 'Library',
            'entity_id': library_id,
            'action': AuditAction.STATUS_CHANGE,
            'old_values': {'durum': old_status},
            'new_values': {'durum': new_status},
            'performed_by': user_id,
            'description': f"Durum değişikliği: {old_status} → {new_status}"
        })
        return updated

    def get_dashboard_stats(self, kurum_id: int, sube_id: int) -> dict:
        """Dashboard KPI verileri"""
        libraries = self.repo.get_with_stats(kurum_id, sube_id)
        toplam_salon = libraries.count()
        aktif_salon = libraries.filter(durum='ACTIVE').count()
        toplam_masa = sum(getattr(l, 'toplam_masa', 0) for l in libraries)
        dolu_masa = sum(getattr(l, 'dolu_masa', 0) for l in libraries)
        aktif_atama_toplam = sum(getattr(l, 'aktif_atama', 0) for l in libraries)
        doluluk = round((dolu_masa / toplam_masa * 100), 1) if toplam_masa > 0 else 0

        # Dolap istatistikleri (şube bazlı)
        toplam_dolap = Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
        ).count()
        dolu_dolap = Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
            durum=LockerStatus.ASSIGNED,
        ).count()
        musait_dolap = Locker.objects.filter(
            kurum_id=kurum_id, sube_id=sube_id, is_deleted=False,
            durum=LockerStatus.AVAILABLE,
        ).count()

        gecici_oturma = TemporarySeating.objects.filter(
            library__kurum_id=kurum_id,
            library__sube_id=sube_id,
            library__is_deleted=False,
            durum=TemporarySeatingStatus.ACTIVE
        ).count()

        toplam_kapasite = sum(l.kapasite for l in libraries)

        return {
            'toplam_salon': toplam_salon,
            'aktif_salon': aktif_salon,
            'toplam_masa': toplam_masa,
            'dolu_masa': dolu_masa,
            'toplam_dolap': toplam_dolap,
            'dolu_dolap': dolu_dolap,
            'musait_dolap': musait_dolap,
            'gecici_oturma': gecici_oturma,
            'doluluk_orani': doluluk,
            'aktif_atama': aktif_atama_toplam,
            'toplam_kapasite': toplam_kapasite,
            'salonlar': [
                {
                    'id': str(l.id),
                    'ad': l.ad,
                    'kod': l.kod,
                    'durum': l.durum,
                    'kapasite': l.kapasite,
                    'toplam_masa': getattr(l, 'toplam_masa', 0),
                    'aktif_masa': getattr(l, 'toplam_masa', 0) - getattr(l, 'arizali_masa', 0),
                    'aktif_atama': getattr(l, 'aktif_atama', 0),
                    'dolu_masa': getattr(l, 'dolu_masa', 0),
                    'bos_masa': getattr(l, 'bos_masa', 0),
                    'doluluk_orani': round(
                        (getattr(l, 'aktif_atama', 0) / max(getattr(l, 'toplam_masa', 0), 1) * 100), 1
                    ) if getattr(l, 'toplam_masa', 0) > 0 else 0,
                }
                for l in libraries
            ]
        }

    def _validate_library_data(self, kurum_id: int, sube_id: int, data: dict, exclude_id=None):
        if 'ad' in data and not data['ad'].strip():
            raise ValueError("Salon adı boş olamaz")
        if 'kod' in data and not data['kod'].strip():
            raise ValueError("Salon kodu boş olamaz")
        if 'kapasite' in data and data['kapasite'] < 1:
            raise ValueError("Kapasite en az 1 olmalıdır")

        if 'kod' in data:
            if self.repo.exists_by_kod(kurum_id, sube_id, data['kod'], exclude_id):
                raise ValueError(f"Bu salon kodu zaten kullanılıyor: {data['kod']}")
        if 'ad' in data:
            if self.repo.exists_by_ad(kurum_id, sube_id, data['ad'], exclude_id):
                raise ValueError(f"Bu salon adı zaten kullanılıyor: {data['ad']}")

        if 'dolap_var_mi' in data and data['dolap_var_mi']:
            dolap_sayisi = data.get('dolap_sayisi', 0)
            if dolap_sayisi < 1:
                raise ValueError("Dolap alanı açıksa dolap sayısı belirtilmelidir")

        # Çalışma saatleri validasyonu
        if 'calisma_saatleri' in data and data['calisma_saatleri']:
            hours = data['calisma_saatleri']
            has_open_day = False
            for day, info in hours.items():
                if info.get('is_open'):
                    has_open_day = True
                    if info.get('close') and info.get('open'):
                        if info['close'] <= info['open']:
                            raise ValueError(f"{day}: Kapanış saati açılıştan sonra olmalıdır")
            if not has_open_day:
                raise ValueError("En az bir gün açık olmalıdır")


class SeatService:
    """Masa iş mantığı"""

    def __init__(self):
        self.repo = SeatRepository()

    def list_seats(self, library_id) -> list:
        return list(self.repo.get_with_assignments(library_id))

    def get_seat(self, seat_id) -> Optional[Seat]:
        return self.repo.get_by_id(seat_id)

    @transaction.atomic
    def create_seat(self, library_id, data: dict, user_id: int) -> Seat:
        library = LibraryRepository.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")
        if library.durum == LibraryStatus.INACTIVE:
            raise ValueError("Kütüphane aktif değil, masa eklenemez")

        # Kapasite kontrolü
        current_count = self.repo.count_active(library_id)
        if current_count >= library.kapasite:
            raise ValueError(f"Kapasite dolu ({current_count}/{library.kapasite})")

        # Numara benzersizlik
        if self.repo.exists_by_no(library_id, data.get('masa_no', '')):
            raise ValueError(f"Bu masa numarası zaten mevcut: {data['masa_no']}")

        data['library_id'] = library_id
        seat = self.repo.create(data)
        AuditLogRepository.create({
            'entity_type': 'Seat',
            'entity_id': seat.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Masa {seat.masa_no} oluşturuldu"
        })
        return seat

    @transaction.atomic
    def bulk_create_seats(self, library_id, prefix: str, start: int, count: int,
                          defaults: dict, user_id: int) -> dict:
        library = LibraryRepository.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        current_count = self.repo.count_active(library_id)
        remaining = library.kapasite - current_count
        if count > remaining:
            raise ValueError(f"Kapasite aşılıyor. Maks {remaining} masa eklenebilir")

        created = []
        skipped = []
        for i in range(count):
            no = f"{prefix}{start + i:02d}"
            if self.repo.exists_by_no(library_id, no):
                skipped.append(no)
                continue
            seat_data = {**defaults, 'library_id': library_id, 'masa_no': no}
            created.append(seat_data)

        if created:
            seats = self.repo.bulk_create(created)
            AuditLogRepository.create({
                'entity_type': 'Seat',
                'entity_id': library_id,
                'action': AuditAction.CREATE,
                'performed_by': user_id,
                'description': f"{len(seats)} masa toplu oluşturuldu"
            })

        return {
            'created_count': len(created),
            'skipped_count': len(skipped),
            'skipped_numbers': skipped
        }

    @transaction.atomic
    def update_seat(self, seat_id, data: dict, user_id: int) -> Optional[Seat]:
        seat = self.repo.get_by_id(seat_id)
        if not seat:
            raise ValueError("Masa bulunamadı")

        if 'masa_no' in data and data['masa_no'] != seat.masa_no:
            if self.repo.exists_by_no(seat.library_id, data['masa_no'], exclude_id=seat_id):
                raise ValueError(f"Bu masa numarası zaten mevcut: {data['masa_no']}")

        updated = self.repo.update(seat_id, data)
        AuditLogRepository.create({
            'entity_type': 'Seat',
            'entity_id': seat_id,
            'action': AuditAction.UPDATE,
            'performed_by': user_id,
            'description': f"Masa {seat.masa_no} güncellendi"
        })
        return updated

    @transaction.atomic
    def change_seat_status(self, seat_id, new_status: str, user_id: int) -> Seat:
        seat = self.repo.get_by_id(seat_id)
        if not seat:
            raise ValueError("Masa bulunamadı")

        old_status = seat.durum
        # OUT_OF_SERVICE yaparken aktif atama kontrolü
        if new_status == SeatStatus.OUT_OF_SERVICE:
            if SeatAssignmentRepository.has_active_for_seat(seat_id):
                raise ValueError("Bu masada aktif atama var, önce yer değiştirme yapılmalı")

        updated = self.repo.update(seat_id, {'durum': new_status})
        AuditLogRepository.create({
            'entity_type': 'Seat',
            'entity_id': seat_id,
            'action': AuditAction.STATUS_CHANGE,
            'old_values': {'durum': old_status},
            'new_values': {'durum': new_status},
            'performed_by': user_id,
            'description': f"Masa {seat.masa_no} durumu: {old_status} → {new_status}"
        })
        return updated

    @transaction.atomic
    def delete_seat(self, seat_id, user_id: int) -> bool:
        seat = self.repo.get_by_id(seat_id)
        if not seat:
            raise ValueError("Masa bulunamadı")
        if SeatAssignmentRepository.has_active_for_seat(seat_id):
            raise ValueError("Aktif atama var, silinemez")

        result = self.repo.soft_delete(seat_id)
        AuditLogRepository.create({
            'entity_type': 'Seat',
            'entity_id': seat_id,
            'action': AuditAction.DELETE,
            'performed_by': user_id,
            'description': f"Masa {seat.masa_no} silindi"
        })
        return result


class LockerService:
    """Dolap iş mantığı — Kurum bazlı"""

    def __init__(self):
        self.repo = LockerRepository()

    def list_lockers(self, kurum_id: int, sube_id: int) -> list:
        return list(self.repo.get_all(kurum_id, sube_id))

    def get_locker(self, locker_id) -> Optional[Locker]:
        return self.repo.get_by_id(locker_id)

    @transaction.atomic
    def create_locker(self, kurum_id: int, sube_id: int, data: dict, user_id: int) -> Locker:
        data['kurum_id'] = kurum_id
        data['sube_id'] = sube_id
        locker = self.repo.create(data)
        AuditLogRepository.create({
            'entity_type': 'Locker',
            'entity_id': locker.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Dolap {locker.dolap_no} oluşturuldu"
        })
        return locker

    @transaction.atomic
    def delete_locker(self, locker_id, user_id: int) -> bool:
        locker = self.repo.get_by_id(locker_id)
        if not locker:
            raise ValueError("Dolap bulunamadı")
        if LockerAssignmentRepository.has_active_for_locker(locker_id):
            raise ValueError("Aktif dolap ataması var, silinemez")

        result = self.repo.soft_delete(locker_id)
        AuditLogRepository.create({
            'entity_type': 'Locker',
            'entity_id': locker_id,
            'action': AuditAction.DELETE,
            'performed_by': user_id,
            'description': f"Dolap {locker.dolap_no} silindi"
        })
        return result


class AssignmentService:
    """Masa & Dolap Atama iş mantığı"""

    @transaction.atomic
    def create_seat_assignment(self, data: dict, user_id: int) -> SeatAssignment:
        seat = SeatRepository.get_by_id(data['seat_id'])
        if not seat:
            raise ValueError("Masa bulunamadı")
        if seat.durum != SeatStatus.AVAILABLE:
            raise ValueError(f"Masa müsait değil (durum: {seat.get_durum_display()})")

        # Aynı masada aktif atama kontrolü
        if SeatAssignmentRepository.has_active_for_seat(data['seat_id']):
            raise ValueError("Bu masada zaten aktif bir atama var")

        # Öğrenci tekrar atama kontrolü — tüm salonlarda (öğrenci yalnızca 1 masa atanabilir)
        existing = SeatAssignmentRepository.get_active_by_student(
            data['ogrenci_id']
        )
        if existing:
            salon_adi = existing.library.ad if existing.library else ''
            raise ValueError(f"Bu öğrencinin zaten aktif masa ataması var: {salon_adi} — Masa {existing.seat.masa_no}")

        data['atayan_id'] = user_id
        assignment = SeatAssignmentRepository.create(data)

        # Masa durumunu OCCUPIED yap
        SeatRepository.update(data['seat_id'], {'durum': SeatStatus.OCCUPIED})

        AuditLogRepository.create({
            'entity_type': 'SeatAssignment',
            'entity_id': assignment.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Masa {seat.masa_no} → Öğrenci #{data['ogrenci_id']} atandı"
        })
        return assignment

    @transaction.atomic
    def end_seat_assignment(self, assignment_id, reason: str, user_id: int) -> SeatAssignment:
        assignment = SeatAssignmentRepository.get_by_id(assignment_id)
        if not assignment:
            raise ValueError("Atama bulunamadı")
        if assignment.durum != AssignmentStatus.ACTIVE:
            raise ValueError("Bu atama zaten sona ermiş")

        now = timezone.now()
        SeatAssignmentRepository.update(assignment_id, {
            'durum': AssignmentStatus.ENDED,
            'sonlandiran_id': user_id,
            'sonlanma_tarihi': now,
            'sonlanma_sebebi': reason
        })

        # Masa durumunu AVAILABLE yap
        SeatRepository.update(assignment.seat_id, {'durum': SeatStatus.AVAILABLE})

        AuditLogRepository.create({
            'entity_type': 'SeatAssignment',
            'entity_id': assignment_id,
            'action': AuditAction.STATUS_CHANGE,
            'performed_by': user_id,
            'description': f"Masa {assignment.seat.masa_no} ataması sonlandırıldı: {reason}"
        })
        assignment.refresh_from_db()
        return assignment

    @transaction.atomic
    def create_locker_assignment(self, data: dict, user_id: int) -> LockerAssignment:
        locker = LockerRepository.get_by_id(data['locker_id'])
        if not locker:
            raise ValueError("Dolap bulunamadı")
        if locker.durum != LockerStatus.AVAILABLE:
            raise ValueError(f"Dolap müsait değil (durum: {locker.get_durum_display()})")

        if LockerAssignmentRepository.has_active_for_locker(data['locker_id']):
            raise ValueError("Bu dolapta zaten aktif bir atama var")

        # Öğrenci tekrar atama kontrolü — her öğrenci yalnızca 1 dolap atanabilir
        existing_locker = LockerAssignmentRepository.get_active_by_student(data['ogrenci_id'])
        if existing_locker:
            raise ValueError(f"Bu öğrencinin zaten aktif dolap ataması var: Dolap {existing_locker.locker.dolap_no}")

        data['kurum_id'] = locker.kurum_id
        data['atayan_id'] = user_id
        assignment = LockerAssignmentRepository.create(data)

        LockerRepository.update(data['locker_id'], {'durum': LockerStatus.ASSIGNED})

        AuditLogRepository.create({
            'entity_type': 'LockerAssignment',
            'entity_id': assignment.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Dolap {locker.dolap_no} → Öğrenci #{data['ogrenci_id']} atandı"
        })
        return assignment

    @transaction.atomic
    def end_locker_assignment(self, assignment_id, user_id: int) -> LockerAssignment:
        assignment = LockerAssignmentRepository.get_by_id(assignment_id)
        if not assignment:
            raise ValueError("Atama bulunamadı")
        if assignment.durum != AssignmentStatus.ACTIVE:
            raise ValueError("Bu atama zaten sona ermiş")

        # Depozit iade uyarısı
        warnings = []
        if assignment.depozit_odendi > 0 and not assignment.depozit_iade_edildi:
            warnings.append("Depozit henüz iade edilmedi")

        LockerAssignmentRepository.update(assignment_id, {
            'durum': AssignmentStatus.ENDED,
        })
        LockerRepository.update(assignment.locker_id, {'durum': LockerStatus.AVAILABLE})

        AuditLogRepository.create({
            'entity_type': 'LockerAssignment',
            'entity_id': assignment_id,
            'action': AuditAction.STATUS_CHANGE,
            'performed_by': user_id,
            'description': f"Dolap {assignment.locker.dolap_no} ataması sonlandırıldı"
        })
        assignment.refresh_from_db()
        return assignment


class AttendanceService:
    """Yoklama iş mantığı"""

    @transaction.atomic
    def open_session(self, library_id, periyot_kodu: str, tarih: date, user_id: int,
                     yoklama_tipi: str = 'PERIOD', ders_no: int = None,
                     sube_ders_programi_id=None):
        """
        Yoklama oturumu aç.
        periyot_kodu: 'MORNING', 'AFTERNOON', 'EVENING' vb.
        yoklama_tipi: 'PERIOD' veya 'LESSON'
        ders_no: Ders bazlı yoklama ise ders numarası
        """
        # Çift oturum kontrolü
        if yoklama_tipi == 'PERIOD':
            if AttendanceRepository.session_exists(library_id, periyot_kodu, tarih):
                raise ValueError("Bu tarih ve periyot için zaten yoklama var")
        else:
            if ders_no is None:
                raise ValueError("Ders bazlı yoklama için ders numarası gereklidir")
            if AttendanceRepository.session_exists(library_id, periyot_kodu, tarih, ders_no):
                raise ValueError(f"Bu tarih, periyot ve {ders_no}. ders için zaten yoklama var")

        session_data = {
            'library_id': library_id,
            'periyot_kodu': periyot_kodu,
            'tarih': tarih,
            'acan_id': user_id,
            'yoklama_tipi': yoklama_tipi,
        }
        if yoklama_tipi == 'LESSON':
            session_data['ders_no'] = ders_no
        if sube_ders_programi_id:
            session_data['sube_ders_programi_id'] = sube_ders_programi_id

        session = AttendanceRepository.create_session(session_data)

        # ─── Otomatik yoklama kayıtları oluştur ───
        # Bu salondaki aktif masa atamalarına sahip tüm öğrenciler için
        # varsayılan ABSENT durumunda yoklama kaydı oluştur
        aktif_atamalar = SeatAssignment.objects.filter(
            library_id=library_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('seat')

        # İzinli öğrenci listesini al
        library = session.library
        gun = tarih.weekday()
        izinli_ogrenciler = set()
        try:
            izinli_ogrenciler = set(
                OgrenciIzinRepository.get_exempted_students_for_session(
                    kurum_id=library.kurum_id,
                    gun=gun,
                    periyot_kodu=periyot_kodu,
                    tarih=tarih,
                    library_id=library_id
                )
            )
        except Exception:
            pass

        records_data = []
        for atama in aktif_atamalar:
            is_izinli = atama.ogrenci_id in izinli_ogrenciler
            records_data.append({
                'attendance_session_id': session.id,
                'ogrenci_id': atama.ogrenci_id,
                'seat_id': atama.seat_id,
                'durum': AttendanceStatus.EXCUSED if is_izinli else AttendanceStatus.PRESENT,
                'izinli_mi': is_izinli,
                'kaydeden_id': user_id,
            })

        if records_data:
            AttendanceRepository.bulk_create_records(records_data)

        PERIYOT_LABELS = {'MORNING': 'Sabah', 'AFTERNOON': 'Öğle', 'EVENING': 'Akşam', 'CUSTOM': 'Özel'}
        periyot_adi = PERIYOT_LABELS.get(periyot_kodu, periyot_kodu)
        AuditLogRepository.create({
            'entity_type': 'AttendanceSession',
            'entity_id': session.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Yoklama oturumu açıldı: {tarih} - {periyot_adi} "
                          f"{'Periyot' if yoklama_tipi == 'PERIOD' else f'{ders_no}. Ders'}"
                          f" ({len(records_data)} öğrenci)"
        })
        return session

    @transaction.atomic
    def open_all_lesson_sessions(self, library_id, periyot_kodu: str, tarih: date,
                                  sube_id: int, user_id: int) -> list:
        """
        Bir periyodun tüm dersleri için yoklama oturumlarını toplu aç.
        Şubenin ders programından ders sayısını alır.
        """
        # Ders programını al
        program = SubeDersProgramiRepository.get_by_sube(sube_id)
        if not program:
            raise ValueError(f"Şube #{sube_id} için aktif ders programı bulunamadı")

        period_data = program.ders_saatleri.get(periyot_kodu, {})
        ders_sayisi = period_data.get('ders_sayisi', 0)

        if ders_sayisi == 0:
            raise ValueError(f"Bu periyot ({periyot_kodu}) için ders tanımı bulunamadı")

        sessions = []
        for ders in range(1, ders_sayisi + 1):
            if not AttendanceRepository.session_exists(
                library_id, periyot_kodu, tarih, ders
            ):
                session = self.open_session(
                    library_id=library_id,
                    periyot_kodu=periyot_kodu,
                    tarih=tarih,
                    user_id=user_id,
                    yoklama_tipi='LESSON',
                    ders_no=ders,
                    sube_ders_programi_id=str(program.id)
                )
                sessions.append(session)

        return sessions

    @transaction.atomic
    def close_session(self, session_id, user_id: int):
        session = AttendanceRepository.get_session_by_id(session_id)
        if not session:
            raise ValueError("Yoklama oturumu bulunamadı")
        if session.durum != AttendanceSessionStatus.OPEN:
            raise ValueError("Bu oturum zaten kapalı")

        session.durum = AttendanceSessionStatus.CLOSED
        session.kapatan_id = user_id
        session.kapanis_zamani = timezone.now()
        session.save()
        return session

    @transaction.atomic
    def reopen_session(self, session_id, user_id: int):
        """Kapalı yoklama oturumunu tekrar aç."""
        session = AttendanceRepository.get_session_by_id(session_id)
        if not session:
            raise ValueError("Yoklama oturumu bulunamadı")
        if session.durum != AttendanceSessionStatus.CLOSED:
            raise ValueError("Sadece kapalı oturumlar tekrar açılabilir")

        session.durum = AttendanceSessionStatus.OPEN
        session.kapatan_id = None
        session.kapanis_zamani = None
        session.save()

        AuditLogRepository.create({
            'entity_type': 'AttendanceSession',
            'entity_id': session.id,
            'action': AuditAction.UPDATE,
            'performed_by': user_id,
            'description': f"Yoklama oturumu tekrar açıldı: {session.tarih}"
        })
        return session

    @transaction.atomic
    def record_attendance(self, session_id, records: list, user_id: int):
        """Toplu yoklama kaydet — izinli öğrencileri otomatik EXCUSED yapar"""
        session = AttendanceRepository.get_session_by_id(session_id)
        if not session:
            raise ValueError("Yoklama oturumu bulunamadı")
        if session.durum != AttendanceSessionStatus.OPEN:
            raise ValueError("Bu oturum kapalı, kayıt eklenemez")

        # user_id None ise oturumu açan kişiyi kullan
        effective_user_id = user_id or session.acan_id

        # İzinli öğrenci listesini al
        library = session.library
        kurum_id = library.kurum_id
        periyot_kodu = session.periyot_kodu
        gun = session.tarih.weekday()

        izinli_ogrenciler = set()
        if periyot_kodu:
            izinli_ogrenciler = set(
                OgrenciIzinRepository.get_exempted_students_for_session(
                    kurum_id=library.kurum_id,
                    gun=gun,
                    periyot_kodu=periyot_kodu,
                    tarih=session.tarih,
                    library_id=library.id
                )
            )

        # Mevcut kayıtları snapshot (bildirim değişiklik tespiti)
        old_records = {
            r.ogrenci_id: r
            for r in AttendanceRecord.objects.filter(attendance_session_id=session_id)
        }

        # Mevcut kayıtları güncelle veya yeni oluştur
        saved_count = 0
        for record_data in records:
            record_data['kaydeden_id'] = effective_user_id

            # giris_saati string ise time objesine çevir
            gs = record_data.get('giris_saati')
            if gs and isinstance(gs, str):
                try:
                    from datetime import time as dt_time
                    parts = gs.strip().split(':')
                    record_data['giris_saati'] = dt_time(int(parts[0]), int(parts[1]))
                except (ValueError, IndexError):
                    record_data['giris_saati'] = None
            elif gs == '' or gs is None:
                record_data['giris_saati'] = None

            cs = record_data.get('cikis_saati')
            if cs and isinstance(cs, str):
                try:
                    from datetime import time as dt_time
                    parts = cs.strip().split(':')
                    record_data['cikis_saati'] = dt_time(int(parts[0]), int(parts[1]))
                except (ValueError, IndexError):
                    record_data['cikis_saati'] = None
            elif cs == '' or cs is None:
                record_data['cikis_saati'] = None

            # İzinli öğrenciyi otomatik EXCUSED yap
            ogrenci_id = record_data['ogrenci_id']
            if ogrenci_id in izinli_ogrenciler:
                record_data['durum'] = AttendanceStatus.EXCUSED
                record_data['izinli_mi'] = True

            existing = AttendanceRecord.objects.filter(
                attendance_session_id=session_id,
                ogrenci_id=ogrenci_id
            ).first()
            if existing:
                for key, value in record_data.items():
                    setattr(existing, key, value)
                existing.save()
                saved_count += 1
            else:
                record_data['attendance_session_id'] = session_id
                AttendanceRepository.create_record(record_data)
                saved_count += 1

        saved_records = list(AttendanceRecord.objects.filter(attendance_session_id=session_id))
        pending_notifications = []
        try:
            from apps.kutuphane.application.notification_service import AttendanceNotificationService

            pending_notifications = AttendanceNotificationService().detect_pending_after_save(
                session_id,
                old_records,
                saved_records,
            )
        except Exception:
            import logging
            logging.getLogger('kutuphane.notification').exception(
                'Yoklama bildirim tespiti başarısız session=%s', session_id,
            )

        try:
            from apps.gorev.application.rule_engine import hook_attendance_absent
            for rec in saved_records:
                if rec.durum == 'ABSENT':
                    hook_attendance_absent(rec, kurum_id)
        except Exception:
            import logging
            logging.getLogger('gorev.rule_engine').exception(
                'Devamsızlık görev hook hatası session=%s', session_id,
            )

        return {
            'records': AttendanceRepository.get_records(session_id),
            'saved': saved_count,
            'pending_notifications': pending_notifications,
        }

    def get_session_detail(self, session_id) -> dict:
        session = AttendanceRepository.get_session_by_id(session_id)
        if not session:
            return None
        records = AttendanceRepository.get_records(session_id)

        # Eğer session OPEN ise ve hiç kayıt yoksa, aktif atamalardan oluştur
        if session.durum == AttendanceSessionStatus.OPEN and not records.exists():
            aktif_atamalar = SeatAssignment.objects.filter(
                library_id=session.library_id,
                durum=AssignmentStatus.ACTIVE
            ).select_related('seat')

            # İzinli öğrenci listesini al
            izinli_ogrenciler = set()
            try:
                izinli_ogrenciler = set(
                    OgrenciIzinRepository.get_exempted_students_for_session(
                        kurum_id=session.library.kurum_id,
                        gun=session.tarih.weekday(),
                        periyot_kodu=session.periyot_kodu,
                        tarih=session.tarih,
                        library_id=session.library_id
                    )
                )
            except Exception:
                pass

            records_data = []
            for atama in aktif_atamalar:
                is_izinli = atama.ogrenci_id in izinli_ogrenciler
                records_data.append({
                    'attendance_session_id': session.id,
                    'ogrenci_id': atama.ogrenci_id,
                    'seat_id': atama.seat_id,
                    'durum': AttendanceStatus.EXCUSED if is_izinli else AttendanceStatus.ABSENT,
                    'izinli_mi': is_izinli,
                    'kaydeden_id': session.acan_id,
                })

            if records_data:
                AttendanceRepository.bulk_create_records(records_data)
                records = AttendanceRepository.get_records(session_id)

        return {
            'session': session,
            'records': records
        }

    def get_attendance_sheet_data(self, library_id, tarih: date, periyot_kodu=None) -> dict:
        """
        Yoklama kağıdı verisi — PDF export için.
        Ders bazlı sütunlu format.
        """
        library = LibraryRepository.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        # Aktif masa atamalı öğrencileri getir
        aktif_atamalar = SeatAssignment.objects.filter(
            library_id=library_id,
            durum=AssignmentStatus.ACTIVE
        ).select_related('seat').order_by('seat__masa_no')

        if not aktif_atamalar.exists():
            return {'library': library, 'tarih': tarih, 'students': [], 'sessions': []}

        # Yoklama oturumlarını getir
        session_filter = {'library_id': library_id, 'tarih': tarih}
        if periyot_kodu:
            session_filter['periyot_kodu'] = periyot_kodu

        sessions = AttendanceSession.objects.filter(
            **session_filter
        ).order_by(
            'periyot_kodu', 'ders_no'
        )

        # Her öğrenci için yoklama verilerini derle
        students = []
        for atama in aktif_atamalar:
            ogrenci_data = {
                'ogrenci_id': atama.ogrenci_id,
                'ogrenci_adi': self._get_ogrenci_adi(atama.ogrenci_id),
                'masa_no': atama.seat.masa_no,
                'yoklamalar': {}
            }

            for session in sessions:
                record = AttendanceRecord.objects.filter(
                    attendance_session=session,
                    ogrenci_id=atama.ogrenci_id
                ).first()

                # session ID'yi anahtar olarak kullan (frontend column.id ile eşleşmeli)
                key = str(session.id)

                ogrenci_data['yoklamalar'][key] = {
                    'durum': record.durum if record else None,
                    'izinli_mi': record.izinli_mi if record else False,
                    'giris_saati': str(record.giris_saati) if record and record.giris_saati else None,
                }

            students.append(ogrenci_data)

        return {
            'library': library,
            'tarih': tarih,
            'students': students,
            'sessions': list(sessions),
        }

    def _get_ogrenci_adi(self, ogrenci_id):
        try:
            from apps.ogrenci.domain.models import Ogrenci
            o = Ogrenci.objects.filter(id=ogrenci_id).values('ad', 'soyad').first()
            if o:
                return f"{o['ad'].strip()} {o['soyad'].strip()}"
        except Exception:
            pass
        return f"Öğrenci #{ogrenci_id}"


class SubeDersProgramiService:
    """Şube Ders Programı iş mantığı"""

    def __init__(self):
        self.repo = SubeDersProgramiRepository()

    def get_program_by_sube(self, sube_id: int) -> Optional[SubeDersProgrami]:
        return self.repo.get_by_sube(sube_id)

    def list_programs(self, kurum_id: int) -> list:
        return list(self.repo.get_aktif(kurum_id))

    def list_all_programs(self, kurum_id: int) -> list:
        return list(self.repo.get_all(kurum_id))

    @transaction.atomic
    def create_program(self, data: dict, user_id: int) -> SubeDersProgrami:
        """Yeni ders programı oluşturur. Aynı şubenin diğer programlarını pasife alır."""
        self._validate_program(data)

        # Mevcut aktif programı pasife al
        if data.get('aktif_mi', True):
            self.repo.deactivate_others(data['sube_id'])

        program = self.repo.create(data)

        AuditLogRepository.create({
            'entity_type': 'SubeDersProgrami',
            'entity_id': program.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Ders programı oluşturuldu: Şube #{data['sube_id']}"
        })
        return program

    @transaction.atomic
    def update_program(self, program_id, data: dict, user_id: int) -> Optional[SubeDersProgrami]:
        program = self.repo.get_by_id(program_id)
        if not program:
            raise ValueError("Ders programı bulunamadı")

        self._validate_program(data, is_update=True)

        # Aktife alınıyorsa diğerlerini pasife al
        if data.get('aktif_mi', False) and not program.aktif_mi:
            self.repo.deactivate_others(program.sube_id, exclude_id=program_id)

        updated = self.repo.update(program_id, data)

        AuditLogRepository.create({
            'entity_type': 'SubeDersProgrami',
            'entity_id': program_id,
            'action': AuditAction.UPDATE,
            'performed_by': user_id,
            'description': f"Ders programı güncellendi: Şube #{program.sube_id}"
        })
        return updated

    @transaction.atomic
    def delete_program(self, program_id, user_id: int) -> bool:
        program = self.repo.get_by_id(program_id)
        if not program:
            raise ValueError("Ders programı bulunamadı")

        # Bağlı yoklama oturumu kontrolü
        has_sessions = AttendanceSession.objects.filter(
            sube_ders_programi_id=program_id
        ).exists()
        if has_sessions:
            raise ValueError("Bu programa bağlı yoklama oturumları var, silinemez")

        result = self.repo.delete(program_id)

        AuditLogRepository.create({
            'entity_type': 'SubeDersProgrami',
            'entity_id': program_id,
            'action': AuditAction.DELETE,
            'performed_by': user_id,
            'description': f"Ders programı silindi: Şube #{program.sube_id}"
        })
        return result

    def _validate_program(self, data: dict, is_update: bool = False):
        """Ders programı validasyonu"""
        ders_saatleri = data.get('ders_saatleri', {})

        if not is_update and not ders_saatleri:
            raise ValueError("En az bir periyot tanımlanmalıdır")

        for period_code, period_data in ders_saatleri.items():
            if period_code not in ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM']:
                raise ValueError(f"Geçersiz periyot kodu: {period_code}")

            ders_sayisi = period_data.get('ders_sayisi', 0)
            if ders_sayisi < 1:
                raise ValueError(f"{period_code}: En az 1 ders tanımlanmalıdır")

            dersler = period_data.get('dersler', [])
            if len(dersler) != ders_sayisi:
                raise ValueError(
                    f"{period_code}: Ders sayısı ({ders_sayisi}) ile "
                    f"ders tanımı sayısı ({len(dersler)}) uyuşmuyor"
                )

            # Ders saatleri sıralama kontrolü
            for i, ders in enumerate(dersler):
                if not ders.get('baslangic') or not ders.get('bitis'):
                    raise ValueError(f"{period_code}: {i+1}. ders için saat tanımı eksik")

                if ders['bitis'] <= ders['baslangic']:
                    raise ValueError(
                        f"{period_code}: {ders.get('ders_no', i+1)}. dersin bitiş saati "
                        f"başlangıçtan sonra olmalıdır"
                    )

        gun_bazli = data.get('gun_bazli_aktiflik', {})
        for gun_str, gun_info in gun_bazli.items():
            if not gun_str.isdigit() or int(gun_str) not in range(7):
                raise ValueError(f"Geçersiz gün: {gun_str} (0-6 arası olmalı)")


class OgrenciIzinService:
    """Öğrenci İzin iş mantığı"""

    def __init__(self):
        self.repo = OgrenciIzinRepository()

    def list_izinler(self, kurum_id: int, ogrenci_id: int = None, library_id=None) -> list:
        """İzinleri listeler"""
        if ogrenci_id:
            return list(self.repo.get_by_ogrenci(ogrenci_id))
        if library_id:
            return list(self.repo.get_by_library(library_id))
        return list(self.repo.get_aktif(kurum_id))

    def get_izin(self, izin_id) -> Optional[OgrenciIzin]:
        return self.repo.get_by_id(izin_id)

    @transaction.atomic
    def create_izin(self, data: dict, user_id: int) -> OgrenciIzin:
        """Yeni izin oluşturur"""
        self._validate_izin(data)

        # Çakışma kontrolü
        existing = self._check_conflict(data)
        if existing:
            raise ValueError(
                f"Bu öğrenci için aynı gün ve periyotta zaten izin var"
            )

        data['olusturan_id'] = user_id
        izin = self.repo.create(data)

        AuditLogRepository.create({
            'entity_type': 'OgrenciIzin',
            'entity_id': izin.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': (
                f"İzin oluşturuldu: Öğrenci #{data['ogrenci_id']} - "
                f"Gün: {izin.get_gun_display()}"
            )
        })
        return izin

    @transaction.atomic
    def bulk_create_izinler(self, izinler_data: list, user_id: int) -> list:
        """Toplu izin oluşturur — bir öğrencinin tüm haftalık izinlerini tek seferde"""
        for data in izinler_data:
            self._validate_izin(data)
            data['olusturan_id'] = user_id

        izinler = self.repo.bulk_create(izinler_data)

        AuditLogRepository.create({
            'entity_type': 'OgrenciIzin',
            'entity_id': izinler[0].id if izinler else None,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"{len(izinler)} izin toplu oluşturuldu"
        })
        return izinler

    @transaction.atomic
    def update_izin(self, izin_id, data: dict, user_id: int) -> Optional[OgrenciIzin]:
        izin = self.repo.get_by_id(izin_id)
        if not izin:
            raise ValueError("İzin bulunamadı")

        updated = self.repo.update(izin_id, data)

        AuditLogRepository.create({
            'entity_type': 'OgrenciIzin',
            'entity_id': izin_id,
            'action': AuditAction.UPDATE,
            'performed_by': user_id,
            'description': f"İzin güncellendi: Öğrenci #{izin.ogrenci_id}"
        })
        return updated

    @transaction.atomic
    def delete_izin(self, izin_id, user_id: int) -> bool:
        izin = self.repo.get_by_id(izin_id)
        if not izin:
            raise ValueError("İzin bulunamadı")

        result = self.repo.delete(izin_id)

        AuditLogRepository.create({
            'entity_type': 'OgrenciIzin',
            'entity_id': izin_id,
            'action': AuditAction.DELETE,
            'performed_by': user_id,
            'description': f"İzin silindi: Öğrenci #{izin.ogrenci_id}"
        })
        return result

    @transaction.atomic
    def replace_student_izinler(self, ogrenci_id: int, kurum_id: int,
                                 izinler_data: list, user_id: int) -> list:
        """
        Öğrencinin tüm aktif izinlerini sil ve yenilerini oluştur.
        Haftalık program değişikliğinde kullanılır.
        """
        self.repo.deactivate_by_ogrenci(ogrenci_id)

        for data in izinler_data:
            data['ogrenci_id'] = ogrenci_id
            data['kurum_id'] = kurum_id
            data['olusturan_id'] = user_id
            self._validate_izin(data)

        izinler = self.repo.bulk_create(izinler_data)

        AuditLogRepository.create({
            'entity_type': 'OgrenciIzin',
            'entity_id': izinler[0].id if izinler else None,
            'action': AuditAction.UPDATE,
            'performed_by': user_id,
            'description': f"Öğrenci #{ogrenci_id} izinleri yeniden düzenlendi ({len(izinler)} izin)"
        })
        return izinler

    def is_student_exempted(self, ogrenci_id: int, tarih: date, periyot_kodu: str,
                             library_id=None, kurum_id: int = None) -> bool:
        """Öğrenci belirli tarih ve periyotta izinli mi?"""
        gun = tarih.weekday()
        izinler = self.repo.get_by_ogrenci_and_day(ogrenci_id, gun, tarih)

        for izin in izinler:
            # Tam gün izni
            if izin.izin_tipi == ExemptionType.FULL_DAY:
                # Salon kontrolü
                if izin.library_id is None or izin.library_id == library_id:
                    return True
            # Periyot izni
            elif izin.periyot_kodu == periyot_kodu:
                if izin.library_id is None or izin.library_id == library_id:
                    return True
        return False

    def _validate_izin(self, data: dict):
        """İzin validasyonu"""
        if 'ogrenci_id' not in data:
            raise ValueError("Öğrenci ID gereklidir")
        if 'gun' not in data:
            raise ValueError("Gün bilgisi gereklidir")
        if data.get('gun') not in range(7):
            raise ValueError("Geçersiz gün (0-6 arası olmalı)")
        if 'baslangic_tarihi' not in data:
            raise ValueError("Başlangıç tarihi gereklidir")

        izin_tipi = data.get('izin_tipi', 'PERIOD')
        if izin_tipi == 'PERIOD' and not data.get('periyot_kodu'):
            raise ValueError("Periyot izni için periyot kodu gereklidir")

    def _check_conflict(self, data: dict) -> bool:
        """Aynı öğrenci/gün/periyot çakışma kontrolü"""
        qs = OgrenciIzin.objects.filter(
            ogrenci_id=data['ogrenci_id'],
            gun=data['gun'],
            aktif_mi=True
        )
        izin_tipi = data.get('izin_tipi', 'PERIOD')
        if izin_tipi == 'FULL_DAY':
            # Tam gün izni varsa çakışır
            qs = qs.filter(izin_tipi='FULL_DAY')
        else:
            # Aynı periyotta izin veya tam gün izni varsa çakışır
            from django.db.models import Q
            qs = qs.filter(
                Q(izin_tipi='FULL_DAY') | Q(periyot_kodu=data.get('periyot_kodu'))
            )

        if data.get('library_id'):
            qs = qs.filter(
                Q(library_id=data['library_id']) | Q(library__isnull=True)
            )

        return qs.exists()


class TemporarySeatingService:
    """Geçici Oturma iş mantığı"""

    @transaction.atomic
    def create_temporary(self, library_id, data: dict, user_id: int):
        library = LibraryRepository.get_by_id(library_id)
        if not library:
            raise ValueError("Kütüphane bulunamadı")

        # Max geçici koltuk kontrolü (kapasitenin %10'u, minimum 5)
        aktif_gecici = TemporarySeatingRepository.count_active(library_id)
        max_gecici = max(5, library.kapasite // 10)
        if aktif_gecici >= max_gecici:
            raise ValueError(
                f"Geçici oturma limiti doldu ({aktif_gecici}/{max_gecici})"
            )

        # Süre kontrolü
        baslangic = data.get('baslangic_zamani', timezone.now())
        bitis = data.get('beklenen_bitis_zamani')
        if bitis:
            sure_saat = (bitis - baslangic).total_seconds() / 3600
            if sure_saat > library.max_gecici_sure_saat:
                raise ValueError(
                    f"Maks süre {library.max_gecici_sure_saat} saat"
                )

        # Masa müsaitlik kontrolü
        seat = SeatRepository.get_by_id(data['seat_id'])
        if not seat:
            raise ValueError("Masa bulunamadı")
        if seat.durum != SeatStatus.AVAILABLE:
            raise ValueError("Masa müsait değil")

        data['library_id'] = library_id
        data['onaylayan_id'] = user_id
        if 'baslangic_zamani' not in data:
            data['baslangic_zamani'] = timezone.now()

        temp = TemporarySeatingRepository.create(data)

        # Masa durumunu güncelle (OCCUPIED değil, RESERVED olarak)
        SeatRepository.update(data['seat_id'], {'durum': SeatStatus.RESERVED})

        AuditLogRepository.create({
            'entity_type': 'TemporarySeating',
            'entity_id': temp.id,
            'action': AuditAction.CREATE,
            'performed_by': user_id,
            'description': f"Geçici oturma: Öğrenci #{data['ogrenci_id']} → Masa {seat.masa_no}"
        })
        return temp

    @transaction.atomic
    def end_temporary(self, seating_id, user_id: int):
        temp = TemporarySeatingRepository.get_by_id(seating_id)
        if not temp:
            raise ValueError("Geçici oturma bulunamadı")
        if temp.durum != TemporarySeatingStatus.ACTIVE:
            raise ValueError("Bu geçici oturma zaten sona ermiş")

        temp.durum = TemporarySeatingStatus.ENDED
        temp.gercek_bitis_zamani = timezone.now()
        temp.save()

        # Masa durumunu AVAILABLE yap
        SeatRepository.update(temp.seat_id, {'durum': SeatStatus.AVAILABLE})

        return temp

    def list_active(self, library_id) -> list:
        return list(TemporarySeatingRepository.get_aktif(library_id))

    def expire_overdue(self, library_id) -> int:
        """Süresi dolan geçici oturmaları sonlandır"""
        expired_count = TemporarySeatingRepository.expire_overdue(library_id)
        # Expired olan masaları AVAILABLE yap
        expired = TemporarySeating.objects.filter(
            library_id=library_id,
            durum=TemporarySeatingStatus.EXPIRED
        )
        for temp in expired:
            SeatRepository.update(temp.seat_id, {'durum': SeatStatus.AVAILABLE})
        return expired_count
