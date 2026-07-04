"""Kurum marka (white-label) yardımcıları."""
from django.conf import settings


DEFAULT_LOGIN_BG = '#1e3a5f'
DEFAULT_LOGIN_BG_2 = '#2d5a87'
DEFAULT_TEMA = '#0262a7'


def _media_url(request, file_field) -> str | None:
    if not file_field:
        return None
    url = file_field.url
    if request and hasattr(request, 'build_absolute_uri'):
        return request.build_absolute_uri(url)
    if url.startswith('http'):
        return url
    return f"{getattr(settings, 'BACKEND_PUBLIC_URL', '')}{url}" if getattr(settings, 'BACKEND_PUBLIC_URL', None) else url


def serialize_kurum_branding(kurum, request=None) -> dict:
    """Kurum marka bilgilerini JSON-safe dict olarak döndür."""
    gorunen = (kurum.gorunen_ad or '').strip() or kurum.ad
    bg2 = (kurum.login_arkaplan_rengi_2 or '').strip() or DEFAULT_LOGIN_BG_2
    return {
        'id': kurum.id,
        'kod': kurum.kod or '',
        'ad': kurum.ad,
        'gorunen_ad': gorunen,
        'slogan': kurum.slogan or '',
        'login_logo_url': _media_url(request, kurum.login_logo),
        'app_logo_url': _media_url(request, kurum.app_logo),
        'favicon_url': _media_url(request, kurum.favicon),
        'login_arkaplan_rengi': kurum.login_arkaplan_rengi or DEFAULT_LOGIN_BG,
        'login_arkaplan_rengi_2': bg2,
        'tema_rengi': kurum.tema_rengi or DEFAULT_TEMA,
    }


def apply_branding_fields(kurum, data: dict):
    """PUT body'den marka metin alanlarını uygula."""
    text_fields = (
        'gorunen_ad', 'slogan',
        'login_arkaplan_rengi', 'login_arkaplan_rengi_2', 'tema_rengi',
    )
    for field in text_fields:
        if field in data:
            setattr(kurum, field, data.get(field) or '')
