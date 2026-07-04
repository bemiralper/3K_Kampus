"""
JSON API yardımcıları
"""
from functools import wraps

from django.http import JsonResponse


def require_api_login(view_func):
    """API uçları için oturum kontrolü — HTML login sayfası yerine JSON 401 döner."""

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {'success': False, 'error': 'Oturum açmanız gerekiyor. Lütfen tekrar giriş yapın.'},
                status=401,
            )
        return view_func(request, *args, **kwargs)

    return wrapper
