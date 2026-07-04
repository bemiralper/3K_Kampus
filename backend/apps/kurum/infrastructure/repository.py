"""
Kurum Repository
Data access layer following Repository Pattern
"""
from typing import List, Optional
from django.db.models import QuerySet, Q
from apps.kurum.domain.models import Kurum


class KurumRepository:
    """
    Repository for Kurum entity
    Handles all database operations
    """
    
    @staticmethod
    def get_all() -> QuerySet:
        """Get all institutions"""
        return Kurum.objects.all()
    
    @staticmethod
    def get_aktif() -> QuerySet:
        """Get only active institutions"""
        return Kurum.objects.filter(aktif_mi=True)
    
    @staticmethod
    def get_by_id(kurum_id: int) -> Optional[Kurum]:
        """Get institution by ID"""
        try:
            return Kurum.objects.get(id=kurum_id)
        except Kurum.DoesNotExist:
            return None
    
    @staticmethod
    def get_by_kod(kod: str) -> Optional[Kurum]:
        """Get institution by code"""
        try:
            return Kurum.objects.get(kod=kod)
        except Kurum.DoesNotExist:
            return None
    
    @staticmethod
    def create(data: dict) -> Kurum:
        """Create new institution"""
        return Kurum.objects.create(**data)
    
    @staticmethod
    def update(kurum_id: int, data: dict) -> Optional[Kurum]:
        """Update institution"""
        kurum = KurumRepository.get_by_id(kurum_id)
        if kurum:
            for key, value in data.items():
                setattr(kurum, key, value)
            kurum.save()
        return kurum
    
    @staticmethod
    def delete(kurum_id: int) -> bool:
        """Delete institution (hard delete)"""
        kurum = KurumRepository.get_by_id(kurum_id)
        if kurum:
            kurum.delete()
            return True
        return False
    
    @staticmethod
    def search(query: str) -> QuerySet:
        """Search institutions by name or code"""
        return Kurum.objects.filter(
            Q(ad__icontains=query) | Q(kod__icontains=query)
        )
    
    @staticmethod
    def exists(kurum_id: int) -> bool:
        """Check if institution exists"""
        return Kurum.objects.filter(id=kurum_id).exists()
