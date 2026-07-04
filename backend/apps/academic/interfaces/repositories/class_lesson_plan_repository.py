"""
ClassLessonPlan Repository

CRUD işlemleri ve soft delete desteği ile.
"""
from typing import Optional, List
from django.db.models import QuerySet

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.services.active_academic_year import get_active_academic_year


class ClassLessonPlanRepository:
    """
    Sınıf Ders Planı Repository
    
    Tüm veritabanı işlemleri bu sınıf üzerinden yapılır.
    """
    
    # ==================== OKUMA İŞLEMLERİ ====================
    
    @staticmethod
    def get_by_id(plan_id: int) -> Optional[ClassLessonPlan]:
        """
        ID ile plan getir
        
        Args:
            plan_id: Plan ID
            
        Returns:
            ClassLessonPlan veya None
        """
        try:
            return ClassLessonPlan.objects.get(id=plan_id, is_active=True)
        except ClassLessonPlan.DoesNotExist:
            return None
    
    @staticmethod
    def get_all_active() -> QuerySet[ClassLessonPlan]:
        """Tüm aktif planları getir"""
        return ClassLessonPlan.objects.filter(is_active=True)
    
    @staticmethod
    def filter_by_classroom(classroom_id: int) -> QuerySet[ClassLessonPlan]:
        """
        Sınıfa göre filtrele
        
        Args:
            classroom_id: Sınıf ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonPlan.objects.filter(
            sinif_id=classroom_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen', 'term', 'sinif')
    
    @staticmethod
    def filter_by_term(term_id: int) -> QuerySet[ClassLessonPlan]:
        """
        Döneme göre filtrele
        
        Args:
            term_id: Dönem ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonPlan.objects.filter(
            term_id=term_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen', 'term', 'sinif')
    
    @staticmethod
    def filter_by_classroom_and_term(
        classroom_id: int, 
        term_id: int
    ) -> QuerySet[ClassLessonPlan]:
        """
        Sınıf ve döneme göre filtrele
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonPlan.objects.filter(
            sinif_id=classroom_id,
            term_id=term_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen', 'term', 'sinif').order_by('ders__ad')
    
    @staticmethod
    def filter_by_teacher(teacher_id: int) -> QuerySet[ClassLessonPlan]:
        """
        Öğretmene göre filtrele
        
        Args:
            teacher_id: Öğretmen ID
            
        Returns:
            Filtrelenmiş QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonPlan.objects.filter(
            ogretmen_id=teacher_id,
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen', 'term', 'sinif')
    
    @staticmethod
    def list_all_for_active_year() -> QuerySet[ClassLessonPlan]:
        """
        Aktif eğitim yılındaki tüm planları listele
        
        Returns:
            Tüm planlar QuerySet
        """
        active_year = get_active_academic_year()
        return ClassLessonPlan.objects.filter(
            egitim_yili=active_year,
            is_active=True
        ).select_related('ders', 'ogretmen', 'term', 'sinif').order_by('sinif__ad', 'ders__ad')
    
    @staticmethod
    def check_duplicate(
        term_id: int,
        classroom_id: int,
        lesson_id: int,
        exclude_id: Optional[int] = None
    ) -> bool:
        """
        Aynı dönem+sınıf+ders kombinasyonunun var olup olmadığını kontrol et
        
        Args:
            term_id: Dönem ID
            classroom_id: Sınıf ID
            lesson_id: Ders ID
            exclude_id: Hariç tutulacak plan ID (güncelleme için)
            
        Returns:
            bool: Duplicate var mı
        """
        active_year = get_active_academic_year()
        queryset = ClassLessonPlan.objects.filter(
            egitim_yili=active_year,
            term_id=term_id,
            sinif_id=classroom_id,
            ders_id=lesson_id,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    # ==================== YAZMA İŞLEMLERİ ====================
    
    @staticmethod
    def create(data: dict) -> ClassLessonPlan:
        """
        Yeni plan oluştur
        
        Args:
            data: Plan verileri
            
        Returns:
            Oluşturulan ClassLessonPlan
        """
        # Aktif yılı otomatik ekle
        active_year = get_active_academic_year()
        data['egitim_yili'] = active_year
        
        plan = ClassLessonPlan(**data)
        plan.save()
        return plan
    
    @staticmethod
    def update(plan: ClassLessonPlan, data: dict) -> ClassLessonPlan:
        """
        Plan güncelle
        
        Args:
            plan: Güncellenecek plan
            data: Yeni veriler
            
        Returns:
            Güncellenen ClassLessonPlan
        """
        # egitim_yili güncellenmemeli
        data.pop('egitim_yili', None)
        data.pop('egitim_yili_id', None)
        
        for key, value in data.items():
            setattr(plan, key, value)
        
        plan.save()
        return plan
    
    @staticmethod
    def soft_delete(plan: ClassLessonPlan) -> ClassLessonPlan:
        """
        Soft delete - is_active = False
        
        Args:
            plan: Silinecek plan
            
        Returns:
            Silinen ClassLessonPlan
        """
        plan.is_active = False
        plan.save(update_fields=['is_active', 'updated_at'])
        return plan
    
    @staticmethod
    def hard_delete(plan: ClassLessonPlan) -> None:
        """
        Hard delete - Veritabanından sil
        
        Args:
            plan: Silinecek plan
        """
        plan.delete()
    
    # ==================== TOPLU İŞLEMLER ====================
    
    @staticmethod
    def bulk_create(plans_data: List[dict]) -> List[ClassLessonPlan]:
        """
        Toplu oluşturma
        
        Args:
            plans_data: Plan verileri listesi
            
        Returns:
            Oluşturulan planlar
        """
        active_year = get_active_academic_year()
        plans = []
        
        for data in plans_data:
            data['egitim_yili'] = active_year
            plans.append(ClassLessonPlan(**data))
        
        return ClassLessonPlan.objects.bulk_create(plans)
    
    @staticmethod
    def get_total_weekly_hours(classroom_id: int, term_id: int) -> int:
        """
        Sınıfın toplam haftalık ders saatini hesapla
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Toplam haftalık saat
        """
        from django.db.models import Sum
        
        active_year = get_active_academic_year()
        result = ClassLessonPlan.objects.filter(
            sinif_id=classroom_id,
            term_id=term_id,
            egitim_yili=active_year,
            is_active=True
        ).aggregate(total=Sum('weekly_hours'))
        
        return result['total'] or 0
