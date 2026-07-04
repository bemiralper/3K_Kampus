"""
Ogrenci Service Layer
DDD Pattern - Application
"""
from datetime import date
from apps.ogrenci.infrastructure.repositories import OgrenciRepository, OgrenciKayitRepository
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit


class OgrenciService:
    """Service for Ogrenci operations"""
    
    def __init__(self):
        self.repository = OgrenciRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Tüm öğrencileri getir"""
        return self.repository.get_all(kurum_id, sube_id, aktif_only)
    
    def get_by_id(self, pk):
        """ID'ye göre öğrenci getir"""
        return self.repository.get_by_id(pk)
    
    def search(self, query, kurum_id=None, sube_id=None):
        """Öğrenci ara"""
        return self.repository.search(query, kurum_id, sube_id)
    
    def create(self, data):
        """Yeni öğrenci oluştur"""
        errors = self._validate(data)
        if errors:
            return None, errors
        
        # TC kontrolü
        if data.get('tc_kimlik_no'):
            existing = self.repository.get_by_tc(data['tc_kimlik_no'], data['kurum_id'])
            if existing:
                return None, {'tc_kimlik_no': 'Bu TC Kimlik No ile kayıtlı öğrenci var'}
        
        try:
            ogrenci = self.repository.create(data)
            return ogrenci, None
        except Exception as e:
            return None, {'error': str(e)}
    
    def update(self, pk, data):
        """Öğrenci güncelle"""
        errors = self._validate(data, is_update=True)
        if errors:
            return None, errors
        
        # Mevcut öğrenciyi al
        ogrenci = self.repository.get_by_id(pk)
        if not ogrenci:
            return None, {'error': 'Öğrenci bulunamadı'}
        
        # TC kontrolü (başka öğrencide kullanılıyor mu?)
        if data.get('tc_kimlik_no'):
            existing = self.repository.get_by_tc(data['tc_kimlik_no'], ogrenci.kurum_id)
            if existing and existing.id != pk:
                return None, {'tc_kimlik_no': 'Bu TC Kimlik No başka bir öğrenciye ait'}
        
        try:
            ogrenci = self.repository.update(pk, data)
            return ogrenci, None
        except Exception as e:
            return None, {'error': str(e)}
    
    def delete(self, pk):
        """Öğrenci pasife al"""
        try:
            success = self.repository.delete(pk)
            return success, None
        except Exception as e:
            return False, {'error': str(e)}
    
    def get_count(self, kurum_id=None, sube_id=None, aktif_only=True):
        """Öğrenci sayısı"""
        return self.repository.get_count(kurum_id, sube_id, aktif_only)
    
    def _validate(self, data, is_update=False):
        """Validasyon"""
        errors = {}
        
        if not is_update:
            if not data.get('kurum_id'):
                errors['kurum_id'] = 'Kurum zorunludur'
            if not data.get('sube_id'):
                errors['sube_id'] = 'Şube zorunludur'
        
        if not data.get('ad'):
            errors['ad'] = 'Ad zorunludur'
        if not data.get('soyad'):
            errors['soyad'] = 'Soyad zorunludur'
        
        # TC validasyonu
        tc = data.get('tc_kimlik_no')
        if tc:
            if len(tc) != 11 or not tc.isdigit():
                errors['tc_kimlik_no'] = 'TC Kimlik No 11 haneli olmalıdır'
        
        return errors if errors else None


class OgrenciKayitService:
    """Service for OgrenciKayit operations"""
    
    def __init__(self):
        self.repository = OgrenciKayitRepository()
    
    def get_all(self, kurum_id=None, sube_id=None, egitim_yili_id=None, sinif_id=None, aktif_only=True):
        """Tüm kayıtları getir"""
        return self.repository.get_all(kurum_id, sube_id, egitim_yili_id, sinif_id, aktif_only)
    
    def get_by_id(self, pk):
        """ID'ye göre kayıt getir"""
        return self.repository.get_by_id(pk)
    
    def create(self, data):
        """Yeni kayıt oluştur"""
        errors = self._validate(data)
        if errors:
            return None, errors
        
        # Aynı yılda kayıt kontrolü
        existing = self.repository.get_by_ogrenci_and_yil(
            data['ogrenci_id'], 
            data['egitim_yili_id']
        )
        if existing:
            return None, {'error': 'Bu öğrenci bu eğitim yılında zaten kayıtlı'}
        
        try:
            kayit = self.repository.create(data)
            return kayit, None
        except Exception as e:
            return None, {'error': str(e)}
    
    def update(self, pk, data):
        """Kayıt güncelle"""
        try:
            kayit = self.repository.update(pk, data)
            return kayit, None
        except Exception as e:
            return None, {'error': str(e)}
    
    def delete(self, pk):
        """Kayıt sil"""
        try:
            success = self.repository.delete(pk)
            return success, None
        except Exception as e:
            return False, {'error': str(e)}
    
    def get_students_by_sinif(self, sinif_id, egitim_yili_id):
        """Sınıftaki öğrencileri getir"""
        return self.repository.get_students_by_sinif(sinif_id, egitim_yili_id)
    
    def _validate(self, data):
        """Validasyon"""
        errors = {}
        
        if not data.get('ogrenci_id'):
            errors['ogrenci_id'] = 'Öğrenci zorunludur'
        if not data.get('sinif_id'):
            errors['sinif_id'] = 'Sınıf zorunludur'
        if not data.get('egitim_yili_id'):
            errors['egitim_yili_id'] = 'Eğitim yılı zorunludur'
        
        return errors if errors else None
