"""
EgitimYili Service
Business logic layer
"""
from typing import List, Optional
from django.db import transaction
from apps.egitim_yili.infrastructure.repository import EgitimYiliRepository
from apps.egitim_yili.domain.models import EgitimYili
from shared.db.schema_manager import SchemaManager


class EgitimYiliService:
    """
    Service for EgitimYili business logic
    """
    
    def __init__(self):
        self.repository = EgitimYiliRepository()
        self.schema_manager = SchemaManager()
    
    def list_egitim_yillari(self, kurum_id: int = None, sube_id: int = None) -> List[EgitimYili]:
        """List education years"""
        if kurum_id and sube_id:
            return list(self.repository.get_by_kurum_sube(kurum_id, sube_id))
        return list(self.repository.get_all())
    
    def get_egitim_yili(self, egitim_yili_id: int) -> Optional[EgitimYili]:
        """Get education year by ID"""
        return self.repository.get_by_id(egitim_yili_id)
    
    def get_egitim_yili_by_id(self, egitim_yili_id: int) -> Optional[EgitimYili]:
        """Get education year by ID (alias for consistency)"""
        return self.get_egitim_yili(egitim_yili_id)
    
    @transaction.atomic
    def create_egitim_yili(self, data: dict, create_schema: bool = True) -> EgitimYili:
        """
        Create new education year
        Optionally creates PostgreSQL schema
        """
        self._validate_egitim_yili_data(data)
        
        egitim_yili = self.repository.create(data)
        
        # Create schema if requested
        if create_schema:
            self.schema_manager.create_schema(egitim_yili.schema_adi)
        
        return egitim_yili
    
    @transaction.atomic
    def update_egitim_yili(self, egitim_yili_id: int, data: dict) -> Optional[EgitimYili]:
        """Update education year"""
        self._validate_egitim_yili_data(data, is_update=True)
        return self.repository.update(egitim_yili_id, data)
    
    def get_egitim_yili_delete_info(self, egitim_yili_id: int) -> dict:
        """
        Get deletion impact information
        
        Args:
            egitim_yili_id: Education year ID
            
        Returns:
            dict: Deletion impact info
        """
        egitim_yili = self.repository.get_by_id(egitim_yili_id)
        if not egitim_yili:
            return {'exists': False}
        
        return {
            'exists': True,
            'yil': egitim_yili.yil,
            'kurum_ad': egitim_yili.kurum.ad,
            'sube_ad': egitim_yili.sube.ad,
            'schema_adi': egitim_yili.schema_adi
        }
    
    def delete_egitim_yili(self, egitim_yili_id: int) -> bool:
        """Delete education year (hard delete with schema drop)"""
        return self.repository.delete(egitim_yili_id)
    
    def _validate_egitim_yili_data(self, data: dict, is_update: bool = False) -> None:
        """Validate education year data"""
        if not is_update:
            if 'yil' not in data:
                raise ValueError("Eğitim yılı zorunludur")
            if 'kurum_id' not in data:
                raise ValueError("Kurum seçilmelidir")
            if 'sube_id' not in data:
                raise ValueError("Şube seçilmelidir")
        
        if 'yil' in data:
            # Basic validation for year format (e.g., 2024-2025)
            yil = data['yil']
            if '-' not in yil or len(yil.split('-')) != 2:
                raise ValueError("Eğitim yılı formatı hatalı (Örn: 2024-2025)")
