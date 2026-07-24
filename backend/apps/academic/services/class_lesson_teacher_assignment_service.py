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
)
from apps.academic.services.teacher_availability_service import (
    get_teacher_gorevlendirme,
    is_ogretmen_gorevlendirme,
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
    - Öğretmen aktif + şube/yıl öğretmen görevlendirmesi zorunlu
    - Dönem schedule_locked ise yazma yok
    - PRIMARY atama ClassLessonPlan.ogretmen ile senkron tutulur
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

        self._validate_plan_writable(plan)
        
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
        
        # Öğretmen aktiflik + görevlendirme
        self._validate_teacher_active(teacher_id)
        self._validate_teacher_gorevlendirme(teacher_id, plan)
        
        # Branş havuzu zorunlu değil (havuz verisi dolmadan kilitlenmesin)
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

        self._validate_plan_writable(assignment.class_lesson_plan)
        
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
            return ClassLessonPlan.objects.select_related(
                'sinif', 'term', 'ders',
            ).get(id=plan_id, is_active=True)
        except ClassLessonPlan.DoesNotExist:
            return None

    def _validate_plan_writable(self, plan) -> None:
        if plan.term_id and getattr(plan.term, 'schedule_locked', False):
            raise ClassLessonTeacherAssignmentValidationError(
                'Bu dönemin programı kilitli; öğretmen ataması değiştirilemez.',
                'term',
            )
    
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

    def _validate_teacher_gorevlendirme(self, teacher_id: int, plan) -> None:
        """Şube + aktif yıl öğretmen görevlendirmesi zorunlu."""
        active_year = get_active_academic_year()
        sinif = plan.sinif
        gorev = get_teacher_gorevlendirme(
            teacher_id,
            kurum_id=sinif.kurum_id,
            sube_id=sinif.sube_id,
            egitim_yili_id=active_year.id,
        )
        if not gorev or not is_ogretmen_gorevlendirme(gorev):
            raise ClassLessonTeacherAssignmentValidationError(
                'Öğretmen bu şube ve eğitim yılında aktif öğretmen görevlendirmesine sahip değil.',
                'ogretmen_id',
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

    def _sync_plan_primary_teacher(self, plan_id: int) -> None:
        """PRIMARY atamayı ClassLessonPlan.ogretmen ile hizala (özet/UI tutarlılığı)."""
        from apps.academic.domain.class_lesson_plan import ClassLessonPlan

        primary = self.repository.get_primary_teacher(plan_id)
        ClassLessonPlan.objects.filter(pk=plan_id, is_active=True).update(
            ogretmen_id=primary.ogretmen_id if primary else None,
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
        role = data.get('role', TeacherRole.PRIMARY)
        
        assignment = self.repository.create(
            plan_id=plan_id,
            teacher_id=teacher_id,
            role=role,
            priority=data.get('priority', 1),
            max_hours_for_class=data.get('max_hours_for_class'),
            notes=data.get('notes')
        )
        if role == TeacherRole.PRIMARY:
            self._sync_plan_primary_teacher(plan_id)
        return assignment
    
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
        before = self.repository.get_by_id(assignment_id)
        
        assignment = self.repository.update(
            assignment_id=assignment_id,
            role=data.get('role'),
            priority=data.get('priority'),
            max_hours_for_class=data.get('max_hours_for_class'),
            notes=data.get('notes')
        )
        if assignment and before and (
            data.get('role') is not None
            or before.role == TeacherRole.PRIMARY
            or assignment.role == TeacherRole.PRIMARY
        ):
            self._sync_plan_primary_teacher(assignment.class_lesson_plan_id)
        return assignment
    
    def delete(self, assignment_id: int) -> bool:
        """
        Atama kaydını soft delete yap
        
        Args:
            assignment_id: Atama ID
            
        Returns:
            bool: İşlem başarılı mı
        """
        assignment = self.repository.get_by_id(assignment_id)
        if not assignment:
            return False
        self._validate_plan_writable(assignment.class_lesson_plan)
        plan_id = assignment.class_lesson_plan_id
        was_primary = assignment.role == TeacherRole.PRIMARY
        ok = self.repository.soft_delete(assignment_id)
        if ok and was_primary:
            self._sync_plan_primary_teacher(plan_id)
        return ok
    
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
