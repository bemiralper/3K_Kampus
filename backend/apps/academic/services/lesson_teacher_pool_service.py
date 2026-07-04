"""
LessonTeacherPool Service

Branş Öğretmen Havuzu iş kuralları ve validasyonlar.
"""
from typing import Optional, Dict, Any
from django.db.models import QuerySet

from apps.academic.domain.lesson_teacher_pool import LessonTeacherPool
from apps.academic.interfaces.repositories.lesson_teacher_pool_repository import LessonTeacherPoolRepository
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError,
    NoActiveAcademicYearError,
    MultipleActiveAcademicYearsError
)


class LessonTeacherPoolValidationError(Exception):
    """Validasyon hatası"""
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(self.message)


class LessonTeacherPoolService:
    """
    Branş Öğretmen Havuzu Servisi
    
    İş kuralları:
    - Aktif akademik yıl zorunlu (backend atar)
    - Ders zorunlu
    - Öğretmen zorunlu
    - Aynı ders+öğretmen kombinasyonu tekrar edemez
    - Her ders için sadece 1 is_primary olabilir
    - Öğretmen aktif olmalı
    """
    
    def __init__(self):
        self.repository = LessonTeacherPoolRepository()
    
    # ==================== VALIDASYONLAR ====================
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonları
        
        Args:
            data: Havuz verileri
            
        Raises:
            LessonTeacherPoolValidationError: Validasyon hatası
        """
        # Aktif akademik yıl kontrolü
        try:
            get_active_academic_year()
        except ActiveAcademicYearError as e:
            raise LessonTeacherPoolValidationError(str(e), 'egitim_yili')
        
        # Zorunlu alan kontrolleri
        lesson_id = data.get('ders_id') or data.get('lesson_id')
        if not lesson_id:
            raise LessonTeacherPoolValidationError('Ders zorunludur.', 'ders_id')
        
        teacher_id = data.get('ogretmen_id') or data.get('teacher_id')
        if not teacher_id:
            raise LessonTeacherPoolValidationError('Öğretmen zorunludur.', 'ogretmen_id')
        
        # Duplicate kontrolü
        if self.repository.check_duplicate(lesson_id, teacher_id):
            raise LessonTeacherPoolValidationError(
                'Bu öğretmen zaten bu ders için havuza eklenmiş.',
                'ogretmen_id'
            )
        
        # is_primary kontrolü
        is_primary = data.get('is_primary', False)
        if is_primary:
            if self.repository.check_primary_exists(lesson_id):
                raise LessonTeacherPoolValidationError(
                    'Bu ders için zaten bir asıl branş öğretmeni var.',
                    'is_primary'
                )
        
        # Öğretmen aktiflik kontrolü
        self._validate_teacher_active(teacher_id)
    
    def validate_update(self, pool_id: int, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonları
        
        Args:
            pool_id: Havuz ID
            data: Güncellenecek veriler
            
        Raises:
            LessonTeacherPoolValidationError: Validasyon hatası
        """
        pool = self.repository.get_by_id(pool_id)
        if not pool:
            raise LessonTeacherPoolValidationError('Havuz kaydı bulunamadı.', 'id')
        
        # is_primary kontrolü
        is_primary = data.get('is_primary')
        if is_primary is True:
            if self.repository.check_primary_exists(pool.ders_id, exclude_id=pool_id):
                raise LessonTeacherPoolValidationError(
                    'Bu ders için zaten bir asıl branş öğretmeni var.',
                    'is_primary'
                )
    
    def _validate_teacher_active(self, teacher_id: int) -> None:
        """
        Öğretmenin aktif olup olmadığını kontrol et
        
        Args:
            teacher_id: Öğretmen ID
            
        Raises:
            LessonTeacherPoolValidationError: Öğretmen aktif değilse
        """
        from apps.personel.domain.models import Personel
        try:
            teacher = Personel.objects.get(id=teacher_id)
            if not teacher.aktif_mi:
                raise LessonTeacherPoolValidationError(
                    'Bu öğretmen aktif değil.',
                    'ogretmen_id'
                )
        except Personel.DoesNotExist:
            raise LessonTeacherPoolValidationError(
                'Öğretmen bulunamadı.',
                'ogretmen_id'
            )
    
    # ==================== İŞ KATMANI ====================
    
    def create(self, data: Dict[str, Any]) -> LessonTeacherPool:
        """
        Yeni havuz kaydı oluştur
        
        Args:
            data: Havuz verileri
            
        Returns:
            Oluşturulan LessonTeacherPool
        """
        self.validate_create(data)
        
        lesson_id = data.get('ders_id') or data.get('lesson_id')
        teacher_id = data.get('ogretmen_id') or data.get('teacher_id')
        
        return self.repository.create(
            lesson_id=lesson_id,
            teacher_id=teacher_id,
            is_primary=data.get('is_primary', False),
            max_weekly_load=data.get('max_weekly_load'),
            notes=data.get('notes')
        )
    
    def update(self, pool_id: int, data: Dict[str, Any]) -> Optional[LessonTeacherPool]:
        """
        Havuz kaydını güncelle
        
        Args:
            pool_id: Havuz ID
            data: Güncellenecek veriler
            
        Returns:
            Güncellenen LessonTeacherPool
        """
        self.validate_update(pool_id, data)
        
        return self.repository.update(
            pool_id=pool_id,
            is_primary=data.get('is_primary'),
            max_weekly_load=data.get('max_weekly_load'),
            notes=data.get('notes')
        )
    
    def delete(self, pool_id: int) -> bool:
        """
        Havuz kaydını soft delete yap
        
        Args:
            pool_id: Havuz ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        return self.repository.soft_delete(pool_id)
    
    def get_by_id(self, pool_id: int) -> Optional[LessonTeacherPool]:
        """ID ile havuz getir"""
        return self.repository.get_by_id(pool_id)
    
    def get_all(self) -> QuerySet[LessonTeacherPool]:
        """Tüm aktif havuz kayıtlarını getir"""
        return self.repository.get_all_active()
    
    def filter_by_lesson(self, lesson_id: int) -> QuerySet[LessonTeacherPool]:
        """Derse göre filtrele"""
        return self.repository.filter_by_lesson(lesson_id)
    
    def filter_by_teacher(self, teacher_id: int) -> QuerySet[LessonTeacherPool]:
        """Öğretmene göre filtrele"""
        return self.repository.filter_by_teacher(teacher_id)
