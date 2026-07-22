"""Bakım modunda API/HTTP için bilgilendirici 503 yanıtı."""

from __future__ import annotations

from django.http import HttpResponse, JsonResponse

from shared.maintenance import is_maintenance_mode, maintenance_html_path


class MaintenanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not is_maintenance_mode():
            return self.get_response(request)

        accept = request.headers.get('Accept', '')
        wants_json = (
            request.path.startswith('/api/')
            or request.path.endswith('/api/')
            or 'application/json' in accept
            or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        )
        message = (
            'Sistem güncelleniyor. Genellikle birkaç dakika sürer; lütfen kısa süre sonra tekrar deneyin.'
        )
        if wants_json:
            return JsonResponse(
                {'success': False, 'error': message, 'maintenance': True},
                status=503,
            )

        html_path = maintenance_html_path()
        try:
            body = html_path.read_text(encoding='utf-8')
        except OSError:
            body = f'<!DOCTYPE html><html lang="tr"><body><h1>Güncelleme</h1><p>{message}</p></body></html>'
        return HttpResponse(body, status=503, content_type='text/html; charset=utf-8')
