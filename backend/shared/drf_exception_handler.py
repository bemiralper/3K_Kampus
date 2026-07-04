"""DRF exception handler — oturum yoksa 401 döner (403 yerine)."""
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, PermissionDenied
from rest_framework.views import exception_handler

from django.http import JsonResponse


def api_exception_handler(exc, context):
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return JsonResponse(
            {
                'success': False,
                'error': 'Oturum açmanız gerekiyor.',
                'code': 'not_authenticated',
            },
            status=401,
        )

    response = exception_handler(exc, context)
    if response is None:
        return response

    request = context.get('request')
    if (
        response.status_code == 403
        and request is not None
        and not getattr(request.user, 'is_authenticated', False)
    ):
        return JsonResponse(
            {
                'success': False,
                'error': 'Oturum açmanız gerekiyor.',
                'code': 'not_authenticated',
            },
            status=401,
        )

    if isinstance(exc, PermissionDenied):
        data = response.data
        if isinstance(data, dict) and 'detail' in data:
            return JsonResponse(
                {
                    'success': False,
                    'error': str(data['detail']),
                    'code': 'permission_denied',
                },
                status=403,
            )

    return response
