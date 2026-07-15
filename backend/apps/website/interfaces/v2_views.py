"""CMS v2 admin + public API views."""
from __future__ import annotations

import json
import re

from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.kurum.domain.models import Kurum
from apps.website.application.content_service import (
    append_attachment_media,
    append_gallery_media,
    apply_media_as_cover,
    landing_content_qs,
    parse_datetime,
    published_content_qs,
    remove_attachment_item,
    remove_gallery_item,
    serialize_admin_content,
    serialize_public_content,
)
from apps.website.application.media_service import create_media_asset, serialize_media
from apps.website.application.migrate_service import migrate_kurum_to_pages
from apps.website.application.page_service import PageService, serialize_page
from apps.website.application.seo_service import score_page, site_seo_warnings
from apps.website.application.system_default_pages import ensure_system_default_pages, system_default_sort_key
from apps.website.blocks.registry import list_block_types, validate_blocks
from apps.website.cms_models import (
    ContentEntry,
    FormDefinition,
    FormSubmission,
    IntegrationSettings,
    MediaAsset,
    NavItem,
    NavMenu,
    NotFoundHit,
    RedirectRule,
    SiteTheme,
    WebPage,
    WebPageVersion,
)
from apps.website.models import Duyuru, IletisimMesaji, SiteSettings, SinavTakvim
from apps.website.seed_defaults import resolve_landing_kurum
from shared.context import get_secili_kurum_id
from shared.permissions import user_has_module_permission, user_has_permission


def _parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return None


def _require_website_auth(request, *, write: bool = False):
    if not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Yetkilendirme gerekli'}, status=401)
    # Geriye uyum: website yetkisi yoksa authenticated kurum yöneticisi erişebilir
    has_module = user_has_module_permission(request.user, 'website', write=write)
    if has_module or request.user.is_superuser or user_has_permission(request.user, 'sistem.admin'):
        return None
    if user_has_permission(request.user, 'kurum.manage'):
        return None
    # Geçiş: henüz seed edilmemiş ortamlarda auth yeterli (eski davranış)
    if not write:
        return None
    return None


def _kurum_id(request) -> int | None:
    kid = get_secili_kurum_id(request)
    if kid:
        return kid
    kurum = resolve_landing_kurum()
    return kurum.id if kurum else None


def _ok(data=None, status: int = 200, **extra):
    payload = {'success': True}
    if data is not None:
        payload['data'] = data
    payload.update(extra)
    return JsonResponse(payload, status=status)


def _err(message: str, status: int = 400, **extra):
    payload = {'success': False, 'error': message}
    payload.update(extra)
    return JsonResponse(payload, status=status)


# ─── Dashboard ───────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET'])
def api_v2_dashboard(request):
    auth = _require_website_auth(request)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if not kurum_id:
        return _err('Kurum seçilmedi', 400)

    ensure_system_default_pages(kurum_id)

    try:
        pages = WebPage.objects.filter(kurum_id=kurum_id)
        media_count = MediaAsset.objects.filter(kurum_id=kurum_id).count()
        form_subs = FormSubmission.objects.filter(form__kurum_id=kurum_id).count()
        content_count = ContentEntry.objects.filter(kurum_id=kurum_id).count()
        # legacy fallbacks
        duyuru_count = content_count or Duyuru.objects.filter(kurum_id=kurum_id).count()
        mesaj_count = IletisimMesaji.objects.filter(kurum_id=kurum_id).count()

        recent = [
            serialize_page(p) for p in pages.order_by('-updated_at')[:8]
        ]
        warnings = site_seo_warnings(kurum_id)[:20]
        integ = IntegrationSettings.objects.filter(kurum_id=kurum_id).first()
        theme = SiteTheme.objects.filter(kurum_id=kurum_id).first()
        legacy_settings = SiteSettings.objects.filter(kurum_id=kurum_id).first()
        ga4_ok = bool(
            (integ and (integ.ga4_id or '').strip())
            or (legacy_settings and (legacy_settings.google_analytics_id or '').strip())
        )
        favicon_ok = bool(theme and (theme.favicon_url or '').strip())

        return _ok({
            'totals': {
                'pages': pages.count(),
                'published': pages.filter(status=WebPage.STATUS_PUBLISHED).count(),
                'draft': pages.filter(status=WebPage.STATUS_DRAFT).count(),
                'content': duyuru_count,
                'duyuru': duyuru_count,
                'haber': ContentEntry.objects.filter(kurum_id=kurum_id, kind='haber').count(),
                'etkinlik': ContentEntry.objects.filter(kurum_id=kurum_id, kind='etkinlik').count(),
                'media': media_count,
                'form_submissions': form_subs,
                'contact_messages': mesaj_count,
                'sinav': SinavTakvim.objects.filter(kurum_id=kurum_id).count(),
            },
            'recent_pages': recent,
            'seo_warnings': warnings,
            'health': {
                'sitemap_ok': pages.filter(status=WebPage.STATUS_PUBLISHED, sitemap_include=True).exists(),
                'robots_custom': bool(integ and (integ.robots_txt or '').strip()),
                'favicon_ok': favicon_ok,
                'ga4_ok': ga4_ok,
            },
        })
    except Exception as exc:
        from django.db.utils import OperationalError, ProgrammingError
        if isinstance(exc, (ProgrammingError, OperationalError)):
            return _err(
                'Veritabanı şeması güncel değil. Çalıştırın: python manage.py migrate website '
                '(Docker: docker compose -f docker-compose.dev.yml exec backend python manage.py migrate website)',
                503,
            )
        raise


# ─── Block types ─────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET'])
def api_v2_block_types(request):
    auth = _require_website_auth(request)
    if auth:
        return auth
    return _ok(list_block_types())


# ─── Pages ───────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_pages(request):
    auth = _require_website_auth(request, write=request.method == 'POST')
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if not kurum_id:
        return _err('Kurum seçilmedi')
    svc = PageService()

    if request.method == 'GET':
        ensure_system_default_pages(kurum_id)
        status = request.GET.get('status')
        pages = sorted(svc.list_pages(kurum_id, status=status), key=system_default_sort_key)
        return _ok([serialize_page(p) for p in pages])

    body = _parse_json(request)
    if body is None:
        return _err('Geçersiz JSON')
    page, errors = svc.create_page(kurum_id, body, user=request.user)
    if errors:
        return _err('Doğrulama hatası', errors=errors)
    return _ok(serialize_page(page, include_blocks=True), status=201)


@csrf_exempt
@require_http_methods(['GET', 'PATCH', 'PUT', 'DELETE'])
def api_v2_page_detail(request, pk: int):
    write = request.method != 'GET'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    svc = PageService()
    page = svc.get_page(kurum_id, pk)
    if not page:
        return _err('Sayfa bulunamadı', 404)

    if request.method == 'GET':
        version_no = request.GET.get('version')
        version = None
        if version_no:
            version = page.versions.filter(version=int(version_no)).first()
        return _ok(serialize_page(page, include_blocks=True, version=version))

    if request.method == 'DELETE':
        try:
            svc.delete_page(page)
        except ValueError as exc:
            return _err(str(exc), 400)
        return _ok({'deleted': True})

    body = _parse_json(request)
    if body is None:
        return _err('Geçersiz JSON')
    autosave = bool(body.pop('autosave', False))
    page, errors = svc.update_page(page, body, user=request.user, autosave=autosave)
    if errors:
        return _err('Doğrulama hatası', errors=errors)
    return _ok(serialize_page(page, include_blocks=True))


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_page_publish(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    svc = PageService()
    page = svc.get_page(kurum_id, pk)
    if not page:
        return _err('Sayfa bulunamadı', 404)
    body = _parse_json(request) or {}
    page = svc.publish(page, version=body.get('version'), user=request.user)
    return _ok(serialize_page(page, include_blocks=True))


@csrf_exempt
@require_http_methods(['GET'])
def api_v2_page_versions(request, pk: int):
    auth = _require_website_auth(request)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    page = PageService().get_page(kurum_id, pk)
    if not page:
        return _err('Sayfa bulunamadı', 404)
    versions = [
        {
            'id': v.id,
            'version': v.version,
            'label': v.label,
            'is_autosave': v.is_autosave,
            'created_at': v.created_at.isoformat() if v.created_at else None,
            'block_count': len(v.blocks or []),
        }
        for v in page.versions.all()[:50]
    ]
    return _ok(versions)


@csrf_exempt
@require_http_methods(['GET'])
def api_v2_page_seo_score(request, pk: int):
    auth = _require_website_auth(request)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    page = PageService().get_page(kurum_id, pk)
    if not page:
        return _err('Sayfa bulunamadı', 404)
    ver = page.versions.order_by('-version').first()
    return _ok(score_page(page, ver.blocks if ver else []))


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_page_duplicate(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    svc = PageService()
    page = svc.get_page(kurum_id, pk)
    if not page:
        return _err('Sayfa bulunamadı', 404)
    ver = page.versions.order_by('-version').first()
    data = serialize_page(page, include_blocks=True, version=ver)
    data['title'] = f"{page.title} (Kopya)"
    data['slug'] = f"{page.slug}-kopya"
    data['status'] = WebPage.STATUS_DRAFT
    data['is_homepage'] = False
    data['blocks'] = (ver.blocks if ver else []) or []
    new_page, errors = svc.create_page(kurum_id, data, user=request.user)
    if errors:
        return _err('Kopyalanamadı', errors=errors)
    return _ok(serialize_page(new_page, include_blocks=True))


# ─── Media ───────────────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_media(request):
    write = request.method == 'POST'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if not kurum_id:
        return _err('Kurum seçilmedi')

    if request.method == 'GET':
        qs = MediaAsset.objects.filter(kurum_id=kurum_id).prefetch_related('variants')
        folder = request.GET.get('folder')
        if folder:
            qs = qs.filter(folder=folder)
        q = (request.GET.get('q') or '').strip()
        if q:
            qs = qs.filter(title__icontains=q)
        unused = request.GET.get('unused') == '1'
        if unused:
            qs = qs.filter(usage_refs=[])
        return _ok([serialize_media(a) for a in qs[:200]])

    uploaded = request.FILES.get('file')
    if not uploaded:
        return _err('Dosya gerekli')
    asset, error = create_media_asset(
        kurum_id=kurum_id,
        uploaded=uploaded,
        title=request.POST.get('title', ''),
        alt_text=request.POST.get('alt_text', ''),
        folder=request.POST.get('folder', 'genel'),
        user=request.user,
    )
    if error:
        return _err(error)
    return _ok(serialize_media(asset))


@csrf_exempt
@require_http_methods(['PATCH', 'DELETE'])
def api_v2_media_detail(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    asset = MediaAsset.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not asset:
        return _err('Medya bulunamadı', 404)
    if request.method == 'DELETE':
        asset.file.delete(save=False)
        asset.delete()
        return _ok({'deleted': True})
    body = _parse_json(request) or {}
    for field in ('title', 'alt_text', 'caption', 'description', 'folder', 'tags', 'seo_filename'):
        if field in body:
            setattr(asset, field, body[field])
    asset.save()
    return _ok(serialize_media(asset))


# ─── Menus ───────────────────────────────────────────────────

def _serialize_nav_item(item: NavItem) -> dict:
    return {
        'id': item.id,
        'parent_id': item.parent_id,
        'label': item.label,
        'url': item.url,
        'page_id': item.page_id,
        'icon': item.icon,
        'badge': item.badge,
        'description': item.description,
        'open_in_new_tab': item.open_in_new_tab,
        'is_mega': item.is_mega,
        'sira': item.sira,
        'aktif': item.aktif,
        'children': [_serialize_nav_item(c) for c in item.children.filter(aktif=True).order_by('sira')],
    }


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_menus(request):
    write = request.method == 'POST'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if request.method == 'GET':
        menus = NavMenu.objects.filter(kurum_id=kurum_id)
        data = []
        for m in menus:
            roots = m.items.filter(parent__isnull=True).order_by('sira')
            data.append({
                'id': m.id,
                'name': m.name,
                'location': m.location,
                'aktif': m.aktif,
                'items': [_serialize_nav_item(i) for i in roots],
            })
        return _ok(data)

    body = _parse_json(request) or {}
    menu = NavMenu.objects.create(
        kurum_id=kurum_id,
        name=body.get('name') or 'Menü',
        location=body.get('location') or NavMenu.LOCATION_HEADER,
        aktif=bool(body.get('aktif', True)),
    )
    return _ok({'id': menu.id, 'name': menu.name, 'location': menu.location, 'items': []})


@csrf_exempt
@require_http_methods(['POST', 'PATCH', 'DELETE'])
def api_v2_menu_items(request, menu_id: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    menu = NavMenu.objects.filter(kurum_id=kurum_id, pk=menu_id).first()
    if not menu:
        return _err('Menü bulunamadı', 404)

    if request.method == 'POST':
        body = _parse_json(request) or {}
        # Bulk reorder: { items: [{id, parent_id, sira}] }
        if 'items' in body and isinstance(body['items'], list) and body.get('reorder'):
            for row in body['items']:
                NavItem.objects.filter(menu=menu, pk=row.get('id')).update(
                    parent_id=row.get('parent_id'),
                    sira=row.get('sira', 0),
                )
            return _ok({'reordered': True})

        item = NavItem.objects.create(
            menu=menu,
            parent_id=body.get('parent_id'),
            label=body.get('label') or 'Öğe',
            url=body.get('url') or '',
            page_id=body.get('page_id'),
            icon=body.get('icon') or '',
            badge=body.get('badge') or '',
            description=body.get('description') or '',
            open_in_new_tab=bool(body.get('open_in_new_tab')),
            is_mega=bool(body.get('is_mega')),
            sira=int(body.get('sira') or 0),
            aktif=bool(body.get('aktif', True)),
        )
        return _ok(_serialize_nav_item(item))

    body = _parse_json(request) or {}
    item_id = body.get('id')
    item = NavItem.objects.filter(menu=menu, pk=item_id).first()
    if not item:
        return _err('Öğe bulunamadı', 404)
    if request.method == 'DELETE':
        item.delete()
        return _ok({'deleted': True})
    for field in (
        'label', 'url', 'page_id', 'icon', 'badge', 'description',
        'open_in_new_tab', 'is_mega', 'sira', 'aktif', 'parent_id',
    ):
        if field in body:
            setattr(item, field, body[field])
    item.save()
    return _ok(_serialize_nav_item(item))


# ─── Theme / Integrations / Redirects ────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def api_v2_theme(request):
    write = request.method == 'PATCH'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    theme, _ = SiteTheme.objects.get_or_create(kurum_id=kurum_id)
    if request.method == 'GET':
        return _ok({
            'logo_url': theme.logo_url,
            'favicon_url': theme.favicon_url,
            'primary_color': theme.primary_color,
            'secondary_color': theme.secondary_color,
            'accent_color': theme.accent_color,
            'font_heading': theme.font_heading,
            'font_body': theme.font_body,
            'border_radius': theme.border_radius,
            'button_style': theme.button_style,
            'card_style': theme.card_style,
            'header_config': theme.header_config,
            'footer_config': theme.footer_config,
            'css_variables': theme.css_variables,
            'custom_css': theme.custom_css,
            'dark_mode_enabled': theme.dark_mode_enabled,
        })
    body = _parse_json(request) or {}
    for field in (
        'logo_url', 'favicon_url', 'primary_color', 'secondary_color', 'accent_color',
        'font_heading', 'font_body', 'border_radius', 'button_style', 'card_style',
        'header_config', 'footer_config', 'css_variables', 'custom_css', 'dark_mode_enabled',
    ):
        if field in body:
            setattr(theme, field, body[field])
    theme.save()
    return _ok({'saved': True})


@csrf_exempt
@require_http_methods(['GET', 'PATCH'])
def api_v2_integrations(request):
    write = request.method == 'PATCH'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    integ, _ = IntegrationSettings.objects.get_or_create(kurum_id=kurum_id)
    fields = [
        'ga4_id', 'gtm_id', 'search_console_verification', 'google_ads_id',
        'google_maps_api_key', 'recaptcha_site_key', 'recaptcha_secret_key',
        'meta_pixel_id', 'meta_domain_verification', 'clarity_id', 'bing_verification',
        'tiktok_pixel_id', 'linkedin_partner_id', 'hotjar_id', 'yandex_metrica_id',
        'head_code', 'body_start_code', 'body_end_code', 'custom_css', 'custom_js',
        'smtp_config', 'whatsapp_notify', 'robots_txt', 'humans_txt', 'manifest_json',
    ]
    if request.method == 'GET':
        data = {f: getattr(integ, f) for f in fields}
        data['search_console_html_filename'] = integ.search_console_html_filename or ''
        data['search_console_html_uploaded'] = bool(
            (integ.search_console_html_filename or '').strip()
            and (integ.search_console_html_content or '').strip()
        )
        # secret mask
        if data.get('recaptcha_secret_key'):
            data['recaptcha_secret_key'] = '••••••••'
        return _ok(data)
    body = _parse_json(request) or {}
    for f in fields:
        if f in body:
            if f == 'recaptcha_secret_key' and body[f] == '••••••••':
                continue
            setattr(integ, f, body[f])
    integ.save()
    return _ok({'saved': True})


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_integrations_test(request):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    body = _parse_json(request) or {}
    service = body.get('service') or ''
    kurum_id = _kurum_id(request)
    integ = IntegrationSettings.objects.filter(kurum_id=kurum_id).first()
    ok = False
    detail = ''
    if service == 'ga4':
        ok = bool(integ and integ.ga4_id.startswith('G-'))
        detail = integ.ga4_id if ok else 'GA4 ölçüm kimliği G- ile başlamalı'
    elif service == 'gtm':
        ok = bool(integ and integ.gtm_id.startswith('GTM-'))
        detail = integ.gtm_id if ok else 'GTM kimliği GTM- ile başlamalı'
    elif service == 'search_console':
        has_file = bool(
            integ
            and (integ.search_console_html_filename or '').strip()
            and (integ.search_console_html_content or '').strip()
        )
        has_meta = bool(integ and (integ.search_console_verification or '').strip())
        ok = has_file or has_meta
        if has_file:
            detail = f'HTML dosyası yüklü: {integ.search_console_html_filename}'
        elif has_meta:
            detail = 'Doğrulama meta değeri kayıtlı'
        else:
            detail = 'Doğrulama dosyası veya meta kodu yok'
    elif service == 'smtp':
        cfg = (integ.smtp_config if integ else {}) or {}
        ok = bool(cfg.get('host') and cfg.get('user'))
        detail = 'SMTP host/user tanımlı' if ok else 'SMTP yapılandırması eksik'
    else:
        return _err('Bilinmeyen servis')
    return _ok({'service': service, 'ok': ok, 'detail': detail})


_SEARCH_CONSOLE_FILE_RE = re.compile(r'^google[a-z0-9]+\.html$', re.I)


@csrf_exempt
@require_http_methods(['POST', 'DELETE'])
def api_v2_search_console_file(request):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    integ, _ = IntegrationSettings.objects.get_or_create(kurum_id=kurum_id)

    if request.method == 'DELETE':
        integ.search_console_html_filename = ''
        integ.search_console_html_content = ''
        integ.save(update_fields=['search_console_html_filename', 'search_console_html_content'])
        return _ok({'deleted': True})

    uploaded = request.FILES.get('file')
    if not uploaded:
        return _err('Dosya gerekli')
    filename = (uploaded.name or '').strip()
    if not _SEARCH_CONSOLE_FILE_RE.match(filename):
        return _err('Dosya adı google….html formatında olmalı (Google\'dan indirdiğiniz adı değiştirmeyin)')
    raw = uploaded.read()
    if len(raw) > 16384:
        return _err('Dosya 16KB\'dan küçük olmalı')
    try:
        content = raw.decode('utf-8')
    except UnicodeDecodeError:
        content = raw.decode('utf-8', errors='replace')

    integ.search_console_html_filename = filename
    integ.search_console_html_content = content
    meta_match = re.search(
        r'google-site-verification["\']\s*content=["\']([^"\']+)',
        content,
        re.I,
    )
    if meta_match:
        integ.search_console_verification = meta_match.group(1).strip()
    integ.save()
    return _ok({
        'filename': filename,
        'url': f'/{filename}',
        'search_console_verification': integ.search_console_verification or '',
    })


@csrf_exempt
@require_http_methods(['GET'])
def api_public_v2_verification_file(request, kod: str, filename: str):
    from apps.website.seed_defaults import resolve_landing_kurum
    from django.http import Http404

    safe_name = (filename or '').strip()
    if not _SEARCH_CONSOLE_FILE_RE.match(safe_name):
        raise Http404()
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        kurum = resolve_landing_kurum(kod)
    if not kurum:
        raise Http404()
    integ = IntegrationSettings.objects.filter(kurum_id=kurum.id).first()
    if not integ or integ.search_console_html_filename != safe_name:
        raise Http404()
    body = (integ.search_console_html_content or '').strip()
    if not body:
        raise Http404()
    return HttpResponse(body, content_type='text/html; charset=utf-8')


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_redirects(request):
    write = request.method == 'POST'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if request.method == 'GET':
        rows = RedirectRule.objects.filter(kurum_id=kurum_id)
        return _ok([
            {
                'id': r.id,
                'source_path': r.source_path,
                'target_path': r.target_path,
                'redirect_type': r.redirect_type,
                'aktif': r.aktif,
                'hit_count': r.hit_count,
            }
            for r in rows
        ])
    body = _parse_json(request) or {}
    if not body.get('source_path'):
        return _err('source_path zorunlu')
    r = RedirectRule.objects.create(
        kurum_id=kurum_id,
        source_path=body['source_path'],
        target_path=body.get('target_path') or '',
        redirect_type=body.get('redirect_type') or '301',
        aktif=bool(body.get('aktif', True)),
    )
    return _ok({'id': r.id})


# ─── Forms / Content ─────────────────────────────────────────

@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_forms(request):
    write = request.method == 'POST'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if request.method == 'GET':
        forms = FormDefinition.objects.filter(kurum_id=kurum_id)
        return _ok([
            {
                'id': f.id,
                'name': f.name,
                'slug': f.slug,
                'description': f.description,
                'fields': f.fields,
                'settings': f.settings,
                'aktif': f.aktif,
                'submission_count': f.submissions.count(),
            }
            for f in forms
        ])
    body = _parse_json(request) or {}
    if not body.get('name'):
        return _err('name zorunlu')
    from django.utils.text import slugify
    form = FormDefinition.objects.create(
        kurum_id=kurum_id,
        name=body['name'],
        slug=body.get('slug') or slugify(body['name']) or 'form',
        description=body.get('description') or '',
        fields=body.get('fields') or [],
        settings=body.get('settings') or {},
        aktif=bool(body.get('aktif', True)),
    )
    return _ok({'id': form.id, 'slug': form.slug})


@csrf_exempt
@require_http_methods(['GET', 'PATCH', 'DELETE'])
def api_v2_form_detail(request, pk: int):
    write = request.method != 'GET'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    form = FormDefinition.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not form:
        return _err('Form bulunamadı', 404)
    if request.method == 'DELETE':
        form.delete()
        return _ok({'deleted': True})
    if request.method == 'PATCH':
        body = _parse_json(request) or {}
        for field in ('name', 'slug', 'description', 'fields', 'settings', 'aktif'):
            if field in body:
                setattr(form, field, body[field])
        form.save()
    return _ok({
        'id': form.id,
        'name': form.name,
        'slug': form.slug,
        'description': form.description,
        'fields': form.fields,
        'settings': form.settings,
        'aktif': form.aktif,
    })


@csrf_exempt
@require_http_methods(['GET'])
def api_v2_form_submissions(request, pk: int):
    auth = _require_website_auth(request)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    form = FormDefinition.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not form:
        return _err('Form bulunamadı', 404)
    rows = [
        {
            'id': s.id,
            'payload': s.payload,
            'created_at': s.created_at.isoformat() if s.created_at else None,
        }
        for s in form.submissions.all()[:500]
    ]
    if request.GET.get('format') == 'csv':
        import csv
        from io import StringIO
        buf = StringIO()
        keys = sorted({k for r in rows for k in (r['payload'] or {}).keys()})
        writer = csv.DictWriter(buf, fieldnames=['id', 'created_at', *keys])
        writer.writeheader()
        for r in rows:
            row = {'id': r['id'], 'created_at': r['created_at']}
            row.update(r['payload'] or {})
            writer.writerow(row)
        resp = HttpResponse(buf.getvalue(), content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="form-{form.slug}.csv"'
        return resp
    return _ok(rows)


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_v2_content(request):
    write = request.method == 'POST'
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if request.method == 'GET':
        kind = request.GET.get('kind')
        qs = ContentEntry.objects.filter(kurum_id=kurum_id)
        if kind:
            qs = qs.filter(kind=kind)
        return _ok([serialize_admin_content(c) for c in qs[:200]])

    body = _parse_json(request) or {}

    # Sürükle-bırak sıralama: { reorder: true, items: [{id, sira}] }
    if body.get('reorder') and isinstance(body.get('items'), list):
        for row in body['items']:
            ContentEntry.objects.filter(kurum_id=kurum_id, pk=row.get('id')).update(
                sira=row.get('sira', 0),
            )
        return _ok({'reordered': True})

    if not body.get('title'):
        return _err('Başlık zorunlu')
    from django.utils.text import slugify
    c = ContentEntry.objects.create(
        kurum_id=kurum_id,
        kind=body.get('kind') or ContentEntry.KIND_DUYURU,
        title=body['title'],
        slug=body.get('slug') or slugify(body['title']),
        excerpt=body.get('excerpt') or '',
        body=body.get('body') or '',
        cover_url=body.get('cover_url') or '',
        tags=body.get('tags') or [],
        author_name=body.get('author_name') or '',
        status=body.get('status') or ContentEntry.STATUS_DRAFT,
        is_featured=bool(body.get('is_featured')),
        is_pinned=bool(body.get('is_pinned')),
        show_as_popup=bool(body.get('show_as_popup')),
        priority=body.get('priority') or ContentEntry.PRIORITY_NORMAL,
        publish_at=parse_datetime(body.get('publish_at')),
        unpublish_at=parse_datetime(body.get('unpublish_at')),
        meta_title=body.get('meta_title') or '',
        meta_description=body.get('meta_description') or '',
    )
    return _ok({'id': c.id, 'slug': c.slug})


def _serialize_content(c, *, full: bool = False):
    return serialize_admin_content(c, full=full)


@csrf_exempt
@require_http_methods(['GET', 'PATCH', 'DELETE'])
def api_v2_content_detail(request, pk: int):
    write = request.method in ('PATCH', 'DELETE')
    auth = _require_website_auth(request, write=write)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)

    if request.method == 'GET':
        return _ok(_serialize_content(c, full=True))

    if request.method == 'DELETE':
        c.delete()
        return _ok({'deleted': True})

    body = _parse_json(request) or {}
    for field in (
        'kind', 'title', 'excerpt', 'body', 'cover_url', 'cover_thumb_url', 'author_name',
        'status', 'is_featured', 'is_pinned', 'show_as_popup', 'sira', 'priority',
        'meta_title', 'meta_description', 'gallery', 'attachments',
    ):
        if field in body:
            setattr(c, field, body[field])
    if 'publish_at' in body:
        c.publish_at = parse_datetime(body.get('publish_at'))
    if 'unpublish_at' in body:
        c.unpublish_at = parse_datetime(body.get('unpublish_at'))
    if 'slug' in body and body['slug']:
        c.slug = body['slug']
    c.save()
    return _ok(_serialize_content(c, full=True))


@csrf_exempt
@require_http_methods(['POST', 'DELETE'])
def api_v2_content_cover(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)
    if request.method == 'DELETE':
        c.cover_url = ''
        c.cover_thumb_url = ''
        c.save(update_fields=['cover_url', 'cover_thumb_url', 'updated_at'])
        return _ok(_serialize_content(c, full=True))
    uploaded = request.FILES.get('file')
    if not uploaded:
        media_id = request.POST.get('media_id') or ( _parse_json(request) or {}).get('media_id')
        if media_id:
            asset = MediaAsset.objects.filter(kurum_id=kurum_id, pk=media_id).first()
            if not asset:
                return _err('Medya bulunamadı', 404)
            apply_media_as_cover(c, asset)
            return _ok(_serialize_content(c, full=True))
        return _err('Dosya veya media_id gerekli')
    asset, error = create_media_asset(
        kurum_id=kurum_id,
        uploaded=uploaded,
        title=request.POST.get('title', c.title),
        folder='icerik',
        user=request.user,
    )
    if error:
        return _err(error)
    apply_media_as_cover(c, asset)
    return _ok(_serialize_content(c, full=True))


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_content_gallery(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)
    uploaded = request.FILES.get('file')
    if not uploaded:
        return _err('Dosya gerekli')
    asset, error = create_media_asset(
        kurum_id=kurum_id,
        uploaded=uploaded,
        title=request.POST.get('title', ''),
        folder='icerik-galeri',
        user=request.user,
    )
    if error:
        return _err(error)
    row = append_gallery_media(c, asset, title=request.POST.get('title', ''))
    return _ok({'item': row, 'content': _serialize_content(c, full=True)})


@csrf_exempt
@require_http_methods(['DELETE'])
def api_v2_content_gallery_item(request, pk: int, item_id: str):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)
    if not remove_gallery_item(c, item_id):
        return _err('Galeri öğesi bulunamadı', 404)
    return _ok(_serialize_content(c, full=True))


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_content_attachment(request, pk: int):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)
    uploaded = request.FILES.get('file')
    if not uploaded:
        return _err('Dosya gerekli')
    asset, error = create_media_asset(
        kurum_id=kurum_id,
        uploaded=uploaded,
        title=request.POST.get('title', uploaded.name),
        folder='icerik-ekler',
        user=request.user,
    )
    if error:
        return _err(error)
    row = append_attachment_media(c, asset, title=request.POST.get('title', ''))
    return _ok({'item': row, 'content': _serialize_content(c, full=True)})


@csrf_exempt
@require_http_methods(['DELETE'])
def api_v2_content_attachment_item(request, pk: int, item_id: str):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    c = ContentEntry.objects.filter(kurum_id=kurum_id, pk=pk).first()
    if not c:
        return _err('İçerik bulunamadı', 404)
    if not remove_attachment_item(c, item_id):
        return _err('Ek dosya bulunamadı', 404)
    return _ok(_serialize_content(c, full=True))


# ─── Migrate / SEO warnings ──────────────────────────────────

@csrf_exempt
@require_http_methods(['POST'])
def api_v2_migrate_legacy(request):
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    body = _parse_json(request) or {}
    result = migrate_kurum_to_pages(kurum_id, force=bool(body.get('force')))
    from apps.website.application.health_service import ensure_website_health
    health = ensure_website_health(kurum_id)
    return _ok({**result, 'health': health})


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_ensure_health(request):
    """Dashboard eksiklerini (GA4, robots, favicon, meta) doldur."""
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if not kurum_id:
        return _err('Kurum seçilmedi')
    body = _parse_json(request) or {}
    from apps.website.application.health_service import ensure_website_health
    result = ensure_website_health(kurum_id, ga4_id=body.get('ga4_id') or None)
    if not result.get('ok'):
        return _err(result.get('error') or 'Sağlık doldurulamadı')
    return _ok(result)


@csrf_exempt
@require_http_methods(['POST'])
def api_v2_bootstrap_content(request):
    """Anasayfa yerleşimi + gerekli sayfalar + menü + örnek içerik."""
    auth = _require_website_auth(request, write=True)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    if not kurum_id:
        return _err('Kurum seçilmedi')
    body = _parse_json(request) or {}
    from apps.website.application.site_bootstrap_service import bootstrap_website_content
    force_home = body.get('force_home', True)
    result = bootstrap_website_content(kurum_id, force_home=bool(force_home))
    if not result.get('ok'):
        return _err(result.get('error') or 'İçerik oluşturulamadı')
    return _ok(result)


@csrf_exempt
@require_http_methods(['GET'])
def api_v2_seo_warnings(request):
    auth = _require_website_auth(request)
    if auth:
        return auth
    kurum_id = _kurum_id(request)
    return _ok(site_seo_warnings(kurum_id))


# ─── Public v2 page by slug ──────────────────────────────────

@csrf_exempt
@require_http_methods(['GET'])
def api_public_v2_page(request, kod: str, slug: str = 'home'):
    from apps.website.seed_defaults import resolve_landing_kurum
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        kurum = resolve_landing_kurum(kod)
    if not kurum:
        return _err('Kurum bulunamadı', 404)
    svc = PageService()
    preview = request.GET.get('preview')
    if slug in ('', 'home', 'index'):
        page = svc.get_homepage(kurum.id) or svc.get_by_slug(kurum.id, 'home')
    else:
        page = svc.get_by_slug(kurum.id, slug)

    if not page:
        # slug history / redirect
        from apps.website.cms_models import SlugHistory
        hist = SlugHistory.objects.filter(kurum_id=kurum.id, old_slug=slug).select_related('page').first()
        if hist:
            return JsonResponse({
                'success': False,
                'redirect': f'/{hist.page.slug}',
                'redirect_type': '301',
            }, status=404)
        NotFoundHit.objects.update_or_create(
            kurum_id=kurum.id, path=f'/{slug}',
            defaults={},
        )
        # increment manually
        hit = NotFoundHit.objects.filter(kurum_id=kurum.id, path=f'/{slug}').first()
        if hit:
            NotFoundHit.objects.filter(pk=hit.pk).update(hit_count=hit.hit_count + 1)
        return _err('Sayfa bulunamadı', 404)

    is_preview = bool(preview and preview == page.preview_token)
    if page.status != WebPage.STATUS_PUBLISHED and not is_preview:
        return _err('Sayfa yayında değil', 404)

    version = None
    if is_preview:
        version = page.versions.order_by('-version').first()
    elif page.published_version:
        version = page.versions.filter(version=page.published_version).first()

    theme = SiteTheme.objects.filter(kurum_id=kurum.id).first()
    integ = IntegrationSettings.objects.filter(kurum_id=kurum.id).first()
    header = NavMenu.objects.filter(
        kurum_id=kurum.id, location=NavMenu.LOCATION_HEADER, aktif=True,
    ).first()
    footer = NavMenu.objects.filter(
        kurum_id=kurum.id, location=NavMenu.LOCATION_FOOTER, aktif=True,
    ).first()

    def _kurum_media(field) -> str:
        if not field:
            return ''
        try:
            return field.url
        except Exception:
            return ''

    logo_url = (theme.logo_url if theme else '') or ''
    favicon_url = (theme.favicon_url if theme else '') or ''
    if not logo_url:
        logo_url = _kurum_media(getattr(kurum, 'app_logo', None)) or _kurum_media(getattr(kurum, 'login_logo', None))
    if not logo_url:
        logo_url = favicon_url or _kurum_media(getattr(kurum, 'favicon', None))
    if not favicon_url:
        favicon_url = _kurum_media(getattr(kurum, 'favicon', None))

    def menu_payload(menu):
        if not menu:
            return None
        roots = menu.items.filter(parent__isnull=True, aktif=True).order_by('sira')
        return {
            'id': menu.id,
            'name': menu.name,
            'items': [_serialize_nav_item(i) for i in roots],
        }

    settings = SiteSettings.objects.filter(kurum_id=kurum.id).first()

    return _ok({
        'page': serialize_page(page, include_blocks=True, version=version),
        'menu': menu_payload(header),
        'footer_menu': menu_payload(footer),
        'theme': {
            'primary_color': theme.primary_color if theme else '#0262a7',
            'secondary_color': theme.secondary_color if theme else '#0ea5e9',
            'logo_url': logo_url,
            'favicon_url': favicon_url,
            'footer_config': theme.footer_config if theme else {},
            'custom_css': (theme.custom_css if theme else '') or '',
            'css_variables': theme.css_variables if theme else {},
        },
        'integrations': {
            'ga4_id': (integ.ga4_id if integ else '') or (settings.google_analytics_id if settings else ''),
            'gtm_id': integ.gtm_id if integ else '',
            'search_console_verification': (
                (integ.search_console_verification if integ else '')
                or (settings.google_site_verification if settings else '')
            ),
            'meta_pixel_id': integ.meta_pixel_id if integ else '',
            'clarity_id': integ.clarity_id if integ else '',
            'head_code': integ.head_code if integ else '',
            'body_start_code': integ.body_start_code if integ else '',
            'body_end_code': integ.body_end_code if integ else '',
            'robots_txt': integ.robots_txt if integ else '',
        } if integ or settings else {},
        'contact': {
            'telefon': settings.telefon if settings else '',
            'whatsapp': settings.whatsapp if settings else '',
            'eposta': settings.eposta if settings else '',
            'adres': settings.adres if settings else '',
        } if settings else {},
    })


@csrf_exempt
@require_http_methods(['POST'])
def api_public_v2_form_submit(request, kod: str, slug: str):
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        return _err('Kurum bulunamadı', 404)
    form = FormDefinition.objects.filter(kurum_id=kurum.id, slug=slug, aktif=True).first()
    if not form:
        return _err('Form bulunamadı', 404)
    body = _parse_json(request)
    if body is None:
        return _err('Geçersiz JSON')
    # required fields
    for field in form.fields or []:
        if field.get('required') and not body.get(field.get('name')):
            return _err(f"{field.get('label') or field.get('name')} zorunlu")
    FormSubmission.objects.create(
        form=form,
        payload=body,
        ip_address=request.META.get('REMOTE_ADDR'),
        user_agent=(request.META.get('HTTP_USER_AGENT') or '')[:400],
    )
    thanks = (form.settings or {}).get('thank_you') or 'Başvurunuz alındı.'
    return _ok({'message': thanks})


@csrf_exempt
@require_http_methods(['GET'])
def api_public_v2_robots(request, kod: str):
    from apps.website.seed_defaults import resolve_landing_kurum
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        kurum = resolve_landing_kurum(kod)
    if not kurum:
        return HttpResponse('User-agent: *\nDisallow: /\n', content_type='text/plain')
    integ = IntegrationSettings.objects.filter(kurum_id=kurum.id).first()
    if integ and (integ.robots_txt or '').strip():
        return HttpResponse(integ.robots_txt, content_type='text/plain; charset=utf-8')
    body = 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n'
    return HttpResponse(body, content_type='text/plain; charset=utf-8')


@csrf_exempt
@require_http_methods(['GET'])
def api_public_v2_sitemap_pages(request, kod: str):
    from apps.website.seed_defaults import resolve_landing_kurum
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        kurum = resolve_landing_kurum(kod)
    if not kurum:
        return _err('Kurum bulunamadı', 404)
    pages = WebPage.objects.filter(
        kurum_id=kurum.id,
        status=WebPage.STATUS_PUBLISHED,
        sitemap_include=True,
    )

    def _public_path(p: WebPage) -> str:
        if p.is_homepage or p.slug == 'home':
            return '/'
        if p.slug in ('kvkk', 'gizlilik', 'kullanim', 'cerez'):
            return f'/yasal/{p.slug}'
        return f'/sayfa/{p.slug}'

    return _ok([
        {
            'slug': p.slug,
            'is_homepage': p.is_homepage,
            'priority': float(p.sitemap_priority),
            'updated_at': p.updated_at.isoformat() if p.updated_at else None,
            'path': _public_path(p),
        }
        for p in pages
    ])


@csrf_exempt
@require_http_methods(['GET'])
def api_public_v2_content_list(request, kod: str):
    """Public duyuru/haber/blog listesi — filtre: kind, q."""
    from apps.website.seed_defaults import resolve_landing_kurum
    kurum = Kurum.objects.filter(kod__iexact=kod.strip(), aktif_mi=True).first()
    if not kurum:
        kurum = resolve_landing_kurum(kod)
    if not kurum:
        return _err('Kurum bulunamadı', 404)

    kind = (request.GET.get('kind') or '').strip()
    q = (request.GET.get('q') or '').strip()
    limit = min(int(request.GET.get('limit') or 50), 100)

    qs = published_content_qs(kurum.id, kind=kind or None)
    if not kind:
        qs = qs.filter(kind__in=(ContentEntry.KIND_DUYURU, ContentEntry.KIND_HABER))
    if q:
        from django.db.models import Q
        qs = qs.filter(Q(title__icontains=q) | Q(excerpt__icontains=q))

    items = [serialize_public_content(c, request) for c in qs[:limit]]
    popup = None
    popup_entry = qs.filter(show_as_popup=True).first()
    if popup_entry:
        popup = serialize_public_content(popup_entry, request, full=True)

    return _ok({'items': items, 'toplam': qs.count(), 'popup': popup})
