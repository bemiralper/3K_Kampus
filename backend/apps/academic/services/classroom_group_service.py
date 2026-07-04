"""
ClassroomGroup Service

Sınıf Alt Grubu iş mantığı ve validasyonları
"""
from typing import Dict, Any, Optional

from apps.academic.domain.classroom_group import ClassroomGroup
from apps.academic.interfaces.repositories.classroom_group_repository import ClassroomGroupRepository


class ClassroomGroupValidationError(Exception):
    """ClassroomGroup validasyon hatası"""
    def __init__(self, message: str, field: str = None):
        self.message = message
        self.field = field
        super().__init__(message)


class ClassroomGroupService:
    """
    ClassroomGroup Service
    
    İş mantığı ve validasyonlar
    """
    
    def __init__(self):
        self.repository = ClassroomGroupRepository()
    
    # ==================== VALIDASYONLAR ====================
    
    def validate_create(self, data: Dict[str, Any]) -> None:
        """
        Oluşturma validasyonu
        
        Raises:
            ClassroomGroupValidationError
        """
        # Zorunlu alanlar
        if not data.get('classroom_id'):
            raise ClassroomGroupValidationError('Sınıf seçimi zorunludur.', 'classroom_id')
        
        if not data.get('name'):
            raise ClassroomGroupValidationError('Grup adı zorunludur.', 'name')
        
        # Duplicate kontrolü
        if self.repository.check_duplicate(data['classroom_id'], data['name']):
            raise ClassroomGroupValidationError(
                'Bu sınıfta aynı isimde grup zaten var.',
                'name'
            )
        
        # Kapasite kontrolü
        if data.get('capacity') is not None and data['capacity'] < 0:
            raise ClassroomGroupValidationError(
                'Kapasite negatif olamaz.',
                'capacity'
            )
    
    def validate_update(self, group: ClassroomGroup, data: Dict[str, Any]) -> None:
        """
        Güncelleme validasyonu
        
        Raises:
            ClassroomGroupValidationError
        """
        # İsim değiştiyse duplicate kontrolü
        if data.get('name') and data['name'] != group.name:
            if self.repository.check_duplicate(group.classroom_id, data['name'], group.id):
                raise ClassroomGroupValidationError(
                    'Bu sınıfta aynı isimde grup zaten var.',
                    'name'
                )
        
        # Kapasite kontrolü
        if data.get('capacity') is not None and data['capacity'] < 0:
            raise ClassroomGroupValidationError(
                'Kapasite negatif olamaz.',
                'capacity'
            )
    
    # ==================== İŞ KATMANI ====================
    
    def get_by_id(self, group_id: int) -> Optional[ClassroomGroup]:
        """ID ile grup getir"""
        return self.repository.get_by_id(group_id)
    
    def list_by_classroom(self, classroom_id: int):
        """Sınıfa göre grupları listele"""
        return self.repository.list_by_classroom(classroom_id)
    
    def list_all(self):
        """Tüm aktif grupları listele"""
        return self.repository.list_all()
    
    def create(self, data: Dict[str, Any]) -> ClassroomGroup:
        """
        Yeni grup oluştur
        
        Args:
            data: Grup verileri
            
        Returns:
            Oluşturulan grup
            
        Raises:
            ClassroomGroupValidationError
        """
        self.validate_create(data)
        
        create_data = {
            'classroom_id': data['classroom_id'],
            'name': data['name'],
            'capacity': data.get('capacity'),
        }
        
        return self.repository.create(create_data)
    
    def update(self, group_id: int, data: Dict[str, Any]) -> ClassroomGroup:
        """
        Grup güncelle
        
        Args:
            group_id: Grup ID
            data: Yeni veriler
            
        Returns:
            Güncellenen grup
            
        Raises:
            ClassroomGroupValidationError
        """
        group = self.repository.get_by_id(group_id)
        if not group:
            raise ClassroomGroupValidationError('Grup bulunamadı.')
        
        self.validate_update(group, data)
        
        update_data = {}
        if 'name' in data:
            update_data['name'] = data['name']
        if 'capacity' in data:
            update_data['capacity'] = data['capacity']
        
        return self.repository.update(group, update_data)
    
    def delete(self, group_id: int) -> ClassroomGroup:
        """
        Grup sil (soft delete)
        
        Args:
            group_id: Grup ID
            
        Returns:
            Silinen grup
            
        Raises:
            ClassroomGroupValidationError
        """
        group = self.repository.get_by_id(group_id)
        if not group:
            raise ClassroomGroupValidationError('Grup bulunamadı.')
        
        return self.repository.soft_delete(group)
