"""
Active Context Middleware
Manages tenant, branch, and education year context
"""
from django.conf import settings


class ActiveContextMiddleware:
    """
    Middleware to inject active tenant context into requests
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Get active context from session
        request.active_kurum_id = request.session.get(
            settings.TENANT_SESSION_KEYS['kurum']
        )
        request.active_sube_id = request.session.get(
            settings.TENANT_SESSION_KEYS['sube']
        )
        request.active_egitim_yili_id = request.session.get(
            settings.TENANT_SESSION_KEYS['egitim_yili']
        )
        
        # Attach helper methods
        request.set_active_kurum = lambda kurum_id: self._set_context(
            request, 'kurum', kurum_id
        )
        request.set_active_sube = lambda sube_id: self._set_context(
            request, 'sube', sube_id
        )
        request.set_active_egitim_yili = lambda yil_id: self._set_context(
            request, 'egitim_yili', yil_id
        )
        request.clear_active_context = lambda: self._clear_context(request)
        
        response = self.get_response(request)
        return response
    
    def _set_context(self, request, key, value):
        """Set context value in session"""
        session_key = settings.TENANT_SESSION_KEYS[key]
        request.session[session_key] = value
        setattr(request, f'active_{key}_id', value)
        
    def _clear_context(self, request):
        """Clear all context from session"""
        for key in settings.TENANT_SESSION_KEYS.values():
            request.session.pop(key, None)
        request.active_kurum_id = None
        request.active_sube_id = None
        request.active_egitim_yili_id = None
