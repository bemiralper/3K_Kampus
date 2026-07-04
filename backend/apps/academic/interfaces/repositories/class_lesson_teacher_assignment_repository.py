"""
ClassLessonTeacherAssignment Repository

Sınıf Ders Çoklu Öğretmen Ataması CRUD işlemleri.
"""
from typing import Optional, List
from django.db.models import QuerySet

from apps.academic.domain.class_lesson_teacher_assignment import (
    ClassLessonTeacherAssignment,
    TeacherRole
)
from apps.academic.services.active_academic_year import get_active_academic_year


class ClassLessonTeacherAssignmentRepository:
    """
    Sınıf Ders Öğretmen Ataması Repository
    
    Tüm veritabanı işlemleri bu sınıf üzerinden yapılır.
    """
    
    # ==================== OKUMA İŞLEMLERİ ====================
    
    @staticmethod
    def get_by_id(assignment_id: int) -> Optional[ClassLessonTeacherAssignment]:
        """
        ID ile atama kaydını getir
        
        Args:
            assignment_id: Atama ID
            
        Returns:
            ClassLessonTeacherAssignment veya None
        """
        try:
            return ClassLessonTeacherAssignment.objects.select_related(
                'class_lesson_plan__sinif',
                'class_lesson_plan__ders',
                'ogretmen',
                'egitim_yili'
            ).get(id=assignment_id, is_active=True)
        except ClassLessonTeacherAssignment.DoesNotExist:
            return None
    
    @staticmethod
    def get_all_active() -> QuerySet[ClassLessonTeacherAssignment]:
        """Tüm aktif atama kayıtlarını getir"""
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            egitim_yili=active_year,
            is_active=True
        ).select_related(
            'class_lesson_plan__sinif',
            'class_lesson_plan__ders',
            'ogretmen'
        ).order_by('class_lesson_plan__sinif__ad', 'class_lesson_plan__ders__ad', 'priority')
    
    @staticmethod
    def filter_by_class_lesson_plan(plan_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """
        Sınıf ders planına göre filtrele
        
        Args:
            plan_id: Sınıf Ders Planı ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan_id=plan_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ogretmen').order_by('priority', 'role')
    
    @staticmethod
    def filter_by_teacher(teacher_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """
        Öğretmene göre filtrele
        
        Args:
            teacher_id: Öğretmen ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            ogretmen_id=teacher_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related(
            'class_lesson_plan__sinif',
            'class_lesson_plan__ders'
        )
    
    @staticmethod
    def filter_by_classroom(classroom_id: int) -> QuerySet[ClassLessonTeacherAssignment]:
        """
        Sınıfa göre filtrele
        
        Args:
            classroom_id: Sınıf ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan__sinif_id=classroom_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related(
            'class_lesson_plan__sinif',
            'class_lesson_plan__ders',
            'ogretmen'
        ).order_by('class_lesson_plan__ders__ad', 'priority')
    
    @staticmethod
    def filter_by_role(role: str) -> QuerySet[ClassLessonTeacherAssignment]:
        """
        Role göre filtrele
        
        Args:
            role: Rol (PRIMARY, SECONDARY, vb.)
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            role=role,
            egitim_yili=active_year,
            is_active=True
        ).select_related(
            'class_lesson_plan__sinif',
            'class_lesson_plan__ders',
            'ogretmen'
        )
    
    @staticmethod
    def get_primary_teacher(plan_id: int) -> Optional[ClassLessonTeacherAssignment]:
        """
        Ders planı için asıl öğretmeni getir
        
        Args:
            plan_id: Sınıf Ders Planı ID
            
        Returns:
            ClassLessonTeacherAssignment veya None
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.filter(
            class_lesson_plan_id=plan_id,
            egitim_yili=active_year,
            role=TeacherRole.PRIMARY,
            is_active=True
        ).select_related('ogretmen').first()
    
    @staticmethod
    def check_duplicate(
        plan_id: int,
        teacher_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Aynı plan+öğretmen kombinasyonunun var olup olmadığını kontrol et
        
        Args:
            plan_id: Sınıf Ders Planı ID
            teacher_id: Öğretmen ID
            exclude_id: Hariç tutulacak ID (güncelleme için)
            
        Returns:
            bool: Duplicate var mı
        """
        active_year = get_active_academic_year()
        queryset = ClassLessonTeacherAssignment.objects.filter(
            egitim_yili=active_year,
            class_lesson_plan_id=plan_id,
            ogretmen_id=teacher_id,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    @staticmethod
    def check_primary_exists(
        plan_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Ders planı için zaten bir asıl öğretmen var mı kontrol et
        
        Args:
            plan_id: Sınıf Ders Planı ID
            exclude_id: Hariç tutulacak ID (güncelleme için)
            
        Returns:
            bool: Primary var mı
        """
        active_year = get_active_academic_year()
        queryset = ClassLessonTeacherAssignment.objects.filter(
            egitim_yili=active_year,
            class_lesson_plan_id=plan_id,
            role=TeacherRole.PRIMARY,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    # ==================== YAZMA İŞLEMLERİ ====================
    
    @staticmethod
    def create(
        plan_id: int,
        teacher_id: int,
        role: str = TeacherRole.PRIMARY,
        priority: int = 1,
        max_hours_for_class: Optional[int] = None,
        notes: Optional[str] = None
    ) -> ClassLessonTeacherAssignment:
        """
        Yeni atama kaydı oluştur
        
        Args:
            plan_id: Sınıf Ders Planı ID
            teacher_id: Öğretmen ID
            role: Rol
            priority: Öncelik
            max_hours_for_class: Bu sınıf için maksimum saat
            notes: Notlar
            
        Returns:
            Oluşturulan ClassLessonTeacherAssignment
        """
        active_year = get_active_academic_year()
        return ClassLessonTeacherAssignment.objects.create(
            egitim_yili=active_year,
            class_lesson_plan_id=plan_id,
            ogretmen_id=teacher_id,
            role=role,
            priority=priority,
            max_hours_for_class=max_hours_for_class,
            notes=notes
        )
    
    @staticmethod
    def update(
        assignment_id: int,
        role: Optional[str] = None,
        priority: Optional[int] = None,
        max_hours_for_class: Optional[int] = None,
        notes: Optional[str] = None
    ) -> Optional[ClassLessonTeacherAssignment]:
        """
        Atama kaydını güncelle
        
        Args:
            assignment_id: Atama ID
            role: Rol
            priority: Öncelik
            max_hours_for_class: Bu sınıf için maksimum saat
            notes: Notlar
            
        Returns:
            Güncellenen ClassLessonTeacherAssignment veya None
        """
        assignment = ClassLessonTeacherAssignmentRepository.get_by_id(assignment_id)
        if not assignment:
            return None
        
        if role is not None:
            assignment.role = role
        if priority is not None:
            assignment.priority = priority
        if max_hours_for_class is not None:
            assignment.max_hours_for_class = max_hours_for_class
        if notes is not None:
            assignment.notes = notes
        
        assignment.save()
        return assignment
    
    @staticmethod
    def soft_delete(assignment_id: int) -> bool:
        """
        Atama kaydını soft delete yap
        
        Args:
            assignment_id: Atama ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        assignment = ClassLessonTeacherAssignmentRepository.get_by_id(assignment_id)
        if not assignment:
            return False
        
        assignment.is_active = False
        assignment.save()
        return True
    
    @staticmethod
    def hard_delete(assignment_id: int) -> bool:
        """
        Atama kaydını kalıcı olarak sil
        
        Args:
            assignment_id: Atama ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        try:
            assignment = ClassLessonTeacherAssignment.objects.get(id=assignment_id)
            assignment.delete()
            return True
        except ClassLessonTeacherAssignment.DoesNotExist:
            return False
