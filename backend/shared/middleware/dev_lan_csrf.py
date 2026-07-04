"""
DEBUG ortamında yerel ağ (LAN) Origin adreslerini CSRF güvenilir listesine ekler.

Farklı bilgisayarlardan http://192.168.x.x:3000 ile erişimde Origin kontrolü
başarısız olmasın diye kullanılır. Yalnızca development.py içinde etkinleştirilir.
"""
import re

from django.conf import settings
from django.utils.deprecation import MiddlewareMixin

_PRIVATE_NETWORK_ORIGIN = re.compile(
    r'^https?://'
    r'(localhost|127\.0\.0\.1|\[::1\]|'
    r'192\.168\.\d{1,3}\.\d{1,3}|'
    r'10\.\d{1,3}\.\d{1,3}\.\d{1,3})'
    r'(:\d+)?$'
)


class DevLanCsrfMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if not settings.DEBUG:
            return None

        origin = request.META.get('HTTP_ORIGIN', '')
        if not origin or not _PRIVATE_NETWORK_ORIGIN.match(origin):
            return None

        trusted = settings.CSRF_TRUSTED_ORIGINS
        if origin not in trusted:
            trusted.append(origin)

        return None
