"""
Tenant Context Middleware
Manages active kurum, sube, and egitim_yili context
Sets database schema based on active education year
"""
from django.db import connection
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.egitim_yili.domain.models import EgitimYili


class TenantContextMiddleware:
    """
    Middleware to manage tenant context (kurum, sube, egitim_yili)
    and set database schema accordingly.
    
    Context can be provided via:
    1. HTTP Headers (X-Kurum-ID, X-Sube-ID, X-EgitimYili-ID) - Frontend'den
    2. Session (active_kurum_id, active_sube_id, active_egitim_yili_id)
    
    Header'lar önceliklidir (Frontend Topbar seçimi).
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Önce HTTP Header'lardan oku (Frontend seçimi)
        kurum_id = request.headers.get('X-Kurum-ID') or request.session.get('active_kurum_id')
        sube_id = request.headers.get('X-Sube-ID') or request.session.get('active_sube_id')
        egitim_yili_id = request.headers.get('X-EgitimYili-ID') or request.session.get('active_egitim_yili_id')
        
        # String'den int'e çevir
        kurum_id = int(kurum_id) if kurum_id else None
        sube_id = int(sube_id) if sube_id else None
        egitim_yili_id = int(egitim_yili_id) if egitim_yili_id else None
        
        # Attach context objects to request
        request.active_kurum = None
        request.active_sube = None
        request.active_egitim_yili = None
        request.active_schema = None
        
        try:
            if kurum_id:
                request.active_kurum = Kurum.objects.get(id=kurum_id)
            
            if sube_id:
                request.active_sube = Sube.objects.select_related('kurum').get(id=sube_id)
            
            if egitim_yili_id:
                request.active_egitim_yili = EgitimYili.objects.select_related('kurum', 'sube').get(id=egitim_yili_id)
                request.active_schema = request.active_egitim_yili.schema_adi
                
                # Set PostgreSQL search path to active schema
                with connection.cursor() as cursor:
                    cursor.execute(f"SET search_path TO {request.active_schema}, public")
        
        except (Kurum.DoesNotExist, Sube.DoesNotExist, EgitimYili.DoesNotExist):
            # Clear invalid session data
            if kurum_id and not request.active_kurum:
                request.session.pop('active_kurum_id', None)
            if sube_id and not request.active_sube:
                request.session.pop('active_sube_id', None)
            if egitim_yili_id and not request.active_egitim_yili:
                request.session.pop('active_egitim_yili_id', None)
        
        response = self.get_response(request)
        return response
