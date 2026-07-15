"""Kurumsal sitedeki hazır sayfalar — CMS kaydı olarak otomatik oluşturulur."""
from __future__ import annotations

from typing import Callable

from django.utils import timezone

from apps.kurum.domain.models import Kurum
from apps.website.application.health_service import _site_base_url, ensure_website_health
from apps.website.application.site_bootstrap_service import (
    _ensure_contact_form,
    build_duyurular_blocks,
    build_hakkimizda_blocks,
    build_homepage_blocks,
    build_iletisim_blocks,
    build_programlar_blocks,
    build_sistem_blocks,
)
from apps.website.application.system_default_specs import (
    SYSTEM_DEFAULT_ORDER,
    SYSTEM_DEFAULT_PAGE_SPECS,
    SYSTEM_DEFAULT_SLUGS,
    SystemDefaultPageSpec,
)
from apps.website.blocks.registry import new_block
from apps.website.cms_models import WebPage, WebPageVersion
from apps.website.models import SiteSettings, YasalMetin

BlockBuilder = Callable[[Kurum, SiteSettings | None, str], list[dict]]

BUILDERS: dict[str, BlockBuilder] = {
    'home': lambda k, s, _f: build_homepage_blocks(k, s),
    'hakkimizda': lambda k, _s, _f: build_hakkimizda_blocks(k),
    '3k-sistemi': lambda _k, _s, _f: build_sistem_blocks(),
    'programlar': lambda _k, _s, _f: build_programlar_blocks(),
    'iletisim': lambda k, s, f: build_iletisim_blocks(k, s, f),
    'duyurular': lambda _k, _s, _f: build_duyurular_blocks(),
}


def system_default_sort_key(page: WebPage) -> tuple:
    if page.slug in SYSTEM_DEFAULT_ORDER:
        return (0, SYSTEM_DEFAULT_ORDER[page.slug])
    return (1, (page.title or '').lower())


def _legal_html(kurum_id: int, slug: str, fallback_html: str) -> str:
    yasal = YasalMetin.objects.filter(kurum_id=kurum_id, tur=slug).first()
    if yasal and (yasal.icerik or '').strip():
        return yasal.icerik
    return fallback_html


def _legal_blocks(kurum_id: int, slug: str) -> list[dict]:
    fallbacks = {
        'kvkk': (
            '<h2>Kişisel Verilerin Korunması</h2>'
            '<p>Bu metin örnek bir KVKK aydınlatma metnidir. Kurumunuza özel metni buraya yapıştırın.</p>'
        ),
        'gizlilik': (
            '<h2>Gizlilik Politikası</h2>'
            '<p>Web sitemizi ziyaret ettiğinizde toplanan bilgiler hizmet kalitesini artırmak için kullanılır.</p>'
        ),
        'kullanim': (
            '<h2>Kullanım Koşulları</h2>'
            '<p>Siteye erişerek bu koşulları kabul etmiş sayılırsınız.</p>'
        ),
        'cerez': (
            '<h2>Çerez Politikası</h2>'
            '<p>Sitemiz deneyimi iyileştirmek için çerezler kullanabilir.</p>'
        ),
    }
    return [new_block('richText', {'html': _legal_html(kurum_id, slug, fallbacks.get(slug, ''))})]


def _blocks_for_spec(
    spec: SystemDefaultPageSpec,
    kurum: Kurum,
    settings: SiteSettings | None,
    form_slug: str,
) -> list[dict]:
    builder = BUILDERS.get(spec.slug)
    if builder:
        return builder(kurum, settings, form_slug)
    return _legal_blocks(kurum.id, spec.slug)


def _sync_page_meta(page: WebPage, spec: SystemDefaultPageSpec, base_url: str) -> bool:
    dirty = False
    if not page.is_system_default:
        page.is_system_default = True
        dirty = True
    if page.status != WebPage.STATUS_PUBLISHED:
        page.status = WebPage.STATUS_PUBLISHED
        dirty = True
    if not page.sitemap_include:
        page.sitemap_include = True
        dirty = True
    if spec.is_homepage and not page.is_homepage:
        page.is_homepage = True
        dirty = True
    if page.show_in_menu != spec.show_in_menu:
        page.show_in_menu = spec.show_in_menu
        dirty = True
    if not (page.meta_title or '').strip():
        page.meta_title = spec.title[:70]
        dirty = True
    if not (page.meta_description or '').strip():
        page.meta_description = spec.meta_description[:320]
        dirty = True
    canonical = f'{base_url}{spec.public_path}'
    if (page.canonical_url or '').strip() != canonical:
        if not (page.canonical_url or '').strip() or 'localhost' in (page.canonical_url or ''):
            page.canonical_url = canonical
            dirty = True
    if not page.publish_at:
        page.publish_at = timezone.now()
        dirty = True
    return dirty


def ensure_system_default_pages(kurum_id: int) -> dict:
    """
    Kamu sitedeki hazır sayfaları CMS WebPage kaydı olarak oluşturur (idempotent).
    Mevcut içeriği ezmez; yalnızca eksik kayıtları ekler ve meta/sitemap alanlarını tamamlar.
    """
    kurum = Kurum.objects.filter(pk=kurum_id).first()
    if not kurum:
        return {'ok': False, 'error': 'Kurum bulunamadı', 'created': [], 'updated': []}

    settings = SiteSettings.objects.filter(kurum_id=kurum_id).first()
    form_slug = _ensure_contact_form(kurum_id)
    base_url = _site_base_url()
    created: list[str] = []
    updated: list[str] = []
    homepage_id: int | None = None

    for spec in SYSTEM_DEFAULT_PAGE_SPECS:
        page = WebPage.objects.filter(kurum_id=kurum_id, locale='tr', slug=spec.slug).first()
        page_created = False
        if not page:
            page = WebPage.objects.create(
                kurum_id=kurum_id,
                locale='tr',
                slug=spec.slug,
                title=spec.title[:200],
                status=WebPage.STATUS_PUBLISHED,
                is_homepage=spec.is_homepage,
                is_system_default=True,
                show_in_menu=spec.show_in_menu,
                meta_title=spec.title[:70],
                meta_description=spec.meta_description[:320],
                canonical_url=f'{base_url}{spec.public_path}',
                sitemap_include=True,
                publish_at=timezone.now(),
                published_version=0,
            )
            page_created = True
            created.append(spec.slug)

        dirty = _sync_page_meta(page, spec, base_url)
        if dirty and not page_created:
            page.save()
            updated.append(spec.slug)
        elif page_created:
            page.save()

        if spec.is_homepage:
            homepage_id = page.id

        if not page.versions.exists():
            blocks = _blocks_for_spec(spec, kurum, settings, form_slug)
            next_ver = (page.versions.count() or 0) + 1
            WebPageVersion.objects.create(
                page=page,
                version=next_ver,
                label='Sistem varsayılan sayfa',
                blocks=blocks,
                is_autosave=False,
            )
            page.published_version = next_ver
            page.save(update_fields=['published_version', 'updated_at'])
            if spec.slug not in created:
                updated.append(spec.slug)

    if homepage_id:
        WebPage.objects.filter(kurum_id=kurum_id, is_homepage=True).exclude(pk=homepage_id).update(
            is_homepage=False,
        )

    health = None
    if created or updated:
        health = ensure_website_health(kurum_id)

    return {
        'ok': True,
        'created': created,
        'updated': sorted(set(updated)),
        'health': health,
    }
