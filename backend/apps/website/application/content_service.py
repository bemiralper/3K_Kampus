"""CMS içerik (duyuru/haber/blog) — yayın filtresi, serileştirme, medya çözümleme."""
from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.website.cms_models import ContentEntry, MediaAsset

ATTACHMENT_EXT_MAP = {
    'pdf': 'pdf',
    'doc': 'word',
    'docx': 'word',
    'xls': 'excel',
    'xlsx': 'excel',
    'ppt': 'powerpoint',
    'pptx': 'powerpoint',
    'zip': 'zip',
    'rar': 'zip',
    '7z': 'zip',
}


def _now():
    return timezone.now()


def published_content_qs(kurum_id: int, *, kind: str | None = None):
    """Yayında ve tarih aralığında olan içerikler."""
    now = _now()
    qs = ContentEntry.objects.filter(
        kurum_id=kurum_id,
        status=ContentEntry.STATUS_PUBLISHED,
    ).filter(
        Q(publish_at__isnull=True) | Q(publish_at__lte=now),
    ).filter(
        Q(unpublish_at__isnull=True) | Q(unpublish_at__gt=now),
    )
    if kind:
        qs = qs.filter(kind=kind)
    return qs.order_by('sira', '-is_pinned', '-publish_at', '-created_at')


def landing_content_qs(kurum_id: int, limit: int = 6):
    """Anasayfa duyuru/haber kartları — önce CMS, yoksa legacy."""
    qs = published_content_qs(kurum_id).filter(
        kind__in=(ContentEntry.KIND_DUYURU, ContentEntry.KIND_HABER),
    )
    return qs[:limit]


def _media_url(request, url: str | None) -> str | None:
    """Medya yolunu same-origin /media/... olarak döndür (frontend proxy ile uyumlu)."""
    if not url:
        return None
    if url.startswith('/media/'):
        return url
    idx = url.find('/media/')
    if idx >= 0:
        return url[idx:]
    if url.startswith('http://') or url.startswith('https://'):
        return url
    return url if url.startswith('/') else f'/{url}'


def _asset_urls(asset: MediaAsset | None, request=None) -> tuple[str | None, str | None]:
    if not asset or not asset.file:
        return None, None
    try:
        file_url = asset.file.url
    except Exception:
        return None, None
    main = _media_url(request, file_url)
    thumb = main
    variants = list(asset.variants.all())
    if variants:
        webp = next((v for v in variants if v.format == 'webp'), variants[0])
        if webp.file:
            try:
                thumb = _media_url(request, webp.file.url) or main
            except Exception:
                pass
    return main, thumb


def _attachment_type(name: str, mime: str = '') -> str:
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    if ext in ATTACHMENT_EXT_MAP:
        return ATTACHMENT_EXT_MAP[ext]
    if 'pdf' in mime:
        return 'pdf'
    if 'word' in mime or 'document' in mime:
        return 'word'
    if 'sheet' in mime or 'excel' in mime:
        return 'excel'
    if 'presentation' in mime or 'powerpoint' in mime:
        return 'powerpoint'
    if 'zip' in mime:
        return 'zip'
    return 'diger'


def resolve_gallery(entry: ContentEntry, request=None) -> list[dict]:
    raw = entry.gallery if isinstance(entry.gallery, list) else []
    media_ids = [int(x.get('media_id')) for x in raw if x.get('media_id')]
    assets = {
        a.id: a for a in MediaAsset.objects.filter(pk__in=media_ids).prefetch_related('variants')
    }
    out = []
    for row in sorted(raw, key=lambda x: x.get('sira', 0)):
        aid = row.get('media_id')
        asset = assets.get(int(aid)) if aid else None
        url, thumb = _asset_urls(asset, request)
        if not url:
            continue
        title = row.get('title') or row.get('baslik') or ''
        out.append({
            'id': row.get('id') or str(aid),
            'media_id': int(aid) if aid else None,
            'title': title,
            'baslik': title,
            'url': url,
            'thumb': thumb or url,
            'genislik': asset.width if asset else 0,
            'yukseklik': asset.height if asset else 0,
            'sira': row.get('sira', 0),
        })
    return out


def resolve_attachments(entry: ContentEntry, request=None) -> list[dict]:
    raw = entry.attachments if isinstance(entry.attachments, list) else []
    media_ids = [int(x.get('media_id')) for x in raw if x.get('media_id')]
    assets = {a.id: a for a in MediaAsset.objects.filter(pk__in=media_ids)}
    out = []
    for row in sorted(raw, key=lambda x: x.get('sira', 0)):
        aid = row.get('media_id')
        asset = assets.get(int(aid)) if aid else None
        if not asset or not asset.file:
            continue
        name = row.get('title') or row.get('dosya_adi') or asset.title or asset.file.name.rsplit('/', 1)[-1]
        out.append({
            'id': row.get('id') or str(aid),
            'media_id': int(aid) if aid else None,
            'title': name,
            'dosya_adi': name,
            'dosya_turu': _attachment_type(name, asset.mime_type or ''),
            'boyut': asset.size_bytes or 0,
            'url': _media_url(request, asset.file.url),
            'sira': row.get('sira', 0),
        })
    return out


def serialize_public_content(entry: ContentEntry, request=None, *, full: bool = False) -> dict:
    """Public API / landing ile uyumlu Duyuru benzeri dict."""
    publish = entry.publish_at
    data = {
        'id': entry.id,
        'cms_id': entry.id,
        'kind': entry.kind,
        'baslik': entry.title,
        'slug': entry.slug,
        'ozet': entry.excerpt,
        'kapak_gorseli_url': _media_url(request, entry.cover_url or entry.cover_thumb_url),
        'kapak_thumb_url': _media_url(request, entry.cover_thumb_url or entry.cover_url),
        'yayin_tarihi': publish.date().isoformat() if publish else None,
        'sira': entry.sira,
        'oncelik': entry.priority,
        'sabit': entry.is_pinned,
        'one_cikan': entry.is_featured,
        'view_count': entry.view_count,
    }
    if full:
        data.update({
            'icerik': entry.body,
            'galeri': resolve_gallery(entry, request),
            'ekler': resolve_attachments(entry, request),
            'meta_title': entry.meta_title,
            'meta_description': entry.meta_description,
            'author_name': entry.author_name,
        })
    return data


def serialize_admin_content(entry: ContentEntry, *, full: bool = False) -> dict:
    data = {
        'id': entry.id,
        'kind': entry.kind,
        'title': entry.title,
        'slug': entry.slug,
        'excerpt': entry.excerpt,
        'status': entry.status,
        'priority': entry.priority,
        'is_featured': entry.is_featured,
        'is_pinned': entry.is_pinned,
        'cover_url': entry.cover_url,
        'cover_thumb_url': entry.cover_thumb_url,
        'gallery': resolve_gallery(entry),
        'attachments': resolve_attachments(entry),
        'sira': entry.sira,
        'publish_at': entry.publish_at.isoformat() if entry.publish_at else None,
        'unpublish_at': entry.unpublish_at.isoformat() if entry.unpublish_at else None,
        'view_count': entry.view_count,
        'show_as_popup': entry.show_as_popup,
    }
    if full:
        data.update({
            'body': entry.body,
            'author_name': entry.author_name,
            'meta_title': entry.meta_title,
            'meta_description': entry.meta_description,
            'tags': entry.tags or [],
        })
    return data


def apply_media_as_cover(entry: ContentEntry, asset: MediaAsset) -> None:
    main, thumb = _asset_urls(asset)
    entry.cover_url = main or ''
    entry.cover_thumb_url = thumb or main or ''
    entry.save(update_fields=['cover_url', 'cover_thumb_url', 'updated_at'])


def append_gallery_media(entry: ContentEntry, asset: MediaAsset, *, title: str = '') -> dict:
    gallery = list(entry.gallery or [])
    row = {
        'id': uuid.uuid4().hex[:12],
        'media_id': asset.id,
        'title': title or asset.title or '',
        'sira': len(gallery),
    }
    gallery.append(row)
    entry.gallery = gallery
    entry.save(update_fields=['gallery', 'updated_at'])
    return row


def remove_gallery_item(entry: ContentEntry, item_id: str) -> bool:
    gallery = [g for g in (entry.gallery or []) if str(g.get('id')) != str(item_id)]
    if len(gallery) == len(entry.gallery or []):
        return False
    for idx, row in enumerate(gallery):
        row['sira'] = idx
    entry.gallery = gallery
    entry.save(update_fields=['gallery', 'updated_at'])
    return True


def append_attachment_media(entry: ContentEntry, asset: MediaAsset, *, title: str = '') -> dict:
    attachments = list(entry.attachments or [])
    name = title or asset.title or (asset.file.name.rsplit('/', 1)[-1] if asset.file else 'dosya')
    row = {
        'id': uuid.uuid4().hex[:12],
        'media_id': asset.id,
        'title': name,
        'sira': len(attachments),
    }
    attachments.append(row)
    entry.attachments = attachments
    entry.save(update_fields=['attachments', 'updated_at'])
    return row


def remove_attachment_item(entry: ContentEntry, item_id: str) -> bool:
    attachments = [a for a in (entry.attachments or []) if str(a.get('id')) != str(item_id)]
    if len(attachments) == len(entry.attachments or []):
        return False
    for idx, row in enumerate(attachments):
        row['sira'] = idx
    entry.attachments = attachments
    entry.save(update_fields=['attachments', 'updated_at'])
    return True


def parse_datetime(value: Any):
    if value in (None, ''):
        return None
    if hasattr(value, 'isoformat'):
        return value
    from django.utils.dateparse import parse_datetime
    return parse_datetime(str(value))
