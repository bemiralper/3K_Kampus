"""
Sube Repository
Data access layer following Repository Pattern
"""
from typing import Optional
from django.db.models import QuerySet, Q
from apps.sube.domain.models import Sube


class SubeRepository:
    """
    Repository for Sube entity
    """
    
    @staticmethod
    def get_all() -> QuerySet:
        """Get all branches"""
        return Sube.objects.select_related('kurum').all()
    
    @staticmethod
    def get_by_kurum(kurum_id: int) -> QuerySet:
        """Get branches by institution"""
        return Sube.objects.filter(kurum_id=kurum_id)
    
    @staticmethod
    def get_by_id(sube_id: int) -> Optional[Sube]:
        """Get branch by ID"""
        try:
            return Sube.objects.select_related('kurum').get(id=sube_id)
        except Sube.DoesNotExist:
            return None
    
    @staticmethod
    def create(data: dict) -> Sube:
        """Create new branch"""
        return Sube.objects.create(**data)
    
    @staticmethod
    def update(sube_id: int, data: dict) -> Optional[Sube]:
        """Update branch"""
        sube = SubeRepository.get_by_id(sube_id)
        if sube:
            for key, value in data.items():
                setattr(sube, key, value)
            sube.save()
        return sube
    
    @staticmethod
    def delete(sube_id: int) -> bool:
        """Delete branch (hard delete)"""
        sube = SubeRepository.get_by_id(sube_id)
        if sube:
            sube.delete()
            return True
        return False
    
    @staticmethod
    def search(kurum_id: int, query: str) -> QuerySet:
        """Search branches"""
        return Sube.objects.filter(
            kurum_id=kurum_id
        ).filter(
            Q(ad__icontains=query) | Q(kod__icontains=query)
        )
