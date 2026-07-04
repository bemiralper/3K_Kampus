"""
LessonTeacherPool Repository

Branş Öğretmen Havuzu CRUD işlemleri.
"""
from typing import Optional, List
from django.db.models import QuerySet

from apps.academic.domain.lesson_teacher_pool import LessonTeacherPool
from apps.academic.services.active_academic_year import get_active_academic_year


class LessonTeacherPoolRepository:
    """
    Branş Öğretmen Havuzu Repository
    
    Tüm veritabanı işlemleri bu sınıf üzerinden yapılır.
    """
    
    # ==================== OKUMA İŞLEMLERİ ====================
    
    @staticmethod
    def get_by_id(pool_id: int) -> Optional[LessonTeacherPool]:
        """
        ID ile havuz kaydını getir
        
        Args:
            pool_id: Havuz ID
            
        Returns:
            LessonTeacherPool veya None
        """
        try:
            return LessonTeacherPool.objects.select_related(
                'ders', 'ogretmen', 'egitim_yili'
            ).get(id=pool_id, is_active=True)
        except LessonTeacherPool.DoesNotExist:
            return None
    
    @staticmethod
    def get_all_active() -> QuerySet[LessonTeacherPool]:
        """Tüm aktif havuz kayıtlarını getir"""
        active_year = get_active_academic_year()
        return LessonTeacherPool.objects.filter(
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen')
    
    @staticmethod
    def filter_by_lesson(lesson_id: int) -> QuerySet[LessonTeacherPool]:
        """
        Derse göre filtrele
        
        Args:
            lesson_id: Ders ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return LessonTeacherPool.objects.filter(
            ders_id=lesson_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen').order_by('-is_primary', 'ogretmen__ad')
    
    @staticmethod
    def filter_by_teacher(teacher_id: int) -> QuerySet[LessonTeacherPool]:
        """
        Öğretmene göre filtrele
        
        Args:
            teacher_id: Öğretmen ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return LessonTeacherPool.objects.filter(
            ogretmen_id=teacher_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen')
    
    @staticmethod
    def get_primary_teacher(lesson_id: int) -> Optional[LessonTeacherPool]:
        """
        Ders için asıl branş öğretmenini getir
        
        Args:
            lesson_id: Ders ID
            
        Returns:
            LessonTeacherPool veya None
        """
        active_year = get_active_academic_year()
        return LessonTeacherPool.objects.filter(
            ders_id=lesson_id,
            egitim_yili=active_year,
            is_primary=True,
            is_active=True
        ).select_related('ogretmen').first()
    
    @staticmethod
    def check_duplicate(
        lesson_id: int,
        teacher_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Aynı ders+öğretmen kombinasyonunun var olup olmadığını kontrol et
        
        Args:
            lesson_id: Ders ID
            teacher_id: Öğretmen ID
            exclude_id: Hariç tutulacak ID (güncelleme için)
            
        Returns:
            bool: Duplicate var mı
        """
        active_year = get_active_academic_year()
        queryset = LessonTeacherPool.objects.filter(
            egitim_yili=active_year,
            ders_id=lesson_id,
            ogretmen_id=teacher_id,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    @staticmethod
    def check_primary_exists(
        lesson_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Ders için zaten bir asıl branş öğretmeni var mı kontrol et
        
        Args:
            lesson_id: Ders ID
            exclude_id: Hariç tutulacak ID (güncelleme için)
            
        Returns:
            bool: Primary var mı
        """
        active_year = get_active_academic_year()
        queryset = LessonTeacherPool.objects.filter(
            egitim_yili=active_year,
            ders_id=lesson_id,
            is_primary=True,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    # ==================== YAZMA İŞLEMLERİ ====================
    
    @staticmethod
    def create(
        lesson_id: int,
        teacher_id: int,
        is_primary: bool = False,
        max_weekly_load: Optional[int] = None,
        notes: Optional[str] = None
    ) -> LessonTeacherPool:
        """
        Yeni havuz kaydı oluştur
        
        Args:
            lesson_id: Ders ID
            teacher_id: Öğretmen ID
            is_primary: Asıl branş mı
            max_weekly_load: Maksimum haftalık yük
            notes: Notlar
            
        Returns:
            Oluşturulan LessonTeacherPool
        """
        active_year = get_active_academic_year()
        return LessonTeacherPool.objects.create(
            egitim_yili=active_year,
            ders_id=lesson_id,
            ogretmen_id=teacher_id,
            is_primary=is_primary,
            max_weekly_load=max_weekly_load,
            notes=notes
        )
    
    @staticmethod
    def update(
        pool_id: int,
        is_primary: Optional[bool] = None,
        max_weekly_load: Optional[int] = None,
        notes: Optional[str] = None
    ) -> Optional[LessonTeacherPool]:
        """
        Havuz kaydını güncelle
        
        Args:
            pool_id: Havuz ID
            is_primary: Asıl branş mı
            max_weekly_load: Maksimum haftalık yük
            notes: Notlar
            
        Returns:
            Güncellenen LessonTeacherPool veya None
        """
        pool = LessonTeacherPoolRepository.get_by_id(pool_id)
        if not pool:
            return None
        
        if is_primary is not None:
            pool.is_primary = is_primary
        if max_weekly_load is not None:
            pool.max_weekly_load = max_weekly_load
        if notes is not None:
            pool.notes = notes
        
        pool.save()
        return pool
    
    @staticmethod
    def soft_delete(pool_id: int) -> bool:
        """
        Havuz kaydını soft delete yap
        
        Args:
            pool_id: Havuz ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        pool = LessonTeacherPoolRepository.get_by_id(pool_id)
        if not pool:
            return False
        
        pool.is_active = False
        pool.save()
        return True
    
    @staticmethod
    def hard_delete(pool_id: int) -> bool:
        """
        Havuz kaydını kalıcı olarak sil
        
        Args:
            pool_id: Havuz ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        try:
            pool = LessonTeacherPool.objects.get(id=pool_id)
            pool.delete()
            return True
        except LessonTeacherPool.DoesNotExist:
            return False
