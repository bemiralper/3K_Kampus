"""
StudentClassPlacement Repository

Öğrenci Sınıf Yerleşimi veri erişim katmanı
"""
from typing import Optional, List
from django.db import models
from django.db.models import QuerySet, Count, F

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.services.active_academic_year import get_active_academic_year


class StudentClassPlacementRepository:
    """
    StudentClassPlacement Repository
    
    CRUD ve filtreleme işlemleri
    Aktif akademik yıl otomatik filtrelenir
    """
    
    @staticmethod
    def get_by_id(placement_id: int) -> Optional[StudentClassPlacement]:
        """ID ile yerleşim getir"""
        try:
            return StudentClassPlacement.objects.select_related(
                'academic_year', 'term', 'student', 'classroom', 'group'
            ).get(id=placement_id, is_active=True)
        except StudentClassPlacement.DoesNotExist:
            return None
    
    @staticmethod
    def list_by_classroom(classroom_id: int) -> QuerySet[StudentClassPlacement]:
        """
        Sınıfa göre yerleşimleri listele (aktif yıl)
        
        Args:
            classroom_id: Sınıf ID
            
        Returns:
            Yerleşim QuerySet
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            classroom_id=classroom_id,
            is_active=True
        ).select_related(
            'term', 'student', 'classroom', 'group'
        ).order_by('student__ad', 'student__soyad')
    
    @staticmethod
    def list_by_classroom_and_term(classroom_id: int, term_id: int) -> QuerySet[StudentClassPlacement]:
        """
        Sınıf ve döneme göre yerleşimleri listele
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Yerleşim QuerySet
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            classroom_id=classroom_id,
            term_id=term_id,
            is_active=True
        ).select_related(
            'term', 'student', 'classroom', 'group'
        ).order_by('student__ad', 'student__soyad')
    
    @staticmethod
    def list_by_term(term_id: int) -> QuerySet[StudentClassPlacement]:
        """
        Döneme göre yerleşimleri listele
        
        Args:
            term_id: Dönem ID
            
        Returns:
            Yerleşim QuerySet
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            term_id=term_id,
            is_active=True
        ).select_related(
            'term', 'student', 'classroom', 'group'
        ).order_by('classroom__ad', 'student__ad', 'student__soyad')
    
    @staticmethod
    def list_by_group(group_id: int) -> QuerySet[StudentClassPlacement]:
        """
        Gruba göre yerleşimleri listele
        
        Args:
            group_id: Grup ID
            
        Returns:
            Yerleşim QuerySet
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            group_id=group_id,
            is_active=True
        ).select_related(
            'term', 'student', 'classroom', 'group'
        ).order_by('student__ad', 'student__soyad')
    
    @staticmethod
    def list_by_student(student_id: int) -> QuerySet[StudentClassPlacement]:
        """
        Öğrenciye göre yerleşimleri listele
        
        Args:
            student_id: Öğrenci ID
            
        Returns:
            Yerleşim QuerySet
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            student_id=student_id,
            is_active=True
        ).select_related(
            'term', 'student', 'classroom', 'group'
        ).order_by('term__order_no')
    
    @staticmethod
    def get_classroom_student_count(classroom_id: int, term_id: int) -> int:
        """
        Sınıftaki aktif öğrenci sayısını getir
        
        Args:
            classroom_id: Sınıf ID
            term_id: Dönem ID
            
        Returns:
            Öğrenci sayısı
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            classroom_id=classroom_id,
            term_id=term_id,
            is_active=True
        ).count()
    
    @staticmethod
    def get_group_student_count(group_id: int, term_id: int) -> int:
        """
        Gruptaki aktif öğrenci sayısını getir
        
        Args:
            group_id: Grup ID
            term_id: Dönem ID
            
        Returns:
            Öğrenci sayısı
        """
        active_year = get_active_academic_year()
        return StudentClassPlacement.objects.filter(
            academic_year=active_year,
            group_id=group_id,
            term_id=term_id,
            is_active=True
        ).count()
    
    @staticmethod
    def check_duplicate(term_id: int, student_id: int, exclude_id: Optional[int] = None) -> bool:
        """
        Aynı dönemde öğrenci zaten yerleştirilmiş mi kontrol et
        
        Args:
            term_id: Dönem ID
            student_id: Öğrenci ID
            exclude_id: Hariç tutulacak yerleşim ID (güncelleme için)
            
        Returns:
            bool: Duplicate var mı
        """
        active_year = get_active_academic_year()
        queryset = StudentClassPlacement.objects.filter(
            academic_year=active_year,
            term_id=term_id,
            student_id=student_id,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()
    
    @staticmethod
    def get_existing_placement(term_id: int, student_id: int) -> Optional[StudentClassPlacement]:
        """
        Mevcut yerleşimi getir (bulk assign için upsert)
        
        Args:
            term_id: Dönem ID
            student_id: Öğrenci ID
            
        Returns:
            Mevcut yerleşim veya None
        """
        active_year = get_active_academic_year()
        try:
            return StudentClassPlacement.objects.get(
                academic_year=active_year,
                term_id=term_id,
                student_id=student_id,
                is_active=True
            )
        except StudentClassPlacement.DoesNotExist:
            return None
    
    @staticmethod
    def create(data: dict) -> StudentClassPlacement:
        """
        Yeni yerleşim oluştur
        
        Args:
            data: Yerleşim verileri
            
        Returns:
            Oluşturulan yerleşim
        """
        # Aktif yılı otomatik ekle
        if 'academic_year' not in data or data['academic_year'] is None:
            data['academic_year'] = get_active_academic_year()
        
        return StudentClassPlacement.objects.create(**data)
    
    @staticmethod
    def update(placement: StudentClassPlacement, data: dict) -> StudentClassPlacement:
        """
        Yerleşim güncelle
        
        Args:
            placement: Güncellenecek yerleşim
            data: Yeni veriler
            
        Returns:
            Güncellenen yerleşim
        """
        for key, value in data.items():
            if key != 'academic_year':  # academic_year değiştirilemez
                setattr(placement, key, value)
        placement.save()
        return placement
    
    @staticmethod
    def soft_delete(placement: StudentClassPlacement) -> StudentClassPlacement:
        """
        Soft delete
        
        Args:
            placement: Silinecek yerleşim
            
        Returns:
            Silinen yerleşim
        """
        placement.is_active = False
        placement.save()
        return placement
    
    @staticmethod
    def bulk_create(placements: List[dict]) -> List[StudentClassPlacement]:
        """
        Toplu yerleşim oluştur
        
        Args:
            placements: Yerleşim verileri listesi
            
        Returns:
            Oluşturulan yerleşimler
        """
        active_year = get_active_academic_year()
        
        placement_objects = []
        for data in placements:
            data['academic_year'] = active_year
            placement_objects.append(StudentClassPlacement(**data))
        
        return StudentClassPlacement.objects.bulk_create(placement_objects)
