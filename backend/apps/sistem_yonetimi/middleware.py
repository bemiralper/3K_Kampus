"""Capture unhandled exceptions into SystemErrorEvent."""

from __future__ import annotations

import json
import re
import traceback

from django.http import Http404

_SECRET_PARTS = (
    'password',
    'passwd',
    'sifre',
    'parola',
    'token',
    'secret',
    'api_key',
    'authorization',
    'credential',
)
_SECRET_VALUE = re.compile(
    r'(?i)((?:password|passwd|sifre|parola|token|secret|api_key|authorization|credential)["\']?\s*[:=]\s*)([^\s&\'",}]+)'
)
_BEARER_VALUE = re.compile(r'(?i)(bearer\s+)([A-Za-z0-9\-._~+/]+=*)')
_PATH_SECRET = re.compile(
    r'(?i)(/[^/?#]*?(?:token|reset|secret|sifre|parola|invite|verify|confirm|access|refresh|api[-_]?key)[^/?#]*/)([^/?#]+)'
)
_JWT = re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')
_LONG_HEX = re.compile(r'(?<=/)[0-9a-fA-F]{32,}(?=/|$|\?|#)')


def redact_mapping(mapping) -> dict:
    """Anahtar adında gizli parça geçen her değeri maskeler (password_reset dahil)."""
    out = {}
    try:
        keys = list(mapping.keys())
    except Exception:
        return {}
    for key in keys:
        lowered = str(key).lower()
        if any(part in lowered for part in _SECRET_PARTS):
            out[key] = '***'
            continue
        try:
            value = mapping.get(key)
        except Exception:
            value = ''
        if isinstance(value, dict):
            value = redact_mapping(value)
        out[key] = value
    return out


def scrub_url(text: str) -> str:
    """Yolun içindeki token, JWT ve uzun hex parçalarını maskeler."""
    masked = _PATH_SECRET.sub(r'\1***', text or '')
    masked = _JWT.sub('***', masked)
    return _LONG_HEX.sub('***', masked)


def scrub_text(text: str) -> str:
    masked = scrub_url(text or '')
    masked = _BEARER_VALUE.sub(r'\1***', masked)
    return _SECRET_VALUE.sub(r'\1***', masked)


def request_params_for_log(request) -> dict:
    params = redact_mapping(getattr(request, 'GET', {}) or {})
    method = (getattr(request, 'method', '') or '').upper()
    if method not in ('POST', 'PUT', 'PATCH'):
        return params
    content_type = (getattr(request, 'content_type', '') or '').lower()
    if 'application/json' in content_type:
        try:
            raw = request.body[:65536]
            data = json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            data = None
        if isinstance(data, dict):
            params.update(redact_mapping(data))
        return params
    if 'multipart/form-data' in content_type:
        return params
    try:
        params.update(redact_mapping(getattr(request, 'POST', {}) or {}))
    except Exception:
        pass
    return params


class SystemErrorMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        # 404 beklenen bir cevaptır; hata merkezine 500 diye yazılmaz.
        if isinstance(exception, Http404):
            return None
        # Avoid recursion if sistem_yonetimi itself fails during migrate
        path = getattr(request, 'path', '') or ''
        if path.startswith('/sistem-yonetimi/api/'):
            return None
        try:
            from apps.sistem_yonetimi.services.audit import client_ip
            from apps.sistem_yonetimi.services.dashboard import record_error_event

            user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
            try:
                params = request_params_for_log(request)
            except Exception:
                params = {}
            stack = ''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))
            record_error_event(
                message=scrub_text(str(exception))[:4000],
                error_type=type(exception).__name__,
                stack_trace=scrub_text(stack),
                module='django',
                request_url=scrub_url(path)[:2000],
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
