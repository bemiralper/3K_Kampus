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
        # Header varsa session'ı da güncelle — belgeler gibi header'sız
        # istekler topbar'daki şube ile aynı kalsın.
        self._sync_header_to_session(request, 'kurum', 'X-Kurum-ID')
        self._sync_header_to_session(request, 'sube', 'X-Sube-ID')
        self._sync_header_to_session(request, 'egitim_yili', 'X-EgitimYili-ID')

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

        from apps.auth_custom.application.portals import apply_active_portal
        apply_active_portal(request)

        response = self.get_response(request)
        return response

    def _sync_header_to_session(self, request, key, header_name):
        raw = request.headers.get(header_name)
        if not raw:
            return
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return
        session_key = settings.TENANT_SESSION_KEYS[key]
        if request.session.get(session_key) == value:
            return
        # Yalnız değer değişiyorsa doğrula (her istekte sorgu açılmasın).
        if not self._header_value_allowed(request, key, value):
            return
        request.session[session_key] = value
        request.session.modified = True
    
    @staticmethod
    def _header_value_allowed(request, key, value) -> bool:
        """Header'daki kurum/şube kullanıcının erişebildiği kapsamda mı.

        Oturum açmamış istekte (webhook, login) doğrulama yapılmaz; kimlik yok.
        Kurum bağı olan kullanıcı başka kurumu/şubeyi session'a yazamaz.
        """
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return True
        if getattr(user, 'is_superuser', False):
            return True
        try:
            if key == 'kurum':
                from shared.kurum_access import user_can_access_kurum

                return user_can_access_kurum(user, value)
            if key == 'sube':
                from shared.context import _header_int
                from shared.sube_access import get_allowed_subeler_for_user

                kurum_id = _header_int(request, 'X-Kurum-ID') or request.session.get(
                    settings.TENANT_SESSION_KEYS['kurum']
                )
                return get_allowed_subeler_for_user(user, kurum_id=kurum_id).filter(id=value).exists()
        except Exception:
            return False
        return True

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
