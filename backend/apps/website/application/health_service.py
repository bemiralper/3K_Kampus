"""Site sağlık alanlarını mevcut veriden doldur — düzenlenebilir varsayılanlar."""
from __future__ import annotations

import os

from django.conf import settings as django_settings

from apps.kurum.domain.models import Kurum
from apps.website.application.system_default_specs import public_path_for_slug
from apps.website.cms_models import IntegrationSettings, SiteTheme, WebPage
from apps.website.models import SiteSettings

# UI / mevcut üretim izinden bilinen GA4 (kullanıcı panelden değiştirebilir)
DEFAULT_GA4_ID = 'G-3NWSLBGCK8'

# Kamu kurumsal site (LMS app.3kkampus.com değil)
DEFAULT_PUBLIC_SITE_URL = 'https://www.3kkampus.com'

DEFAULT_ROBOTS_TXT = """User-agent: *
Allow: /
Allow: /duyurular
Allow: /duyurular/
Allow: /hakkimizda
Allow: /3k-sistemi
Allow: /yasal/
Allow: /sayfa/

Disallow: /admin/
Disallow: /coach/
Disallow: /muhasebe/
Disallow: /kurum-yonetimi/
Disallow: /website-yonetimi/
Disallow: /api/
Disallow: /login

Sitemap: {sitemap_url}
"""


def _site_base_url() -> str:
    """
    SEO / robots / canonical için kamu site URL.
    PUBLIC_SITE_URL > (FRONTEND_URL yalnızca localhost değilse ve app değilse) > www.3kkampus.com
    """
    public = (
        os.environ.get('PUBLIC_SITE_URL')
        or getattr(django_settings, 'PUBLIC_SITE_URL', None)
        or ''
    ).strip()
    if public:
        return public.rstrip('/')

    frontend = (getattr(django_settings, 'FRONTEND_URL', None) or '').strip().rstrip('/')
    # LMS app host'unu kamu site sanma
    if frontend and 'localhost' not in frontend and '127.0.0.1' not in frontend:
        if 'app.' in frontend:
            return DEFAULT_PUBLIC_SITE_URL
        return frontend

    return DEFAULT_PUBLIC_SITE_URL


def _media_url(path: str | None) -> str:
    if not path:
        return ''
    p = str(path).strip()
    if p.startswith('http://') or p.startswith('https://'):
        return p
    if p.startswith('/media/'):
        return p
    return f'/media/{p.lstrip("/")}'


def _field_url(field) -> str:
    if not field:
        return ''
    try:
        return field.url
    except Exception:
        name = getattr(field, 'name', None) or str(field)
        return _media_url(name)


def _clip(text: str, n: int) -> str:
    t = (text or '').strip()
    if len(t) <= n:
        return t
    return t[: n - 1].rstrip() + '…'


def ensure_website_health(kurum_id: int, *, ga4_id: str | None = None) -> dict:
    """
    Dashboard eksiklerini doldurur (idempotent — dolu alanları ezmez;
    robots localhost içeriyorsa üretim URL ile günceller; logo kurumdan senkronize edilir).
    """
    changes: list[str] = []
    kurum = Kurum.objects.filter(pk=kurum_id).first()
    if not kurum:
        return {'ok': False, 'error': 'Kurum bulunamadı', 'changes': []}

    site = SiteSettings.objects.filter(kurum_id=kurum_id).first()
    base = _site_base_url()
    sitemap_url = f'{base}/sitemap.xml'

    # ── Integrations (GA4, robots, Search Console) ──
    integ, created = IntegrationSettings.objects.get_or_create(kurum_id=kurum_id)
    if created:
        changes.append('integration_settings_created')

    desired_ga4 = (ga4_id or '').strip() or (site.google_analytics_id if site else '') or DEFAULT_GA4_ID
    if desired_ga4 and not (integ.ga4_id or '').strip():
        integ.ga4_id = desired_ga4
        changes.append(f'ga4_id={desired_ga4}')
    if site and not (site.google_analytics_id or '').strip() and (integ.ga4_id or '').strip():
        site.google_analytics_id = integ.ga4_id
        site.save(update_fields=['google_analytics_id', 'updated_at'])
        changes.append('sitesettings_ga4_synced')

    if site and (site.google_site_verification or '').strip() and not (integ.search_console_verification or '').strip():
        integ.search_console_verification = site.google_site_verification
        changes.append('search_console_synced')

    robots = (integ.robots_txt or '').strip()
    need_robots = not robots or 'localhost' in robots or '127.0.0.1' in robots
    if need_robots:
        integ.robots_txt = DEFAULT_ROBOTS_TXT.format(sitemap_url=sitemap_url).strip() + '\n'
        changes.append('robots_txt_production_url' if robots else 'robots_txt_default')

    integ.save()

    # ── Theme: logo / favicon kurum branding'den ──
    theme, theme_created = SiteTheme.objects.get_or_create(kurum_id=kurum_id)
    if theme_created:
        changes.append('site_theme_created')

    kurum_favicon = _field_url(getattr(kurum, 'favicon', None))
    kurum_logo = (
        _field_url(getattr(kurum, 'app_logo', None))
        or _field_url(getattr(kurum, 'login_logo', None))
    )
    # Logo yoksa favicon'u header logosu olarak kullan (kurumda logo yüklenene kadar)
    if not kurum_logo and kurum_favicon:
        kurum_logo = kurum_favicon

    if kurum_logo and (theme.logo_url or '').strip() != kurum_logo:
        # Boşsa veya favicon fallback'tan geliyorsa / kurum logosu değiştiyse güncelle
        prev = (theme.logo_url or '').strip()
        if not prev or prev == kurum_favicon or prev == kurum_logo or 'kurum_branding' in prev:
            theme.logo_url = kurum_logo
            changes.append(f'logo_url_from_kurum={kurum_logo}')

    if kurum_favicon and (not (theme.favicon_url or '').strip() or theme.favicon_url != kurum_favicon):
        if not (theme.favicon_url or '').strip() or theme.favicon_url in ('/favicon.svg',):
            theme.favicon_url = kurum_favicon
            changes.append(f'favicon_url={kurum_favicon}')
    elif not (theme.favicon_url or '').strip():
        theme.favicon_url = '/favicon.svg'
        changes.append('favicon_url=/favicon.svg')

    if not (theme.primary_color or '').strip() or theme.primary_color == '#0f766e':
        tema = getattr(kurum, 'tema_rengi', None) or '#0262a7'
        theme.primary_color = tema
        changes.append(f'primary_color={tema}')

    theme.save()

    # ── Page SEO (meta + canonical) ──
    pages_updated = 0
    for page in WebPage.objects.filter(kurum_id=kurum_id):
        dirty = False
        if not (page.meta_title or '').strip():
            page.meta_title = _clip(page.title, 70)
            dirty = True
        if not (page.meta_description or '').strip():
            if page.is_homepage and site and (site.seo_aciklama or '').strip():
                page.meta_description = _clip(site.seo_aciklama, 320)
            else:
                page.meta_description = _clip(
                    f'{page.title} — {kurum.gorunen_ad or kurum.ad}. Detaylı bilgi için sayfamızı ziyaret edin.',
                    320,
                )
            dirty = True
        # localhost canonical'ları düzelt
        if (page.canonical_url or '').strip() and (
            'localhost' in page.canonical_url or '127.0.0.1' in page.canonical_url
        ):
            page.canonical_url = ''
            dirty = True
        if not (page.canonical_url or '').strip():
            dedicated = public_path_for_slug(page.slug)
            if dedicated:
                path = dedicated
            elif page.slug in ('kvkk', 'gizlilik', 'kullanim', 'cerez'):
                path = f'/yasal/{page.slug}'
            else:
                path = '/' if page.is_homepage or page.slug == 'home' else f'/sayfa/{page.slug}'
            page.canonical_url = f'{base}{path}'
            dirty = True
        if not page.sitemap_include and page.status == WebPage.STATUS_PUBLISHED:
            page.sitemap_include = True
            dirty = True
        if not (page.og_title or '').strip():
            page.og_title = _clip(page.meta_title or page.title, 100)
            dirty = True
        if not (page.og_description or '').strip():
            page.og_description = _clip(page.meta_description, 300)
            dirty = True
        if not (page.og_image or '').strip() and (theme.logo_url or theme.favicon_url):
            img = theme.logo_url or theme.favicon_url
            if img.startswith('/'):
                page.og_image = f'{base}{img}'
            else:
                page.og_image = img
            dirty = True
        if dirty:
            page.save()
            pages_updated += 1

    if pages_updated:
        changes.append(f'pages_seo_updated={pages_updated}')

    if site:
        s_dirty = False
        if not (site.seo_canonical_url or '').strip() or 'localhost' in (site.seo_canonical_url or ''):
            site.seo_canonical_url = f'{base}/'
            s_dirty = True
        if s_dirty:
            site.save(update_fields=['seo_canonical_url', 'updated_at'])
            changes.append('sitesettings_canonical')

    return {
        'ok': True,
        'kurum_id': kurum_id,
        'kurum_kod': kurum.kod,
        'changes': changes,
        'preview': {
            'ga4_id': integ.ga4_id,
            'robots_txt_set': bool(integ.robots_txt),
            'favicon_url': theme.favicon_url,
            'logo_url': theme.logo_url,
            'pages_updated': pages_updated,
            'base_url': base,
        },
    }
