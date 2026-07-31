"""Site sağlık alanlarını mevcut veriden doldur — düzenlenebilir varsayılanlar."""
from __future__ import annotations

import os

from django.conf import settings as django_settings

from apps.kurum.domain.models import Kurum
from apps.website.application.system_default_specs import public_path_for_slug, spec_for_slug
from apps.website.cms_models import IntegrationSettings, SiteTheme, WebPage
from apps.website.company_defaults import DEFAULT_COMPANY_INFO, apply_company_defaults
from apps.website.models import SiteSettings

# UI / mevcut üretim izinden bilinen GA4 (kullanıcı panelden değiştirebilir)
DEFAULT_GA4_ID = 'G-3NWSLBGCK8'

# Kamu kurumsal site / LMS — tek domain: www.3kkampus.com
DEFAULT_PUBLIC_SITE_URL = 'https://www.3kkampus.com'

DEFAULT_ROBOTS_TXT = """User-agent: *
Allow: /
Allow: /duyurular
Allow: /duyurular/
Allow: /hakkimizda
Allow: /3k-sistemi
Allow: /yasal/
Allow: /veri-silme
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
        return _normalize_public_url(public)

    frontend = (getattr(django_settings, 'FRONTEND_URL', None) or '').strip().rstrip('/')
    # LMS app host'unu kamu site sanma
    if frontend and 'localhost' not in frontend and '127.0.0.1' not in frontend:
        if 'app.' in frontend:
            return DEFAULT_PUBLIC_SITE_URL
        return _normalize_public_url(frontend)

    return DEFAULT_PUBLIC_SITE_URL


def _normalize_public_url(url: str) -> str:
    u = (url or '').strip().rstrip('/')
    if not u:
        return DEFAULT_PUBLIC_SITE_URL
    if not u.startswith('http://') and not u.startswith('https://'):
        u = f'https://{u.lstrip("/")}'
    return u


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
    if site is None:
        site = SiteSettings.objects.create(kurum_id=kurum_id)
        changes.append('site_settings_created')
    company_changed = apply_company_defaults(site)
    if company_changed:
        site.save(update_fields=[*company_changed, 'updated_at'])
        changes.append(f'company_info={",".join(company_changed)}')

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

    # CMS footer_config: ticari bilgiler + iletişim
    footer = dict(theme.footer_config or {})
    footer_dirty = False
    for key, value in {
        'ticari_unvan': site.ticari_unvan,
        'mersis_no': site.mersis_no,
        'vergi_no': site.vergi_no,
        'ticaret_sicil_no': site.ticaret_sicil_no,
        'adres': site.adres or DEFAULT_COMPANY_INFO['adres'],
        'telefon': site.telefon or DEFAULT_COMPANY_INFO['telefon'],
        'eposta': site.eposta or DEFAULT_COMPANY_INFO.get('eposta', ''),
    }.items():
        if value and footer.get(key) != value:
            footer[key] = value
            footer_dirty = True
    if footer_dirty:
        theme.footer_config = footer
        changes.append('footer_config_company_synced')

    theme.save()

    # ── Page SEO (meta + canonical) ──
    def _weak_title(value: str) -> bool:
        text = (value or '').strip()
        return not text or len(text) < 30 or len(text) > 60

    def _weak_desc(value: str) -> bool:
        text = (value or '').strip()
        return not text or len(text) < 70 or len(text) > 160

    def _abs_media(url: str) -> str:
        url = (url or '').strip()
        if not url:
            return ''
        if url.startswith('http://') or url.startswith('https://'):
            return url
        if url.startswith('/'):
            return f'{base}{url}'
        return f'{base}/{url.lstrip("/")}'

    og_fallback = ''
    if site and (getattr(site, 'seo_og_image_url', '') or '').strip():
        og_fallback = _abs_media(site.seo_og_image_url)
    if not og_fallback and (theme.logo_url or theme.favicon_url):
        og_fallback = _abs_media(theme.logo_url or theme.favicon_url)

    pages_updated = 0
    for page in WebPage.objects.filter(kurum_id=kurum_id):
        dirty = False
        spec = spec_for_slug(page.slug)

        if _weak_title(page.meta_title or ''):
            if spec:
                page.meta_title = _clip(spec.meta_title, 70)
            elif page.is_homepage and site and (site.seo_baslik or '').strip() and not _weak_title(site.seo_baslik):
                page.meta_title = _clip(site.seo_baslik, 70)
            else:
                brand = kurum.gorunen_ad or kurum.ad or '3K Kampüs'
                page.meta_title = _clip(f'{page.title} | {brand}', 70)
            dirty = True

        if _weak_desc(page.meta_description or ''):
            if spec:
                page.meta_description = _clip(spec.meta_description, 320)
            elif page.is_homepage and site and (site.seo_aciklama or '').strip() and not _weak_desc(site.seo_aciklama):
                page.meta_description = _clip(site.seo_aciklama, 320)
            else:
                brand = kurum.gorunen_ad or kurum.ad or '3K Kampüs'
                page.meta_description = _clip(
                    f'{page.title} — {brand}. LGS, YKS ve okul destek programları hakkında '
                    f'detaylı bilgi için sayfamızı ziyaret edin.',
                    320,
                )
            dirty = True

        # localhost / boş / sistem sayfalarında yanlış canonical
        if (page.canonical_url or '').strip() and (
            'localhost' in page.canonical_url or '127.0.0.1' in page.canonical_url
        ):
            page.canonical_url = ''
            dirty = True
        dedicated = public_path_for_slug(page.slug)
        desired_canon = ''
        if dedicated is not None:
            desired_canon = f'{base}{dedicated}'
        elif not (page.canonical_url or '').strip():
            if page.slug in ('kvkk', 'gizlilik', 'kullanim', 'cerez'):
                desired_canon = f'{base}/yasal/{page.slug}'
            else:
                path = '/' if page.is_homepage or page.slug == 'home' else f'/sayfa/{page.slug}'
                desired_canon = f'{base}{path}'
        if desired_canon and (page.canonical_url or '').strip() != desired_canon:
            page.canonical_url = desired_canon
            dirty = True

        if not page.sitemap_include and page.status == WebPage.STATUS_PUBLISHED:
            page.sitemap_include = True
            dirty = True
        if not (page.og_title or '').strip() or _weak_title(page.og_title or ''):
            page.og_title = _clip(page.meta_title or page.title, 100)
            dirty = True
        if not (page.og_description or '').strip() or _weak_desc(page.og_description or ''):
            page.og_description = _clip(page.meta_description, 300)
            dirty = True
        if not (page.og_image or '').strip() and og_fallback:
            page.og_image = og_fallback
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
