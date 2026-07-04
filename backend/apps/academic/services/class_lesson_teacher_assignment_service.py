"""
ClassLessonTeacherAssignment Service

Sınıf Ders Çoklu Öğretmen Ataması iş kuralları ve validasyonlar.
"""
from typing import Optional, Dict, Any
from django.db.models import QuerySet

from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole
)
from apps.academic.interfaces.repositories.class_lesson_teacher_assignment_repository import ClassLessonTeacherAssignmentRepository
from apps.academic.interfaces.repositories.lesson_teacher_pool_repository import LessonTeacherPoolRepository
from apps.academic.services.active_academic_year import (
    get_active_academic_year,
    ActiveAcademicYearError,
    NoActiveAcademicYearError,
    MultipleActiveAcademicYearsError
)


class ClassLessonTeacherAssignmentValidationError(Exception):
    """Validasyon hatası"""
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(self.message)


class ClassLessonTeacherAssignmentService:
    """
    Sınıf Ders Öğretmen Ataması Servisi
    
    İş kuralları:
    - Aktif akademik yıl zorunlu (backend atar)
    - Sınıf ders planı zorunlu
    - Öğretmen zorunlu
    - Aynı plan+öğretmen kombinasyonu tekrar edemez
    - Her plan için sadece 1 PRIMARY rol olabilir
    - max_hours_for_class <= ClassLessonPlan.weekly_hours
    - Öğretmen branş havuzunda olmalı (opsiyonel kontrol)
    - Öğretmen aktif olmalı
    """
    
    def __init__(self):
        self.repository = ClassLessonTeacherAssignmentRepository()
        self.pool_repository = LessonTeacherPoolRepository()
    
    # ==================== VALIDASYONLAR ====================
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonları
        
        Args:
            data: Atama verileri
            
        Raises:
            ClassLessonTeacherAssignmentValidationError: Validasyon hatası
        """
        # Aktif akademik yıl kontrolü
        try:
            get_active_academic_year()
        except ActiveAcademicYearError as e:
            raise ClassLessonTeacherAssignmentValidationError(str(e), 'egitim_yili')
        
        # Zorunlu alan kontrolleri
        plan_id = data.get('class_lesson_plan_id') or data.get('plan_id')
        if not plan_id:
            raise ClassLessonTeacherAssignmentValidationError(
                'Sınıf ders planı zorunludur.',
                'class_lesson_plan_id'
            )
        
        teacher_id = data.get('ogretmen_id') or data.get('teacher_id')
        if not teacher_id:
            raise ClassLessonTeacherAssignmentValidationError(
                'Öğretmen zorunludur.',
                'ogretmen_id'
            )
        
        # Plan kontrolü ve bilgilerini al
        plan = self._get_class_lesson_plan(plan_id)
        if not plan:
            raise ClassLessonTeacherAssignmentValidationError(
                'Sınıf ders planı bulunamadı.',
                'class_lesson_plan_id'
            )
        
        # Duplicate kontrolü
        if self.repository.check_duplicate(plan_id, teacher_id):
            raise ClassLessonTeacherAssignmentValidationError(
                'Bu öğretmen zaten bu ders planına atanmış.',
                'ogretmen_id'
            )
        
        # PRIMARY rol kontrolü
        role = data.get('role', TeacherRole.PRIMARY)
        if role == TeacherRole.PRIMARY:
            if self.repository.check_primary_exists(plan_id):
                raise ClassLessonTeacherAssignmentValidationError(
                    'Bu ders planı için zaten bir asıl öğretmen var.',
                    'role'
                )
        
        # max_hours_for_class kontrolü
        max_hours = data.get('max_hours_for_class')
        if max_hours is not None and max_hours > plan.weekly_hours:
            raise ClassLessonTeacherAssignmentValidationError(
                f'Maksimum saat, ders planının haftalık saatinden ({plan.weekly_hours}) fazla olamaz.',
                'max_hours_for_class'
            )
        
        # Öğretmen aktiflik kontrolü
        self._validate_teacher_active(teacher_id)
        
        # Branş havuzunda mı kontrolü (opsiyonel - uyarı verir)
        # self._validate_teacher_in_pool(plan.ders_id, teacher_id)
    
    def validate_update(self, assignment_id: int, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonları
        
        Args:
            assignment_id: Atama ID
            data: Güncellenecek veriler
            
        Raises:
            ClassLessonTeacherAssignmentValidationError: Validasyon hatası
        """
        assignment = self.repository.get_by_id(assignment_id)
        if not assignment:
            raise ClassLessonTeacherAssignmentValidationError('Atama kaydı bulunamadı.', 'id')
        
        # PRIMARY rol kontrolü
        role = data.get('role')
        if role == TeacherRole.PRIMARY:
            if self.repository.check_primary_exists(
                assignment.class_lesson_plan_id,
                exclude_id=assignment_id
            ):
                raise ClassLessonTeacherAssignmentValidationError(
                    'Bu ders planı için zaten bir asıl öğretmen var.',
                    'role'
                )
        
        # max_hours_for_class kontrolü
        max_hours = data.get('max_hours_for_class')
        if max_hours is not None:
            plan_weekly_hours = assignment.class_lesson_plan.weekly_hours
            if max_hours > plan_weekly_hours:
                raise ClassLessonTeacherAssignmentValidationError(
                    f'Maksimum saat, ders planının haftalık saatinden ({plan_weekly_hours}) fazla olamaz.',
                    'max_hours_for_class'
                )
    
    def _get_class_lesson_plan(self, plan_id: int):
        """ClassLessonPlan getir"""
        from apps.academic.domain.class_lesson_plan import ClassLessonPlan
        try:
            return ClassLessonPlan.objects.get(id=plan_id, is_active=True)
        except ClassLessonPlan.DoesNotExist:
            return None
    
    def _validate_teacher_active(self, teacher_id: int) -> None:
        """
        Öğretmenin aktif olup olmadığını kontrol et
        
        Args:
            teacher_id: Öğretmen ID
            
        Raises:
            ClassLessonTeacherAssignmentValidationError: Öğretmen aktif değilse
        """
        from apps.personel.domain.models import Personel
        try:
            teacher = Personel.objects.get(id=teacher_id)
            if not teacher.aktif_mi:
                raise ClassLessonTeacherAssignmentValidationError(
                    'Bu öğretmen aktif değil.',
                    'ogretmen_id'
                )
        except Personel.DoesNotExist:
            raise ClassLessonTeacherAssignmentValidationError(
                'Öğretmen bulunamadı.',
                'ogretmen_id'
            )
    
    def _validate_teacher_in_pool(self, lesson_id: int, teacher_id: int) -> None:
        """
        Öğretmenin ilgili ders için havuzda olup olmadığını kontrol et
        
        Args:
            lesson_id: Ders ID
            teacher_id: Öğretmen ID
        
        Not: Bu metod şu an opsiyoneldir. Aktifleştirilirse havuzda olmayan
        öğretmenler atanamaz.
        """
        if not self.pool_repository.check_duplicate(lesson_id, teacher_id):
            raise ClassLessonTeacherAssignmentValidationError(
                'Bu öğretmen ilgili dersin branş havuzunda değil. Önce havuza ekleyin.',
                'ogretmen_id'
            )
    
    # ==================== İŞ KATMANI ====================
    
    def create(self, data: Dict[str, Any]) -> ClassLessonTeacherAssignment:
        """
        Yeni atama kaydı oluştur
        
        Args:
            data: Atama verileri
            
        Returns:
            Oluşturulan ClassLessonTeacherAssignment
        """
        self.validate_create(data)
        
        plan_id = data.get('class_lesson_plan_id') or data.get('plan_id')
        teacher_id = data.get('ogretmen_id') or data.get('teacher_id')
        
        return self.repository.create(
            plan_id=plan_id,
            teacher_id=teacher_id,
            role=data.get('role', TeacherRole.PRIMARY),
            priority=data.get('priority', 1),
            max_hours_for_class=data.get('max_hours_for_class'),
            notes=data.get('notes')
        )
    
    def update(self, assignment_id: int, data: Dict[str, Any]) -> Optional[ClassLessonTeacherAssignment]:
        """
        Atama kaydını güncelle
        
        Args:
            assignment_id: Atama ID
            data: Güncellenecek veriler
            
        Returns:
            Güncellenen ClassLessonTeacherAssignment
        """
        self.validate_update(assignment_id, data)
        
        return self.repository.update(
            assignment_id=assignment_id,
            role=data.get('role'),
            priority=data.get('priority'),
            max_hours_for_class=data.get('max_hours_for_class'),
            notes=data.get('notes')
        )
    
    def delete(self, assignment_id: int) -> bool:
        """
        Atama kaydını soft delete yap
        
        Args:
            assignment_id: Atama ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        return self.repository.soft_delete(assignment_id)
    
    def get_by_id(self, assignment_id: int) -> Optional[ClassLessonTeacherAssignment]:
        """ID ile atama getir"""
        return self.repository.get_by_id(assignment_id)
    
    def get_all(self) -> QuerySet[ClassLessonTeacherAssignment]:
        """Tüm aktif atama kayıtlarını getir"""
        return self.repository.get_all_active()
    
    def filter_by_class_lesson_plan(self, plan_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """Ders planına göre filtrele"""
        return self.repository.filter_by_class_lesson_plan(plan_id)
    
    def filter_by_teacher(self, teacher_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """Öğretmene göre filtrele"""
        return self.repository.filter_by_teacher(teacher_id)
    
    def filter_by_classroom(self, classroom_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """Sınıfa göre filtrele"""
        return self.repository.filter_by_classroom(classroom_id)
    
    def filter_by_role(self, role: str) -> QuerySet[ClassLessonTeacherAssignment]:
        """Role göre filtrele"""
        return self.repository.filter_by_role(role)
