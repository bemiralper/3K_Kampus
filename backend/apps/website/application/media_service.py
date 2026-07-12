"""Medya yükleme ve WebP türev üretimi."""
from __future__ import annotations

import io
from typing import BinaryIO

from django.core.files.base import ContentFile

from apps.website.cms_models import MediaAsset, MediaVariant


def _detect_kind(content_type: str) -> str:
    ct = (content_type or '').lower()
    if ct.startswith('image/'):
        return MediaAsset.KIND_IMAGE
    if ct.startswith('video/'):
        return MediaAsset.KIND_VIDEO
    return MediaAsset.KIND_FILE


def create_media_asset(
    *,
    kurum_id: int,
    uploaded,
    title: str = '',
    alt_text: str = '',
    folder: str = 'genel',
    tags: list | None = None,
    user=None,
) -> tuple[MediaAsset | None, str | None]:
    max_mb = 15
    if uploaded.size > max_mb * 1024 * 1024:
        return None, f'Dosya boyutu {max_mb}MB\'dan küçük olmalıdır'

    content_type = (getattr(uploaded, 'content_type', None) or '').lower()
    kind = _detect_kind(content_type)
    if kind == MediaAsset.KIND_IMAGE and content_type not in {
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    }:
        return None, 'Geçersiz görsel tipi'

    asset = MediaAsset(
        kurum_id=kurum_id,
        folder=folder or 'genel',
        kind=kind,
        title=title or getattr(uploaded, 'name', '')[:200],
        mime_type=content_type,
        size_bytes=int(getattr(uploaded, 'size', 0) or 0),
        alt_text=alt_text or '',
        tags=tags or [],
        created_by=user if user and getattr(user, 'is_authenticated', False) else None,
    )
    asset.file = uploaded
    asset.save()

    if kind == MediaAsset.KIND_IMAGE:
        _try_set_dimensions(asset)
        _try_create_webp(asset)

    return asset, None


def _try_set_dimensions(asset: MediaAsset):
    try:
        from PIL import Image
        asset.file.open('rb')
        with Image.open(asset.file) as img:
            asset.width, asset.height = img.size
        asset.save(update_fields=['width', 'height'])
    except Exception:
        pass
    finally:
        try:
            asset.file.close()
        except Exception:
            pass


def _try_create_webp(asset: MediaAsset, widths: tuple[int, ...] = (480, 960, 1600)):
    try:
        from PIL import Image
    except ImportError:
        return

    try:
        asset.file.open('rb')
        with Image.open(asset.file) as img:
            img = img.convert('RGB') if img.mode not in ('RGB', 'RGBA') else img
            for w in widths:
                if asset.width and asset.width < w:
                    continue
                ratio = w / float(img.width)
                h = max(1, int(img.height * ratio))
                resized = img.resize((w, h), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                resized.save(buf, format='WEBP', quality=82, method=4)
                buf.seek(0)
                variant = MediaVariant(asset=asset, format='webp', width=w)
                variant.file.save(f'{asset.pk}_{w}.webp', ContentFile(buf.read()), save=True)
    except Exception:
        pass
    finally:
        try:
            asset.file.close()
        except Exception:
            pass


def serialize_media(asset: MediaAsset) -> dict:
    variants = [
        {
            'format': v.format,
            'width': v.width,
            'url': v.file.url if v.file else None,
        }
        for v in asset.variants.all()
    ]
    return {
        'id': asset.id,
        'title': asset.title,
        'kind': asset.kind,
        'folder': asset.folder,
        'url': asset.file.url if asset.file else None,
        'mime_type': asset.mime_type,
        'size_bytes': asset.size_bytes,
        'width': asset.width,
        'height': asset.height,
        'alt_text': asset.alt_text,
        'caption': asset.caption,
        'description': asset.description,
        'tags': asset.tags or [],
        'seo_filename': asset.seo_filename,
        'usage_refs': asset.usage_refs or [],
        'variants': variants,
        'created_at': asset.created_at.isoformat() if asset.created_at else None,
    }
