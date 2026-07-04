"""
Session idle timeout — oturum hareketsizlik süresi aşılırsa çıkış.
"""
import time

from django.conf import settings
from django.contrib.auth import logout


SESSION_LAST_ACTIVITY_KEY = '_last_activity'


def _resolve_idle_timeout_seconds() -> int:
    return int(getattr(settings, 'SESSION_IDLE_TIMEOUT_SECONDS', 900))


def _is_exempt_path(path: str) -> bool:
    exempt_prefixes = (
        '/auth/api/login/',
        '/auth/api/logout/',
        '/admin/login/',
    )
    return any(path.startswith(prefix) for prefix in exempt_prefixes)


def _wants_json_response(request) -> bool:
    accept = request.META.get('HTTP_ACCEPT', '')
    if 'application/json' in accept:
        return True
    path = request.path or ''
    return '/api/' in path or path.endswith('/api/me/')


class SessionIdleTimeoutMiddleware:
    """15 dk (varsayılan) işlem yoksa oturumu sonlandır."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.timeout_seconds = _resolve_idle_timeout_seconds()

    def __call__(self, request):
        if (
            request.user.is_authenticated
            and not _is_exempt_path(request.path)
        ):
            now = time.time()
            last_activity = request.session.get(SESSION_LAST_ACTIVITY_KEY)

            if last_activity is not None:
                idle_seconds = now - float(last_activity)
                if idle_seconds > self.timeout_seconds:
                    logout(request)
                    try:
                        request.session.flush()
                    except Exception:
                        pass

                    if _wants_json_response(request):
                        from django.http import JsonResponse
                        if request.path.rstrip('/').endswith('/auth/api/me'):
                            return JsonResponse(
                                {
                                    'success': True,
                                    'authenticated': False,
                                    'user': None,
                                    'session_expired': True,
                                    'code': 'session_idle_timeout',
                                },
                                status=200,
                            )
                        return JsonResponse(
                            {
                                'error': 'Oturum süresi doldu. Lütfen tekrar giriş yapın.',
                                'code': 'session_idle_timeout',
                            },
                            status=401,
                        )

            request.session[SESSION_LAST_ACTIVITY_KEY] = now

        return self.get_response(request)
