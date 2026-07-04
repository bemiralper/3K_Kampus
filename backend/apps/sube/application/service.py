"""
Sube Service
Business logic layer
"""
from typing import List, Optional
from django.db import transaction
from apps.sube.infrastructure.repository import SubeRepository
from apps.sube.domain.models import Sube


class SubeService:
    """
    Service for Sube business logic
    """
    
    def __init__(self):
        self.repository = SubeRepository()
    
    def list_subeler(self, kurum_id: int = None) -> List[Sube]:
        """List branches, optionally filtered by institution"""
        if kurum_id:
            return list(self.repository.get_by_kurum(kurum_id))
        return list(self.repository.get_all())
    
    def get_sube(self, sube_id: int) -> Optional[Sube]:
        """Get branch by ID"""
        return self.repository.get_by_id(sube_id)
    
    def get_sube_by_id(self, sube_id: int) -> Optional[Sube]:
        """Get branch by ID (alias for consistency)"""
        return self.get_sube(sube_id)
    
    @transaction.atomic
    def create_sube(self, data: dict) -> Sube:
        """Create new branch"""
        self._validate_sube_data(data)
        return self.repository.create(data)
    
    @transaction.atomic
    def update_sube(self, sube_id: int, data: dict) -> Optional[Sube]:
        """Update branch"""
        self._validate_sube_data(data, is_update=True)
        return self.repository.update(sube_id, data)
    
    def get_sube_delete_info(self, sube_id: int) -> dict:
        """
        Get deletion impact information
        
        Args:
            sube_id: Branch ID
            
        Returns:
            dict: Deletion impact info
        """
        sube = self.repository.get_by_id(sube_id)
        if not sube:
            return {'exists': False}
        
        egitim_yili_count = sube.egitim_yillari.count()
        
        return {
            'exists': True,
            'ad': sube.ad,
            'kurum_ad': sube.kurum.ad,
            'egitim_yili_count': egitim_yili_count,
            'has_children': egitim_yili_count > 0
        }
    
    def delete_sube(self, sube_id: int) -> bool:
        """Delete branch (hard delete with CASCADE)"""
        return self.repository.delete(sube_id)
    
    def search_subeler(self, kurum_id: int, query: str) -> List[Sube]:
        """Search branches"""
        return list(self.repository.search(kurum_id, query))
    
    def _validate_sube_data(self, data: dict, is_update: bool = False) -> None:
        """Validate branch data"""
        if not is_update and 'ad' not in data:
            raise ValueError("Şube adı zorunludur")
        
        if 'ad' in data and not data['ad'].strip():
            raise ValueError("Şube adı boş olamaz")
        
        if not is_update and 'kurum' not in data and 'kurum_id' not in data:
            raise ValueError("Kurum seçilmelidir")
