"""Mevcut section CMS verisini WebPage + bloklara dönüştür."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.website.blocks.registry import new_block
from apps.website.cms_models import (
    ContentEntry,
    IntegrationSettings,
    NavItem,
    NavMenu,
    SiteTheme,
    WebPage,
    WebPageVersion,
)
from apps.website.models import (
    BasariIstatistik,
    Duyuru,
    HeroSlide,
    NedenKart,
    OgrenciYorumu,
    SiteFooterLink,
    SiteSettings,
    SiteSocialLink,
    SinavTakvim,
    SSS,
    YasalMetin,
)


def _media_url(field) -> str:
    if not field:
        return ''
    try:
        return field.url
    except Exception:
        return ''


@transaction.atomic
def migrate_kurum_to_pages(kurum_id: int, *, force: bool = False) -> dict:
    """
    Section CMS → homepage WebPage + menü + içerik + entegrasyon.
    force=False ise homepage zaten varsa atlar.
    """
    existing_home = WebPage.objects.filter(kurum_id=kurum_id, is_homepage=True).first()
    if existing_home and not force:
        return {'skipped': True, 'homepage_id': existing_home.id, 'reason': 'homepage_exists'}

    settings = SiteSettings.objects.filter(kurum_id=kurum_id).first()
    blocks: list[dict] = []

    # Hero
    slides = list(HeroSlide.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira'))
    slide_urls = [_media_url(s.gorsel) for s in slides if s.gorsel]
    blocks.append(new_block('hero', {
        'title': (settings.hero_baslik if settings else '') or '',
        'subtitle': (settings.hero_alt_baslik if settings else '') or '',
        'description': (settings.hero_slogan if settings else '') or '',
        'imageUrl': slide_urls[0] if slide_urls else '',
        'button1': {'label': 'İletişim', 'url': '#iletisim'},
        'button2': {'label': 'Duyurular', 'url': '/duyurular'},
    }))
    if len(slide_urls) > 1:
        blocks.append(new_block('slider', {
            'slides': [{'imageUrl': u} for u in slide_urls],
            'autoplay': True,
            'intervalMs': 5000,
        }))

    if settings and (settings.tanitim_baslik or settings.tanitim_icerik):
        html = ''
        if settings.tanitim_baslik:
            html += f'<h2>{settings.tanitim_baslik}</h2>'
        if settings.tanitim_icerik:
            html += f'<p>{settings.tanitim_icerik}</p>'
        blocks.append(new_block('richText', {'html': html}))

    if settings and settings.youtube_video_id:
        blocks.append(new_block('youtube', {'videoId': settings.youtube_video_id}))

    neden = list(NedenKart.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira'))
    if neden:
        blocks.append(new_block('iconBoxes', {
            'columns': 3,
            'items': [
                {'icon': k.ikon, 'title': k.baslik, 'description': k.aciklama}
                for k in neden
            ],
        }))

    basari = list(BasariIstatistik.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira'))
    if basari:
        blocks.append(new_block('counter', {
            'items': [{'label': b.etiket, 'value': b.deger} for b in basari],
        }))

    yorumlar = list(OgrenciYorumu.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira'))
    if yorumlar:
        blocks.append(new_block('testimonials', {
            'items': [
                {'name': y.ad, 'role': y.rol, 'rating': y.puan, 'text': y.yorum}
                for y in yorumlar
            ],
        }))

    sss = list(SSS.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira'))
    if sss:
        blocks.append(new_block('faq', {
            'source': 'manual',
            'items': [{'question': s.soru, 'answer': s.cevap} for s in sss],
        }))

    blocks.append(new_block('duyurularList', {'limit': 6, 'kind': 'duyuru'}))
    blocks.append(new_block('sinavTakvim', {'limit': 12}))

    if settings and settings.harita_embed_url:
        blocks.append(new_block('map', {'embedUrl': settings.harita_embed_url}))

    blocks.append(new_block('cta', {
        'title': 'Bizimle iletişime geçin',
        'description': (settings.telefon if settings else '') or '',
        'buttonLabel': 'İletişim',
        'buttonUrl': '#iletisim',
    }))

    if existing_home and force:
        page = existing_home
        page.title = ((settings.hero_baslik if settings else None) or page.title or 'Anasayfa')[:200]
        page.status = WebPage.STATUS_PUBLISHED
        page.is_homepage = True
        page.slug = 'home'
        if settings:
            page.meta_title = (settings.seo_baslik or page.meta_title or '')[:70]
            page.meta_description = (settings.seo_aciklama or page.meta_description or '')[:320]
            page.meta_keywords = (settings.seo_anahtar_kelimeler or page.meta_keywords or '')[:500]
            page.canonical_url = (settings.seo_canonical_url or page.canonical_url or '')[:500]
            page.robots_index = settings.seo_robots_index
        page.save()
    else:
        page = WebPage.objects.create(
            kurum_id=kurum_id,
            title=((settings.hero_baslik if settings else None) or 'Anasayfa')[:200],
            slug='home',
            status=WebPage.STATUS_PUBLISHED,
            is_homepage=True,
            show_in_menu=True,
            meta_title=((settings.seo_baslik if settings else '') or '')[:70],
            meta_description=((settings.seo_aciklama if settings else '') or '')[:320],
            meta_keywords=((settings.seo_anahtar_kelimeler if settings else '') or '')[:500],
            canonical_url=((settings.seo_canonical_url if settings else '') or '')[:500],
            robots_index=settings.seo_robots_index if settings else True,
            publish_at=timezone.now(),
            published_version=1,
        )

    next_ver = (page.versions.count() or 0) + 1
    WebPageVersion.objects.create(
        page=page,
        version=next_ver,
        label='Section CMS migrasyonu',
        blocks=blocks,
        is_autosave=False,
    )
    page.published_version = next_ver
    page.save(update_fields=['published_version', 'updated_at'])

    # Content entries from Duyuru
    migrated_duyuru = 0
    for d in Duyuru.objects.filter(kurum_id=kurum_id):
        if ContentEntry.objects.filter(kurum_id=kurum_id, legacy_duyuru_id=d.id).exists():
            continue
        ContentEntry.objects.create(
            kurum_id=kurum_id,
            kind=ContentEntry.KIND_DUYURU,
            title=d.baslik,
            slug=d.slug or f'duyuru-{d.id}',
            excerpt=d.ozet or '',
            body=d.icerik or '',
            cover_url=_media_url(d.kapak_gorseli),
            status=ContentEntry.STATUS_PUBLISHED if d.aktif else ContentEntry.STATUS_DRAFT,
            publish_at=timezone.now() if d.yayin_tarihi else None,
            legacy_duyuru_id=d.id,
        )
        migrated_duyuru += 1

    # Legal pages
    legal_pages = 0
    for y in YasalMetin.objects.filter(kurum_id=kurum_id, aktif=True):
        slug = y.tur
        page_obj, created = WebPage.objects.get_or_create(
            kurum_id=kurum_id,
            locale='tr',
            slug=slug,
            defaults={
                'title': y.baslik,
                'status': WebPage.STATUS_PUBLISHED,
                'show_in_menu': False,
                'publish_at': timezone.now(),
                'published_version': 1,
            },
        )
        if created or force:
            WebPageVersion.objects.create(
                page=page_obj,
                version=(page_obj.versions.count() or 0) + 1,
                label='Yasal metin migrasyonu',
                blocks=[new_block('richText', {'html': y.icerik or ''})],
            )
            page_obj.published_version = page_obj.versions.order_by('-version').first().version
            page_obj.title = y.baslik
            page_obj.status = WebPage.STATUS_PUBLISHED
            page_obj.save()
            legal_pages += 1

    # Header menu
    menu, _ = NavMenu.objects.get_or_create(
        kurum_id=kurum_id,
        location=NavMenu.LOCATION_HEADER,
        name='Ana Menü',
        defaults={'aktif': True},
    )
    if not menu.items.exists():
        defaults = [
            ('Anasayfa', '/', None),
            ('Duyurular', '/duyurular', None),
            ('Hakkımızda', '/hakkimizda', None),
            ('3K Sistemi', '/3k-sistemi', None),
        ]
        for i, (label, url, _) in enumerate(defaults):
            NavItem.objects.create(menu=menu, label=label, url=url, sira=i, aktif=True)

    # Footer menu from SiteFooterLink
    footer_menu, _ = NavMenu.objects.get_or_create(
        kurum_id=kurum_id,
        location=NavMenu.LOCATION_FOOTER,
        name='Footer',
        defaults={'aktif': True},
    )
    if not footer_menu.items.exists():
        for i, fl in enumerate(SiteFooterLink.objects.filter(kurum_id=kurum_id, aktif=True).order_by('kolon', 'sira')):
            NavItem.objects.create(
                menu=footer_menu,
                label=fl.etiket,
                url=fl.url or '#',
                description=fl.kolon,
                sira=i,
                aktif=True,
            )

    # Theme + integrations from SiteSettings
    theme, _ = SiteTheme.objects.get_or_create(kurum_id=kurum_id)
    if settings:
        theme.footer_config = {
            'copyright': settings.footer_copyright,
            'title': settings.footer_baslik,
            'description': settings.footer_aciklama,
            'brand_line': settings.footer_marka_metni,
            'telefon': settings.telefon,
            'whatsapp': settings.whatsapp,
            'eposta': settings.eposta,
            'adres': settings.adres,
            'calisma_saatleri': settings.calisma_saatleri,
            'social': [
                {'platform': s.platform, 'url': s.url}
                for s in SiteSocialLink.objects.filter(kurum_id=kurum_id, aktif=True).order_by('sira')
            ],
        }
        theme.save()

        integ, _ = IntegrationSettings.objects.get_or_create(kurum_id=kurum_id)
        if settings.google_analytics_id and not integ.ga4_id:
            integ.ga4_id = settings.google_analytics_id
        if settings.google_site_verification and not integ.search_console_verification:
            integ.search_console_verification = settings.google_site_verification
        integ.save()

    sinav_count = SinavTakvim.objects.filter(kurum_id=kurum_id).count()

    return {
        'skipped': False,
        'homepage_id': page.id,
        'blocks': len(blocks),
        'duyuru_migrated': migrated_duyuru,
        'legal_pages': legal_pages,
        'sinav_count': sinav_count,
        'version': next_ver,
    }
