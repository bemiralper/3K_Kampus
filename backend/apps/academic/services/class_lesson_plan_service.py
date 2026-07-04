"""
ClassLessonPlan Service

İş kuralları ve validasyonlar.
"""
from typing import Optional, List, Dict, Any
from django.db.models import QuerySet

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.interfaces.repositories.class_lesson_plan_repository import ClassLessonPlanRepository
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError,
    NoActiveAcademicYearError,
    MultipleActiveAcademicYearsError
)


class ClassLessonPlanValidationError(Exception):
    """Validasyon hatası"""
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(self.message)


class ClassLessonPlanService:
    """
    Sınıf Ders Planı Servisi
    
    İş kuralları:
    - Aktif akademik yıl zorunlu
    - Dönem zorunlu
    - Sınıf zorunlu
    - Ders zorunlu
    - Haftalık saat > 0
    - Kredi >= 0
    - Duplicate ders eklenemez
    - Double block ise haftalık saat >= 2
    """
    
    def __init__(self):
        self.repository = ClassLessonPlanRepository()
    
    # ==================== VALIDASYONLAR ====================
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonları
        
        Args:
            data: Plan verileri
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
            NoActiveAcademicYearError: Aktif yıl yoksa
            MultipleActiveAcademicYearsError: Birden fazla aktif yıl varsa
        """
        # Aktif akademik yıl kontrolü
        try:
            get_active_academic_year()
        except ActiveAcademicYearError as e:
            raise ClassLessonPlanValidationError(str(e), 'egitim_yili')
        
        # Zorunlu alan kontrolleri
        if not data.get('term_id') and not data.get('term'):
            raise ClassLessonPlanValidationError('Dönem zorunludur.', 'term')
        
        if not data.get('sinif_id') and not data.get('sinif'):
            raise ClassLessonPlanValidationError('Sınıf zorunludur.', 'sinif')
        
        if not data.get('ders_id') and not data.get('ders'):
            raise ClassLessonPlanValidationError('Ders zorunludur.', 'ders')
        
        # Haftalık saat kontrolü
        weekly_hours = data.get('weekly_hours', 0)
        if not weekly_hours or weekly_hours < 1:
            raise ClassLessonPlanValidationError(
                'Haftalık saat en az 1 olmalıdır.', 
                'weekly_hours'
            )
        
        # Kredi kontrolü
        credit = data.get('credit', 0)
        if credit < 0:
            raise ClassLessonPlanValidationError(
                'Kredi negatif olamaz.', 
                'credit'
            )
        
        # Double block kontrolü
        is_double_block = data.get('is_double_block', False)
        if is_double_block and weekly_hours < 2:
            raise ClassLessonPlanValidationError(
                'Çift blok dersler için haftalık saat en az 2 olmalıdır.',
                'weekly_hours'
            )
        
        # Duplicate kontrolü
        term_id = data.get('term_id') or (data.get('term').id if data.get('term') else None)
        sinif_id = data.get('sinif_id') or (data.get('sinif').id if data.get('sinif') else None)
        ders_id = data.get('ders_id') or (data.get('ders').id if data.get('ders') else None)
        
        if self.repository.check_duplicate(term_id, sinif_id, ders_id):
            raise ClassLessonPlanValidationError(
                'Bu sınıf için bu ders zaten eklenmiş.',
                'ders'
            )
    
    def validate_update(self, plan: ClassLessonPlan, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonları
        
        Args:
            plan: Güncellenecek plan
            data: Yeni veriler
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        # Haftalık saat kontrolü
        weekly_hours = data.get('weekly_hours', plan.weekly_hours)
        if weekly_hours < 1:
            raise ClassLessonPlanValidationError(
                'Haftalık saat en az 1 olmalıdır.', 
                'weekly_hours'
            )
        
        # Kredi kontrolü
        credit = data.get('credit', plan.credit)
        if credit < 0:
            raise ClassLessonPlanValidationError(
                'Kredi negatif olamaz.', 
                'credit'
            )
        
        # Double block kontrolü
        is_double_block = data.get('is_double_block', plan.is_double_block)
        if is_double_block and weekly_hours < 2:
            raise ClassLessonPlanValidationError(
                'Çift blok dersler için haftalık saat en az 2 olmalıdır.',
                'weekly_hours'
            )
        
        # Ders değiştiyse duplicate kontrolü
        new_ders_id = data.get('ders_id')
        if new_ders_id and new_ders_id != plan.ders_id:
            if self.repository.check_duplicate(
                plan.term_id, 
                plan.sinif_id, 
                new_ders_id, 
                exclude_id=plan.id
            ):
                raise ClassLessonPlanValidationError(
                    'Bu sınıf için bu ders zaten eklenmiş.',
                    'ders'
                )
    
    # ==================== CRUD İŞLEMLERİ ====================
    
    def get_by_id(self, plan_id: int) -> Optional[ClassLessonPlan]:
        """ID ile plan getir"""
        return self.repository.get_by_id(plan_id)
    
    def list_by_classroom_and_term(
        self, 
        classroom_id: int, 
        term_id: int
    ) -> QuerySet[ClassLessonPlan]:
        """
        Sınıf ve döneme göre listele
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Plan QuerySet
        """
        return self.repository.filter_by_classroom_and_term(classroom_id, term_id)
    
    def list_by_classroom(self, classroom_id: int) -> QuerySet[ClassLessonPlan]:
        """Sınıfa göre listele"""
        return self.repository.filter_by_classroom(classroom_id)
    
    def list_by_term(self, term_id: int) -> QuerySet[ClassLessonPlan]:
        """Döneme göre listele"""
        return self.repository.filter_by_term(term_id)
    
    def list_by_teacher(self, teacher_id: int) -> QuerySet[ClassLessonPlan]:
        """Öğretmene göre listele"""
        return self.repository.filter_by_teacher(teacher_id)
    
    def list_all(self) -> QuerySet[ClassLessonPlan]:
        """Aktif eğitim yılındaki tüm planları listele"""
        return self.repository.list_all_for_active_year()
    
    def create(self, data: Dict[str, Any]) -> ClassLessonPlan:
        """
        Yeni plan oluştur
        
        Args:
            data: Plan verileri
            
        Returns:
            Oluşturulan plan
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        self.validate_create(data)
        return self.repository.create(data)
    
    def update(self, plan_id: int, data: Dict[str, Any]) -> ClassLessonPlan:
        """
        Plan güncelle
        
        Args:
            plan_id: Plan ID
            data: Yeni veriler
            
        Returns:
            Güncellenen plan
            
        Raises:
            ClassLessonPlanValidationError: Validasyon hatası
        """
        plan = self.repository.get_by_id(plan_id)
        if not plan:
            raise ClassLessonPlanValidationError('Plan bulunamadı.', 'id')
        
        self.validate_update(plan, data)
        return self.repository.update(plan, data)
    
    def delete(self, plan_id: int) -> ClassLessonPlan:
        """
        Plan sil (soft delete)
        
        Args:
            plan_id: Plan ID
            
        Returns:
            Silinen plan
            
        Raises:
            ClassLessonPlanValidationError: Plan bulunamazsa
        """
        plan = self.repository.get_by_id(plan_id)
        if not plan:
            raise ClassLessonPlanValidationError('Plan bulunamadı.', 'id')
        
        return self.repository.soft_delete(plan)
    
    # ==================== YARDIMCI METODLAR ====================
    
    def get_total_weekly_hours(self, classroom_id: int, term_id: int) -> int:
        """Sınıfın toplam haftalık ders saati"""
        return self.repository.get_total_weekly_hours(classroom_id, term_id)
    
    def get_active_year_display(self) -> str:
        """Aktif eğitim yılı string"""
        try:
            year = get_active_academic_year()
            return str(year)
        except ActiveAcademicYearError:
            return "Aktif yıl yok"
