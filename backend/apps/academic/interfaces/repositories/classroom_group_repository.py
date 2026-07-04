"""
ClassroomGroup Repository

Sınıf Alt Grubu veri erişim katmanı
"""
from typing import Optional
from django.db.models import QuerySet, Count

from apps.academic.domain.classroom_group import ClassroomGroup


class ClassroomGroupRepository:
    """
    ClassroomGroup Repository
    
    CRUD ve filtreleme işlemleri
    """
    
    @staticmethod
    def get_by_id(group_id: int) -> Optional[ClassroomGroup]:
        """ID ile grup getir"""
        try:
            return ClassroomGroup.objects.select_related('classroom').get(
                id=group_id,
                is_active=True
            )
        except ClassroomGroup.DoesNotExist:
            return None
    
    @staticmethod
    def list_by_classroom(classroom_id: int) -> QuerySet[ClassroomGroup]:
        """
        Sınıfa göre grupları listele
        
        Args:
            classroom_id: Sınıf ID
            
        Returns:
            Grup QuerySet
        """
        return ClassroomGroup.objects.filter(
            classroom_id=classroom_id,
            is_active=True
        ).select_related('classroom').annotate(
            student_count=Count('placements', filter=models.Q(placements__is_active=True))
        ).order_by('name')
    
    @staticmethod
    def list_all() -> QuerySet[ClassroomGroup]:
        """Tüm aktif grupları listele"""
        return ClassroomGroup.objects.filter(
            is_active=True
        ).select_related('classroom').order_by('classroom__ad', 'name')
    
    @staticmethod
    def create(data: dict) -> ClassroomGroup:
        """
        Yeni grup oluştur
        
        Args:
            data: Grup verileri
            
        Returns:
            Oluşturulan grup
        """
        return ClassroomGroup.objects.create(**data)
    
    @staticmethod
    def update(group: ClassroomGroup, data: dict) -> ClassroomGroup:
        """
        Grup güncelle
        
        Args:
            group: Güncellenecek grup
            data: Yeni veriler
            
        Returns:
            Güncellenen grup
        """
        for key, value in data.items():
            setattr(group, key, value)
        group.save()
        return group
    
    @staticmethod
    def soft_delete(group: ClassroomGroup) -> ClassroomGroup:
        """
        Soft delete
        
        Args:
            group: Silinecek grup
            
        Returns:
            Silinen grup
        """
        group.is_active = False
        group.save()
        return group
    
    @staticmethod
    def check_duplicate(classroom_id: int, name: str, exclude_id: Optional[int] = None) -> bool:
        """
        Aynı isimde grup var mı kontrol et
        
        Args:
            classroom_id: Sınıf ID
            name: Grup adı
            exclude_id: Hariç tutulacak grup ID (güncelleme için)
            
        Returns:
            bool: Duplicate var mı
        """
        queryset = ClassroomGroup.objects.filter(
            classroom_id=classroom_id,
            name=name,
            is_active=True
        )
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return queryset.exists()


# models import for annotate
from django.db import models
