"""Capture unhandled exceptions into SystemErrorEvent."""

from __future__ import annotations

import traceback


class SystemErrorMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        # Avoid recursion if sistem_yonetimi itself fails during migrate
        path = getattr(request, 'path', '') or ''
        if path.startswith('/sistem-yonetimi/api/'):
            return None
        try:
            from apps.sistem_yonetimi.services.audit import client_ip
            from apps.sistem_yonetimi.services.dashboard import record_error_event

            user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
            params = {}
            try:
                params = {k: request.GET.get(k) for k in request.GET.keys()}
            except Exception:
                params = {}
            record_error_event(
                message=str(exception)[:4000],
                error_type=type(exception).__name__,
                stack_trace=''.join(traceback.format_exception(type(exception), exception, exception.__traceback__)),
                module='django',
                request_url=path,
                http_method=getattr(request, 'method', '') or '',
                status_code=500,
                user=user,
                ip_address=client_ip(request),
                user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:500],
                request_params=params,
            )
        except Exception:
            pass
        return None
