"""WebPage CRUD, versiyonlama, yayınlama."""
from __future__ import annotations

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.text import slugify

from apps.website.application.system_default_specs import public_path_for_slug
from apps.website.blocks.registry import validate_blocks
from apps.website.cms_models import RedirectRule, SlugHistory, WebPage, WebPageVersion


def serialize_page(page: WebPage, *, include_blocks: bool = False, version: WebPageVersion | None = None) -> dict:
    data = {
        'id': page.id,
        'title': page.title,
        'slug': page.slug,
        'status': page.status,
        'template': page.template,
        'locale': page.locale,
        'show_in_menu': page.show_in_menu,
        'show_breadcrumb': page.show_breadcrumb,
        'is_homepage': page.is_homepage,
        'is_system_default': page.is_system_default,
        'public_path': public_path_for_slug(page.slug),
        'publish_at': page.publish_at.isoformat() if page.publish_at else None,
        'unpublish_at': page.unpublish_at.isoformat() if page.unpublish_at else None,
        'parent_id': page.parent_id,
        'meta_title': page.meta_title,
        'meta_description': page.meta_description,
        'meta_keywords': page.meta_keywords,
        'canonical_url': page.canonical_url,
        'robots_index': page.robots_index,
        'robots_follow': page.robots_follow,
        'og_title': page.og_title,
        'og_description': page.og_description,
        'og_image': page.og_image,
        'twitter_card': page.twitter_card,
        'schema_json': page.schema_json or {},
        'sitemap_include': page.sitemap_include,
        'sitemap_priority': float(page.sitemap_priority),
        'published_version': page.published_version,
        'preview_token': page.preview_token,
        'updated_at': page.updated_at.isoformat() if page.updated_at else None,
        'created_at': page.created_at.isoformat() if page.created_at else None,
    }
    if include_blocks:
        ver = version
        if ver is None:
            ver = (
                page.versions.filter(version=page.published_version).first()
                if page.published_version
                else page.versions.order_by('-version').first()
            )
        data['blocks'] = (ver.blocks if ver else []) or []
        data['version'] = ver.version if ver else 0
        data['version_id'] = ver.id if ver else None
    return data


class PageService:
    def list_pages(self, kurum_id: int, *, status: str | None = None):
        qs = WebPage.objects.filter(kurum_id=kurum_id)
        if status:
            qs = qs.filter(status=status)
        return qs.select_related('parent')

    def get_page(self, kurum_id: int, page_id: int) -> WebPage | None:
        return WebPage.objects.filter(kurum_id=kurum_id, pk=page_id).first()

    def get_by_slug(self, kurum_id: int, slug: str, *, locale: str = 'tr') -> WebPage | None:
        return WebPage.objects.filter(kurum_id=kurum_id, slug=slug, locale=locale).first()

    def get_homepage(self, kurum_id: int, *, locale: str = 'tr') -> WebPage | None:
        return WebPage.objects.filter(
            kurum_id=kurum_id, locale=locale, is_homepage=True,
        ).first()

    @transaction.atomic
    def create_page(self, kurum_id: int, data: dict, user=None) -> tuple[WebPage | None, dict | None]:
        title = (data.get('title') or '').strip()
        if not title:
            return None, {'title': 'Başlık zorunlu'}

        blocks, block_errors = validate_blocks(data.get('blocks') or [])
        if block_errors:
            return None, {'blocks': '; '.join(block_errors)}

        page = WebPage(
            kurum_id=kurum_id,
            title=title,
            slug=(data.get('slug') or slugify(title) or 'sayfa')[:220],
            status=data.get('status') or WebPage.STATUS_DRAFT,
            template=data.get('template') or 'default',
            locale=data.get('locale') or 'tr',
            show_in_menu=bool(data.get('show_in_menu', False)),
            show_breadcrumb=bool(data.get('show_breadcrumb', True)),
            is_homepage=bool(data.get('is_homepage', False)),
            parent_id=data.get('parent_id'),
            created_by=user if user and getattr(user, 'is_authenticated', False) else None,
            updated_by=user if user and getattr(user, 'is_authenticated', False) else None,
        )
        self._apply_seo_fields(page, data)
        if page.is_homepage:
            WebPage.objects.filter(kurum_id=kurum_id, locale=page.locale, is_homepage=True).update(is_homepage=False)
        page.save()

        WebPageVersion.objects.create(
            page=page,
            version=1,
            label='İlk sürüm',
            blocks=blocks,
            is_autosave=False,
            created_by=user if user and getattr(user, 'is_authenticated', False) else None,
        )
        return page, None

    @transaction.atomic
    def update_page(self, page: WebPage, data: dict, user=None, *, autosave: bool = False) -> tuple[WebPage | None, dict | None]:
        old_slug = page.slug
        if 'title' in data and data['title']:
            page.title = str(data['title']).strip()
        if 'slug' in data and data['slug']:
            new_slug = slugify(str(data['slug'])) or page.slug
            if new_slug != page.slug:
                SlugHistory.objects.get_or_create(
                    kurum_id=page.kurum_id, old_slug=page.slug,
                    defaults={'page': page},
                )
                RedirectRule.objects.update_or_create(
                    kurum_id=page.kurum_id,
                    source_path=f'/{page.slug}' if page.slug != 'home' else '/',
                    defaults={
                        'target_path': f'/{new_slug}' if new_slug != 'home' else '/',
                        'redirect_type': RedirectRule.TYPE_301,
                        'aktif': True,
                    },
                )
                page.slug = new_slug
        for field in (
            'status', 'template', 'locale', 'show_in_menu', 'show_breadcrumb',
            'is_homepage', 'parent_id', 'publish_at', 'unpublish_at',
        ):
            if field in data:
                setattr(page, field, data[field])
        self._apply_seo_fields(page, data)
        if page.is_homepage:
            WebPage.objects.filter(
                kurum_id=page.kurum_id, locale=page.locale, is_homepage=True,
            ).exclude(pk=page.pk).update(is_homepage=False)

        page.updated_by = user if user and getattr(user, 'is_authenticated', False) else None
        page.save()

        if 'blocks' in data:
            blocks, block_errors = validate_blocks(data.get('blocks'))
            if block_errors:
                return None, {'blocks': '; '.join(block_errors)}
            next_ver = (page.versions.aggregate(m=Max('version'))['m'] or 0) + 1
            WebPageVersion.objects.create(
                page=page,
                version=next_ver,
                label='Otomatik kayıt' if autosave else (data.get('version_label') or f'v{next_ver}'),
                blocks=blocks,
                is_autosave=autosave,
                created_by=user if user and getattr(user, 'is_authenticated', False) else None,
            )
            if data.get('publish'):
                page.published_version = next_ver
                page.status = WebPage.STATUS_PUBLISHED
                if not page.publish_at:
                    page.publish_at = timezone.now()
                page.save(update_fields=['published_version', 'status', 'publish_at', 'updated_at'])

        _ = old_slug  # lint
        return page, None

    @transaction.atomic
    def publish(self, page: WebPage, *, version: int | None = None, user=None) -> WebPage:
        ver = version
        if ver is None:
            latest = page.versions.order_by('-version').first()
            ver = latest.version if latest else 0
        page.published_version = ver
        page.status = WebPage.STATUS_PUBLISHED
        if not page.publish_at:
            page.publish_at = timezone.now()
        page.updated_by = user if user and getattr(user, 'is_authenticated', False) else None
        page.save()
        return page

    def delete_page(self, page: WebPage):
        if page.is_system_default:
            raise ValueError('Sistem varsayılan sayfalar silinemez.')
        page.delete()

    def _apply_seo_fields(self, page: WebPage, data: dict):
        for field in (
            'meta_title', 'meta_description', 'meta_keywords', 'canonical_url',
            'robots_index', 'robots_follow', 'og_title', 'og_description',
            'og_image', 'twitter_card', 'schema_json', 'sitemap_include',
            'sitemap_priority',
        ):
            if field in data:
                setattr(page, field, data[field])
