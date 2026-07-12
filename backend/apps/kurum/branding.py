"""Kurum / şube marka (white-label) yardımcıları."""
import re


DEFAULT_LOGIN_BG = '#1e3a5f'
DEFAULT_LOGIN_BG_2 = '#2d5a87'
DEFAULT_TEMA = '#0262a7'

BRANDING_TEXT_FIELDS = (
    'gorunen_ad', 'slogan',
    'login_arkaplan_rengi', 'login_arkaplan_rengi_2', 'tema_rengi',
)


def _media_url(request, file_field, *, cache_bust: int | None = None) -> str | None:
    """Same-origin /media/ yolu — tarayıcı Next.js proxy üzerinden erişir.

    Dosya diskte yoksa None döner (ör. sunucu yedeğinden gelen ama medyası
    kopyalanmamış kayıtlar). Böylece frontend bozuk favicon yerine fallback kullanır.
    """
    if not file_field:
        return None
    try:
        if not file_field.storage.exists(file_field.name):
            return None
    except Exception:
        pass
    url = file_field.url
    if not url.startswith('/'):
        url = f'/{url.lstrip("/")}'
    if cache_bust is not None:
        sep = '&' if '?' in url else '?'
        url = f'{url}{sep}v={cache_bust}'
    return url


def _kurum_favicon_from_sube(kurum, request) -> str | None:
    """Kurumda favicon yoksa (veya dosyası eksikse) şube favicon'una düş."""
    try:
        from apps.sube.domain.models import Sube
        subeler = Sube.objects.filter(kurum_id=kurum.id).order_by('id')
        for sube in subeler:
            version = int(sube.updated_at.timestamp()) if getattr(sube, 'updated_at', None) else None
            url = _media_url(request, getattr(sube, 'favicon', None), cache_bust=version)
            if url:
                return url
    except Exception:
        return None
    return None


def _serialize_branding_entity(entity, request, *, default_name: str) -> dict:
    gorunen = (getattr(entity, 'gorunen_ad', '') or '').strip() or default_name
    bg2 = (getattr(entity, 'login_arkaplan_rengi_2', '') or '').strip() or DEFAULT_LOGIN_BG_2
    version = int(entity.updated_at.timestamp()) if getattr(entity, 'updated_at', None) else None
    return {
        'gorunen_ad': gorunen,
        'slogan': getattr(entity, 'slogan', '') or '',
        'login_logo_url': _media_url(request, getattr(entity, 'login_logo', None), cache_bust=version),
        'app_logo_url': _media_url(request, getattr(entity, 'app_logo', None), cache_bust=version),
        'favicon_url': _media_url(request, getattr(entity, 'favicon', None), cache_bust=version),
        'login_arkaplan_rengi': getattr(entity, 'login_arkaplan_rengi', '') or DEFAULT_LOGIN_BG,
        'login_arkaplan_rengi_2': bg2,
        'tema_rengi': getattr(entity, 'tema_rengi', '') or DEFAULT_TEMA,
    }


def serialize_kurum_branding(kurum, request=None) -> dict:
    """Kurum marka bilgilerini JSON-safe dict olarak döndür."""
    data = _serialize_branding_entity(kurum, request, default_name=kurum.ad)
    # Kurumda favicon yoksa/dosyası eksikse şube favicon'una düş
    if not data.get('favicon_url'):
        fallback = _kurum_favicon_from_sube(kurum, request)
        if fallback:
            data['favicon_url'] = fallback
    data.update({
        'id': kurum.id,
        'kod': kurum.kod or '',
        'ad': kurum.ad,
    })
    return data


def serialize_sube_branding(sube, request=None) -> dict:
    """Şube marka bilgilerini JSON-safe dict olarak döndür."""
    data = _serialize_branding_entity(sube, request, default_name=sube.ad)
    data.update({
        'id': sube.id,
        'kod': sube.kod or '',
        'ad': sube.ad,
        'kurum_id': sube.kurum_id,
    })
    return data


def apply_branding_fields(entity, data: dict):
    """PUT body'den marka metin alanlarını uygula."""
    for field in BRANDING_TEXT_FIELDS:
        if field in data:
            setattr(entity, field, data.get(field) or '')


def normalize_map_embed_url(raw: str | None) -> str:
    """iframe HTML veya paylaşım linkinden embed src çıkar."""
    if not raw:
        return ''
    text = str(raw).strip()
    if not text:
        return ''
    match = re.search(r"""<iframe[^>]+src=["']([^"']+)["']""", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text


def build_map_embed_from_address(address: str | None) -> str:
    if not address or not str(address).strip():
        return ''
    from urllib.parse import quote_plus
    q = quote_plus(str(address).strip())
    return f'https://maps.google.com/maps?q={q}&t=&z=15&ie=UTF8&iwloc=&output=embed'
