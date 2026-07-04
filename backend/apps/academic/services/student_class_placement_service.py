"""
StudentClassPlacement Service

Öğrenci Sınıf Yerleşimi iş mantığı ve validasyonları

VALIDASYON KURALLARI:
- Aktif akademik yıl zorunlu (otomatik)
- Aynı öğrenci aynı dönem içinde tek aktif sınıf
- Classroom kapasitesi aşılırsa hata
- Group kapasitesi varsa aşımda hata
- group.classroom == classroom olmalı
- start_date ≤ end_date (varsa)
- Pasif öğrenci eklenemez
- Bulk assign duplicate kayıt üretmez (upsert mantığı)
"""
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass

from apps.academic.domain.student_class_placement import StudentClassPlacement, PlacementType
from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.interfaces.repositories.student_class_placement_repository import StudentClassPlacementRepository
from apps.academic.interfaces.repositories.classroom_group_repository import ClassroomGroupRepository
from apps.academic.services.active_academic_year import get_active_academic_year


class StudentClassPlacementValidationError(Exception):
    """StudentClassPlacement validasyon hatası"""
    def __init__(self, message: str, field: str = None):
        self.message = message
        self.field = field
        super().__init__(message)


@dataclass
class BulkAssignResult:
    """Toplu yerleşim sonucu"""
    created: List[int]  # Oluşturulan yerleşim ID'leri
    updated: List[int]  # Güncellenen yerleşim ID'leri
    skipped: List[Tuple[int, str]]  # (student_id, reason) - Atlanan öğrenciler
    errors: List[Tuple[int, str]]  # (student_id, error) - Hatalı öğrenciler


class StudentClassPlacementService:
    """
    StudentClassPlacement Service
    
    İş mantığı ve validasyonlar
    """
    
    def __init__(self):
        self.repository = StudentClassPlacementRepository()
        self.group_repository = ClassroomGroupRepository()
    
    # ==================== VALIDASYONLAR ====================
    
    def _validate_student_active(self, student_id: int) -> None:
        """
        Öğrencinin aktif olup olmadığını kontrol et
        
        Raises:
            StudentClassPlacementValidationError
        """
        from apps.ogrenci.domain.models import Ogrenci
        try:
            student = Ogrenci.objects.get(id=student_id)
            if not student.aktif_mi:
                raise StudentClassPlacementValidationError(
                    'Bu öğrenci aktif değil.',
                    'student_id'
                )
        except Ogrenci.DoesNotExist:
            raise StudentClassPlacementValidationError(
                'Öğrenci bulunamadı.',
                'student_id'
            )
    
    def _validate_classroom_capacity(
        self, 
        classroom_id: int, 
        term_id: int, 
        exclude_id: Optional[int] = None
    ) -> None:
        """
        Sınıf kapasitesini kontrol et
        
        Raises:
            StudentClassPlacementValidationError
        """
        from apps.sinif.domain.models import Sinif
        try:
            classroom = Sinif.objects.get(id=classroom_id)
            current_count = self.repository.get_classroom_student_count(classroom_id, term_id)
            
            # Güncelleme durumunda mevcut kaydı sayma
            if exclude_id:
                existing = self.repository.get_by_id(exclude_id)
                if existing and existing.classroom_id == classroom_id:
                    current_count -= 1
            
            if classroom.kapasite and current_count >= classroom.kapasite:
                raise StudentClassPlacementValidationError(
                    f'Sınıf kapasitesi dolu ({current_count}/{classroom.kapasite}).',
                    'classroom_id'
                )
        except Sinif.DoesNotExist:
            raise StudentClassPlacementValidationError(
                'Sınıf bulunamadı.',
                'classroom_id'
            )
    
    def _validate_group_capacity(
        self, 
        group_id: int, 
        term_id: int,
        exclude_id: Optional[int] = None
    ) -> None:
        """
        Grup kapasitesini kontrol et
        
        Raises:
            StudentClassPlacementValidationError
        """
        group = self.group_repository.get_by_id(group_id)
        if not group:
            raise StudentClassPlacementValidationError(
                'Grup bulunamadı.',
                'group_id'
            )
        
        if group.capacity:
            current_count = self.repository.get_group_student_count(group_id, term_id)
            
            # Güncelleme durumunda mevcut kaydı sayma
            if exclude_id:
                existing = self.repository.get_by_id(exclude_id)
                if existing and existing.group_id == group_id:
                    current_count -= 1
            
            if current_count >= group.capacity:
                raise StudentClassPlacementValidationError(
                    f'Grup kapasitesi dolu ({current_count}/{group.capacity}).',
                    'group_id'
                )
    
    def _validate_group_classroom_match(self, group_id: int, classroom_id: int) -> None:
        """
        Grubun sınıfa ait olduğunu kontrol et
        
        Raises:
            StudentClassPlacementValidationError
        """
        group = self.group_repository.get_by_id(group_id)
        if not group:
            raise StudentClassPlacementValidationError(
                'Grup bulunamadı.',
                'group_id'
            )
        
        if group.classroom_id != classroom_id:
            raise StudentClassPlacementValidationError(
                'Seçilen grup bu sınıfa ait değil.',
                'group_id'
            )
    
    def _validate_dates(self, start_date, end_date) -> None:
        """
        Tarih tutarlılığını kontrol et
        
        Raises:
            StudentClassPlacementValidationError
        """
        if start_date and end_date and start_date > end_date:
            raise StudentClassPlacementValidationError(
                'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
                'start_date'
            )
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonu
        
        Raises:
            StudentClassPlacementValidationError
        """
        # Zorunlu alanlar
        if not data.get('term_id'):
            raise StudentClassPlacementValidationError('Dönem seçimi zorunludur.', 'term_id')
        
        if not data.get('student_id'):
            raise StudentClassPlacementValidationError('Öğrenci seçimi zorunludur.', 'student_id')
        
        if not data.get('classroom_id'):
            raise StudentClassPlacementValidationError('Sınıf seçimi zorunludur.', 'classroom_id')
        
        # Öğrenci aktif mi?
        self._validate_student_active(data['student_id'])
        
        # Duplicate kontrolü
        if self.repository.check_duplicate(data['term_id'], data['student_id']):
            raise StudentClassPlacementValidationError(
                'Bu öğrenci bu dönemde zaten bir sınıfa yerleştirilmiş.',
                'student_id'
            )
        
        # Sınıf kapasitesi
        self._validate_classroom_capacity(data['classroom_id'], data['term_id'])
        
        # Grup validasyonları
        if data.get('group_id'):
            self._validate_group_classroom_match(data['group_id'], data['classroom_id'])
            self._validate_group_capacity(data['group_id'], data['term_id'])
        
        # Tarih validasyonu
        self._validate_dates(data.get('start_date'), data.get('end_date'))
    
    def validate_update(self, placement: StudentClassPlacement, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonu
        
        Raises:
            StudentClassPlacementValidationError
        """
        term_id = data.get('term_id', placement.term_id)
        student_id = placement.student_id  # Öğrenci değiştirilemez
        classroom_id = data.get('classroom_id', placement.classroom_id)
        group_id = data.get('group_id', placement.group_id)
        
        # Sınıf değiştiyse kapasite kontrolü
        if classroom_id != placement.classroom_id:
            self._validate_classroom_capacity(classroom_id, term_id, placement.id)
        
        # Grup validasyonları
        if group_id:
            self._validate_group_classroom_match(group_id, classroom_id)
            if group_id != placement.group_id:
                self._validate_group_capacity(group_id, term_id, placement.id)
        
        # Tarih validasyonu
        start_date = data.get('start_date', placement.start_date)
        end_date = data.get('end_date', placement.end_date)
        self._validate_dates(start_date, end_date)
    
    # ==================== İŞ KATMANI ====================
    
    def get_by_id(self, placement_id: int) -> Optional[StudentClassPlacement]:
        """ID ile yerleşim getir"""
        return self.repository.get_by_id(placement_id)
    
    def list_by_classroom(self, classroom_id: int):
        """Sınıfa göre yerleşimleri listele"""
        return self.repository.list_by_classroom(classroom_id)
    
    def list_by_classroom_and_term(self, classroom_id: int, term_id: int):
        """Sınıf ve döneme göre yerleşimleri listele"""
        return self.repository.list_by_classroom_and_term(classroom_id, term_id)
    
    def list_by_term(self, term_id: int):
        """Döneme göre yerleşimleri listele"""
        return self.repository.list_by_term(term_id)
    
    def list_by_group(self, group_id: int):
        """Gruba göre yerleşimleri listele"""
        return self.repository.list_by_group(group_id)
    
    def list_by_student(self, student_id: int):
        """Öğrenciye göre yerleşimleri listele"""
        return self.repository.list_by_student(student_id)
    
    def create(self, data: Dict[str, Any]) -> StudentClassPlacement:
        """
        Yeni yerleşim oluştur
        
        Args:
            data: Yerleşim verileri
            
        Returns:
            Oluşturulan yerleşim
            
        Raises:
            StudentClassPlacementValidationError
        """
        self.validate_create(data)
        
        create_data = {
            'term_id': data['term_id'],
            'student_id': data['student_id'],
            'classroom_id': data['classroom_id'],
            'group_id': data.get('group_id'),
            'placement_type': data.get('placement_type', PlacementType.PRIMARY),
            'start_date': data.get('start_date'),
            'end_date': data.get('end_date'),
            'notes': data.get('notes'),
        }
        
        return self.repository.create(create_data)
    
    def update(self, placement_id: int, data: Dict[str, Any]) -> StudentClassPlacement:
        """
        Yerleşim güncelle
        
        Args:
            placement_id: Yerleşim ID
            data: Yeni veriler
            
        Returns:
            Güncellenen yerleşim
            
        Raises:
            StudentClassPlacementValidationError
        """
        placement = self.repository.get_by_id(placement_id)
        if not placement:
            raise StudentClassPlacementValidationError('Yerleşim bulunamadı.')
        
        self.validate_update(placement, data)
        
        update_data = {}
        allowed_fields = [
            'classroom_id', 'group_id', 'placement_type',
            'start_date', 'end_date', 'notes'
        ]
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        return self.repository.update(placement, update_data)
    
    def delete(self, placement_id: int) -> StudentClassPlacement:
        """
        Yerleşim sil (soft delete)
        
        Args:
            placement_id: Yerleşim ID
            
        Returns:
            Silinen yerleşim
            
        Raises:
            StudentClassPlacementValidationError
        """
        placement = self.repository.get_by_id(placement_id)
        if not placement:
            raise StudentClassPlacementValidationError('Yerleşim bulunamadı.')
        
        return self.repository.soft_delete(placement)
    
    def bulk_assign(
        self, 
        term_id: int,
        classroom_id: int,
        student_ids: List[int],
        group_id: Optional[int] = None,
        placement_type: str = PlacementType.PRIMARY
    ) -> BulkAssignResult:
        """
        Toplu öğrenci yerleşimi
        
        Upsert mantığı:
        - Öğrenci zaten bu dönemde bir sınıftaysa güncelle
        - Değilse yeni kayıt oluştur
        - Kapasite aşımı veya hata durumunda atla
        
        Args:
            term_id: Dönem ID
            classroom_id: Sınıf ID
            student_ids: Öğrenci ID listesi
            group_id: Grup ID (opsiyonel)
            placement_type: Yerleşim türü
            
        Returns:
            BulkAssignResult: İşlem sonucu
        """
        result = BulkAssignResult(
            created=[],
            updated=[],
            skipped=[],
            errors=[]
        )
        
        # Grup kontrolü
        if group_id:
            group = self.group_repository.get_by_id(group_id)
            if not group:
                result.errors.append((0, 'Grup bulunamadı.'))
                return result
            if group.classroom_id != classroom_id:
                result.errors.append((0, 'Seçilen grup bu sınıfa ait değil.'))
                return result
        
        # Sınıf kapasitesini al
        from apps.sinif.domain.models import Sinif
        try:
            classroom = Sinif.objects.get(id=classroom_id)
            classroom_capacity = classroom.kapasite
        except Sinif.DoesNotExist:
            result.errors.append((0, 'Sınıf bulunamadı.'))
            return result
        
        # Mevcut öğrenci sayısı
        current_count = self.repository.get_classroom_student_count(classroom_id, term_id)
        
        for student_id in student_ids:
            try:
                # Öğrenci aktif mi?
                from apps.ogrenci.domain.models import Ogrenci
                try:
                    student = Ogrenci.objects.get(id=student_id)
                    if not student.aktif_mi:
                        result.skipped.append((student_id, 'Öğrenci aktif değil'))
                        continue
                except Ogrenci.DoesNotExist:
                    result.skipped.append((student_id, 'Öğrenci bulunamadı'))
                    continue
                
                # Mevcut yerleşim var mı?
                existing = self.repository.get_existing_placement(term_id, student_id)
                
                if existing:
                    # Güncelle (upsert)
                    if existing.classroom_id != classroom_id:
                        # Farklı sınıfa taşınıyor - kapasite kontrol
                        if classroom_capacity and current_count >= classroom_capacity:
                            result.skipped.append((student_id, 'Sınıf kapasitesi dolu'))
                            continue
                        current_count += 1
                    
                    existing.classroom_id = classroom_id
                    existing.group_id = group_id
                    existing.placement_type = placement_type
                    existing.save()
                    result.updated.append(existing.id)
                else:
                    # Yeni kayıt
                    if classroom_capacity and current_count >= classroom_capacity:
                        result.skipped.append((student_id, 'Sınıf kapasitesi dolu'))
                        continue
                    
                    placement = self.repository.create({
                        'term_id': term_id,
                        'student_id': student_id,
                        'classroom_id': classroom_id,
                        'group_id': group_id,
                        'placement_type': placement_type,
                    })
                    result.created.append(placement.id)
                    current_count += 1
                    
            except Exception as e:
                result.errors.append((student_id, str(e)))
        
        return result
