"""Kitap kapak görseli — istemci 600×600 kırpım gönderir; sunucu zorla kırpmaz."""
from __future__ import annotations

from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps

KAPAK_SIZE = (600, 600)
# Anomali koruması: kırpılmamış çok büyük yüklemeleri orantılı küçült
MAX_EDGE = 1600
MAX_KAPAK_BYTES = 5 * 1024 * 1024
ALLOWED_CONTENT_TYPES = frozenset({
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
})


def validate_kapak_upload(uploaded_file) -> str | None:
    """Geçersizse hata mesajı, geçerliyse None."""
    if uploaded_file is None:
        return 'Kapak dosyası bulunamadı.'
    size = getattr(uploaded_file, 'size', None) or 0
    if size > MAX_KAPAK_BYTES:
        return "Dosya boyutu 5MB'dan küçük olmalıdır."
    content_type = getattr(uploaded_file, 'content_type', '') or ''
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        return 'Sadece JPEG, PNG, GIF veya WebP dosyaları kabul edilir.'
    return None


def process_kapak_image(uploaded_file) -> ContentFile:
    """
    JPEG'e çevirir. Zorla 600×600 kırpmaz — kırpma/ölçek istemci tarafında manueldir.
    Aşırı büyük görselleri orantılı küçültür.
    """
    img = Image.open(uploaded_file)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')
    elif img.mode == 'L':
        img = img.convert('RGB')

    w, h = img.size
    if max(w, h) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    buf = BytesIO()
    img.save(buf, format='JPEG', quality=90, optimize=True)
    buf.seek(0)
    return ContentFile(buf.read(), name='kapak.jpg')


def media_path_url(file_name: str) -> str:
    """Storage path → /media/... göreli URL."""
    if not file_name:
        return ''
    url = default_storage.url(file_name)
    if url.startswith('http://') or url.startswith('https://'):
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.path or url
    if not url.startswith('/'):
        return f'/{url}'
    return url


def resolve_book_kapak_url(book=None, *, kapak_name: str | None = None, kapak_url: str = '') -> str:
    """
    Öncelik: yüklenen kapak dosyası → harici kapak_url.
    API yanıtlarında göreli /media/... yolu döner (Next rewrite ile uyumlu).
    """
    if book is not None:
        if getattr(book, 'kapak', None):
            try:
                return media_path_url(book.kapak.name)
            except (ValueError, AttributeError):
                pass
        return (getattr(book, 'kapak_url', None) or '') or ''
    if kapak_name:
        return media_path_url(kapak_name)
    return kapak_url or ''
