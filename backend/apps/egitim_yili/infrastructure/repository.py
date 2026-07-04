"""
EgitimYili Repository
Data access layer following Repository Pattern
"""
from typing import Optional
from django.db.models import QuerySet
from apps.egitim_yili.domain.models import EgitimYili


class EgitimYiliRepository:
    """
    Repository for EgitimYili entity
    """
    
    @staticmethod
    def get_all() -> QuerySet:
        """Get all education years"""
        return EgitimYili.objects.select_related('kurum', 'sube').all()
    
    @staticmethod
    def get_by_kurum_sube(kurum_id: int, sube_id: int) -> QuerySet:
        """Get education years by institution and branch"""
        return EgitimYili.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id
        ).order_by('-yil')
    
    @staticmethod
    def get_aktif(kurum_id: int, sube_id: int) -> QuerySet:
        """Get active education years"""
        return EgitimYili.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            aktif_mi=True
        )
    
    @staticmethod
    def get_by_id(egitim_yili_id: int) -> Optional[EgitimYili]:
        """Get education year by ID"""
        try:
            return EgitimYili.objects.select_related('kurum', 'sube').get(id=egitim_yili_id)
        except EgitimYili.DoesNotExist:
            return None
    
    @staticmethod
    def create(data: dict) -> EgitimYili:
        """Create new education year"""
        return EgitimYili.objects.create(**data)
    
    @staticmethod
    def update(egitim_yili_id: int, data: dict) -> Optional[EgitimYili]:
        """Update education year"""
        egitim_yili = EgitimYiliRepository.get_by_id(egitim_yili_id)
        if egitim_yili:
            for key, value in data.items():
                setattr(egitim_yili, key, value)
            egitim_yili.save()
        return egitim_yili
    
    @staticmethod
    def delete(egitim_yili_id: int) -> bool:
        """Delete education year (hard delete)"""
        egitim_yili = EgitimYiliRepository.get_by_id(egitim_yili_id)
        if egitim_yili:
            egitim_yili.delete()
            return True
        return False
