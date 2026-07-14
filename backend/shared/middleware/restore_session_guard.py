"""Tam veritabanı geri yükleme sonrası oturum kaydı koruması.

pg_restore django_session tablosunu değiştirdiğinde SessionMiddleware yanıt
aşamasında SessionInterrupted fırlatabilir. Restore başarılıysa bunu başarılı
JSON yanıtına çevirir ve oturum kaydını atlar.
"""

from __future__ import annotations

from django.http import JsonResponse


def detach_request_session(request) -> None:
    """Yanıtta oturum DB yazımını engelle (SESSION_SAVE_EVERY_REQUEST dahil)."""
    try:
        session = request.session
        session.clear()
        session.modified = False
        session.accessed = False
    except Exception:
        pass


class RestoreSessionGuardMiddleware:
    """Restore uçlarında tam DB sonrası oturum kaydını güvenli şekilde atlar."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if getattr(request, '_skip_session_save', False):
            detach_request_session(request)
        return response

    def process_exception(self, request, exception):
        from django.contrib.sessions.exceptions import SessionInterrupted

        if isinstance(exception, SessionInterrupted) and getattr(request, '_backup_restore_succeeded', False):
            payload = dict(getattr(request, '_backup_restore_result', {}) or {})
            payload['relogin_required'] = True
            payload['session_reset'] = True
            detach_request_session(request)
            return JsonResponse(payload)
        return None
