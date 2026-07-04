"""
Kurum Service
Business logic layer following Service Pattern
"""
from typing import List, Optional
from django.db import transaction
from apps.kurum.infrastructure.repository import KurumRepository
from apps.kurum.domain.models import Kurum
from shared.exceptions import InvalidTenantException


class KurumService:
    """
    Service for Kurum business logic
    Coordinates between repository and views
    """
    
    def __init__(self):
        self.repository = KurumRepository()
    
    def list_all_kurumlar(self) -> List[Kurum]:
        """List all institutions"""
        return list(self.repository.get_all())
    
    def list_aktif_kurumlar(self) -> List[Kurum]:
        """List only active institutions"""
        return list(self.repository.get_aktif())
    
    def get_kurum(self, kurum_id: int) -> Optional[Kurum]:
        """Get institution by ID"""
        return self.repository.get_by_id(kurum_id)
    
    def get_kurum_by_id(self, kurum_id: int) -> Optional[Kurum]:
        """Get institution by ID (alias for consistency)"""
        return self.get_kurum(kurum_id)
    
    def get_kurum_by_kod(self, kod: str) -> Optional[Kurum]:
        """Get institution by code"""
        return self.repository.get_by_kod(kod)
    
    @transaction.atomic
    def create_kurum(self, data: dict) -> Kurum:
        """
        Create new institution
        
        Args:
            data: Institution data
            
        Returns:
            Created Kurum instance
            
        Raises:
            InvalidTenantException: If validation fails
        """
        # Validate
        self._validate_kurum_data(data)
        
        # Check for duplicate code
        if 'kod' in data:
            existing = self.repository.get_by_kod(data['kod'])
            if existing:
                raise InvalidTenantException(f"Kurum kodu zaten mevcut: {data['kod']}")
        
        # Create
        kurum = self.repository.create(data)
        
        return kurum
    
    @transaction.atomic
    def update_kurum(self, kurum_id: int, data: dict) -> Optional[Kurum]:
        """
        Update institution
        
        Args:
            kurum_id: Institution ID
            data: Updated data
            
        Returns:
            Updated Kurum instance
        """
        # Validate
        self._validate_kurum_data(data, is_update=True)
        
        # Update
        return self.repository.update(kurum_id, data)
    
    def get_kurum_delete_info(self, kurum_id: int) -> dict:
        """
        Get deletion impact information
        
        Args:
            kurum_id: Institution ID
            
        Returns:
            dict: Deletion impact info
        """
        kurum = self.repository.get_by_id(kurum_id)
        if not kurum:
            return {'exists': False}
        
        sube_count = kurum.subeler.count()
        egitim_yili_count = sum(sube.egitim_yillari.count() for sube in kurum.subeler.all())
        
        return {
            'exists': True,
            'ad': kurum.ad,
            'sube_count': sube_count,
            'egitim_yili_count': egitim_yili_count,
            'has_children': sube_count > 0
        }
    
    def delete_kurum(self, kurum_id: int) -> bool:
        """
        Delete institution (hard delete with CASCADE)
        
        Args:
            kurum_id: Institution ID
            
        Returns:
            bool: Success status
        """
        return self.repository.delete(kurum_id)
    
    def search_kurumlar(self, query: str) -> List[Kurum]:
        """
        Search institutions
        
        Args:
            query: Search query
            
        Returns:
            List of matching institutions
        """
        return list(self.repository.search(query))
    
    def kurum_exists(self, kurum_id: int) -> bool:
        """Check if institution exists"""
        return self.repository.exists(kurum_id)
    
    def _validate_kurum_data(self, data: dict, is_update: bool = False) -> None:
        """
        Validate institution data
        
        Args:
            data: Data to validate
            is_update: Whether this is an update operation
            
        Raises:
            InvalidTenantException: If validation fails
        """
        if not is_update and 'ad' not in data:
            raise InvalidTenantException("Kurum adı zorunludur")
        
        if 'ad' in data and not data['ad'].strip():
            raise InvalidTenantException("Kurum adı boş olamaz")
        
        if 'email' in data and data['email']:
            # Basic email validation
            if '@' not in data['email']:
                raise InvalidTenantException("Geçerli bir e-posta adresi giriniz")
