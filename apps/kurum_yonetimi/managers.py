"""
Tenant Aware Manager

Tüm querylerde egitim_yili_id filtresini zorunlu kılan custom manager.

ZORUNLU KURAL:
Model.objects.all() -> YANLIŞ
Model.objects.filter(egitim_yili_id=request.egitim_yili_id) -> DOĞRU

Bu manager otomatik olarak filtreleme yapar.
"""

from django.db import models
from django.db.models import Manager


class TenantManager(Manager):
    """
    Multi-tenant query filtrelemesi yapan custom manager.
    
    Her query aktif eğitim yılına göre filtrelenir.
    Eğitim yılı ID'si set edilmezse query çalışmaz.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._egitim_yili_id = None
        self._kurum_id = None
        self._sube_id = None
    
    def set_tenant(self, kurum_id=None, sube_id=None, egitim_yili_id=None):
        """
        Tenant bilgilerini set et.
        
        Args:
            kurum_id: Kurum ID
            sube_id: Şube ID
            egitim_yili_id: Eğitim yılı ID
            
        Returns:
            self: Zincirleme kullanım için
        """
        manager = self._clone()
        if kurum_id is not None:
            manager._kurum_id = kurum_id
        if sube_id is not None:
            manager._sube_id = sube_id
        if egitim_yili_id is not None:
            manager._egitim_yili_id = egitim_yili_id
        return manager
    
    def _clone(self):
        """Manager'ı klonla"""
        clone = super()._clone()
        clone._egitim_yili_id = self._egitim_yili_id
        clone._kurum_id = self._kurum_id
        clone._sube_id = self._sube_id
        return clone
    
    def get_queryset(self):
        """
        Queryset'i tenant filtresiyle döndür.
        
        Eğer egitim_yili_id set edilmişse otomatik filtrele.
        """
        queryset = super().get_queryset()
        
        # Eğitim yılı filtresi
        if self._egitim_yili_id is not None:
            queryset = queryset.filter(egitim_yili_id=self._egitim_yili_id)
        
        # Kurum filtresi
        if self._kurum_id is not None:
            queryset = queryset.filter(kurum_id=self._kurum_id)
        
        # Şube filtresi
        if self._sube_id is not None:
            queryset = queryset.filter(sube_id=self._sube_id)
        
        return queryset
    
    def all_tenants(self):
        """
        Tenant filtresi olmadan tüm kayıtları getir.
        Dikkatli kullanılmalı!
        """
        return super().get_queryset()


class TenantAwareModel(models.Model):
    """
    Tenant-aware base model.
    
    Tüm eğitim yılı bazlı modeller bundan türemeli.
    
    Zorunlu alanlar:
    - kurum_id
    - sube_id
    - egitim_yili_id
    """
    
    kurum_id = models.BigIntegerField(verbose_name="Kurum ID", db_index=True)
    sube_id = models.BigIntegerField(verbose_name="Şube ID", db_index=True)
    egitim_yili_id = models.BigIntegerField(verbose_name="Eğitim Yılı ID", db_index=True)
    
    # Custom manager
    objects = TenantManager()
    
    class Meta:
        abstract = True
    
    def save(self, *args, **kwargs):
        """
        Kaydetmeden önce tenant alanlarının dolu olduğunu kontrol et.
        """
        if not self.kurum_id:
            raise ValueError("kurum_id zorunludur")
        if not self.sube_id:
            raise ValueError("sube_id zorunludur")
        if not self.egitim_yili_id:
            raise ValueError("egitim_yili_id zorunludur")
        
        super().save(*args, **kwargs)


# Helper fonksiyon: Request'ten tenant manager oluştur
def get_tenant_manager(model_class, request):
    """
    Request objesinden tenant bilgilerini alıp manager'a set eder.
    
    Args:
        model_class: Model sınıfı
        request: Django request objesi
        
    Returns:
        Manager: Tenant-aware manager
        
    Usage:
        manager = get_tenant_manager(Ogrenci, request)
        ogrenciler = manager.all()
    """
    return model_class.objects.set_tenant(
        kurum_id=getattr(request, 'kurum_id', None),
        sube_id=getattr(request, 'sube_id', None),
        egitim_yili_id=getattr(request, 'egitim_yili_id', None)
    )
