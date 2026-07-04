"""
Tenant Middleware

Her request'te aktif kurum, şube ve eğitim yılı bilgilerini yönetir.
Bu bilgiler session'da saklanır ve request objesine eklenir.

ZORUNLU KURAL:
Her query bu bilgilere göre filtrelenmek zorunda.
"""

from django.utils.deprecation import MiddlewareMixin
from apps.kurum_yonetimi.models import Kurum, Sube, EgitimYili
import logging

logger = logging.getLogger(__name__)


class TenantMiddleware(MiddlewareMixin):
    """
    Multi-tenant yapısını yöneten middleware.
    
    Session'dan aktif kurum, şube ve eğitim yılı bilgilerini alır.
    Request objesine ekler.
    """
    
    def process_request(self, request):
        """
        Her request'te çalışır.
        Session'dan tenant bilgilerini okur ve request'e ekler.
        """
        # Session varsa bilgileri al
        if hasattr(request, 'session'):
            aktif_kurum_id = request.session.get('aktif_kurum_id')
            aktif_sube_id = request.session.get('aktif_sube_id')
            aktif_egitim_yili_id = request.session.get('aktif_egitim_yili_id')
            
            # Kurum bilgisini request'e ekle
            if aktif_kurum_id:
                try:
                    request.aktif_kurum = Kurum.objects.get(id=aktif_kurum_id, aktif_mi=True)
                except Kurum.DoesNotExist:
                    logger.warning(f"Aktif kurum bulunamadı: {aktif_kurum_id}")
                    request.aktif_kurum = None
            else:
                request.aktif_kurum = None
            
            # Şube bilgisini request'e ekle
            if aktif_sube_id:
                try:
                    request.aktif_sube = Sube.objects.get(id=aktif_sube_id, aktif_mi=True)
                except Sube.DoesNotExist:
                    logger.warning(f"Aktif şube bulunamadı: {aktif_sube_id}")
                    request.aktif_sube = None
            else:
                request.aktif_sube = None
            
            # Eğitim yılı bilgisini request'e ekle
            if aktif_egitim_yili_id:
                try:
                    request.aktif_egitim_yili = EgitimYili.objects.get(id=aktif_egitim_yili_id)
                except EgitimYili.DoesNotExist:
                    logger.warning(f"Aktif eğitim yılı bulunamadı: {aktif_egitim_yili_id}")
                    request.aktif_egitim_yili = None
            else:
                request.aktif_egitim_yili = None
            
            # ID'leri de ekle (hızlı erişim için)
            request.kurum_id = aktif_kurum_id
            request.sube_id = aktif_sube_id
            request.egitim_yili_id = aktif_egitim_yili_id
            
        else:
            # Session yoksa boş değerler ata
            request.aktif_kurum = None
            request.aktif_sube = None
            request.aktif_egitim_yili = None
            request.kurum_id = None
            request.sube_id = None
            request.egitim_yili_id = None
    
    def process_response(self, request, response):
        """
        Response'dan önce çalışır.
        """
        return response


def set_active_tenant(request, kurum_id=None, sube_id=None, egitim_yili_id=None):
    """
    Aktif tenant bilgilerini session'a kaydet.
    
    Args:
        request: Django request objesi
        kurum_id: Kurum ID
        sube_id: Şube ID
        egitim_yili_id: Eğitim yılı ID
    """
    if kurum_id:
        request.session['aktif_kurum_id'] = kurum_id
    
    if sube_id:
        request.session['aktif_sube_id'] = sube_id
    
    if egitim_yili_id:
        request.session['aktif_egitim_yili_id'] = egitim_yili_id
    
    # Session'ı kaydet
    request.session.modified = True
    
    logger.info(f"Tenant değişti - Kurum: {kurum_id}, Şube: {sube_id}, Eğitim Yılı: {egitim_yili_id}")


def clear_active_tenant(request):
    """
    Session'daki tenant bilgilerini temizle.
    
    Args:
        request: Django request objesi
    """
    request.session.pop('aktif_kurum_id', None)
    request.session.pop('aktif_sube_id', None)
    request.session.pop('aktif_egitim_yili_id', None)
    request.session.modified = True
    
    logger.info("Tenant bilgileri temizlendi")


def get_active_schema(request):
    """
    Aktif eğitim yılının schema adını döndürür.
    
    Args:
        request: Django request objesi
        
    Returns:
        str: Schema adı veya None
    """
    if hasattr(request, 'aktif_egitim_yili') and request.aktif_egitim_yili:
        return request.aktif_egitim_yili.schema_adi
    return None
