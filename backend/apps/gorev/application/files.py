"""Görev görseli ve ek dosyası — tür, boyut ve içerik doğrulaması."""
from __future__ import annotations

import hashlib
import io
import ipaddress
import os
import re
import socket
import urllib.error
import urllib.request
import zipfile
from urllib.parse import urlsplit

from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError

from apps.gorev.application.html_content import extract_dosya_ids, looks_like_html
from apps.gorev.domain.models import Gorev, GorevDosya

IMAGE_MAX_BYTES = 5 * 1024 * 1024
FILE_MAX_BYTES = 15 * 1024 * 1024

IMAGE_FORMATS = {
    'JPEG': ('image/jpeg', '.jpg'),
    'PNG': ('image/png', '.png'),
    'GIF': ('image/gif', '.gif'),
    'WEBP': ('image/webp', '.webp'),
}

OFFICE_MARKERS = {
    'wordprocessingml.document.main+xml': (
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.docx',
    ),
    'spreadsheetml.sheet.main+xml': (
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xlsx',
    ),
    'presentationml.presentation.main+xml': (
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.pptx',
    ),
}


class GorevDosyaError(ValueError):
    pass


def safe_original_name(name: str, ext: str) -> str:
    base = os.path.basename(name or 'dosya')
    base = base.replace('\x00', '').replace('\r', '').replace('\n', '')
    stem = os.path.splitext(base)[0]
    stem = re.sub(r'[^0-9A-Za-zğüşöçıİĞÜŞÖÇ._\- ]', '_', stem).strip(' .') or 'dosya'
    return f'{stem[:80]}{ext}'


def _sniff(data: bytes, ext: str) -> tuple[str, str, str]:
    """Dönen: (tur, icerik_turu, uzantı). Uzantı tek başına yeterli değildir."""
    if data.startswith(b'%PDF-') and ext == '.pdf':
        return GorevDosya.TUR_DOSYA, 'application/pdf', '.pdf'

    if data.startswith(b'PK') and ext in {'.docx', '.xlsx', '.pptx'}:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                content_types = archive.read('[Content_Types].xml').decode('utf-8', 'ignore')
        except (zipfile.BadZipFile, KeyError, OSError) as exc:
            raise GorevDosyaError('Dosya içeriği belirtilen türle uyuşmuyor.') from exc
        for marker, (mime, expected) in OFFICE_MARKERS.items():
            if marker in content_types and ext == expected:
                return GorevDosya.TUR_DOSYA, mime, expected
        raise GorevDosyaError('Dosya içeriği belirtilen Office türüyle uyuşmuyor.')

    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            fmt = (image.format or '').upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise GorevDosyaError(
            'Dosya türü desteklenmiyor. Görseller: JPG, PNG, GIF, WEBP. Belgeler: PDF, DOCX, XLSX, PPTX.',
        ) from exc

    if fmt == 'MPO':
        fmt = 'JPEG'
    spec = IMAGE_FORMATS.get(fmt)
    if not spec:
        raise GorevDosyaError('Bu görsel biçimi desteklenmiyor. JPG, PNG, GIF veya WEBP kullanın.')
    mime, expected = spec
    if ext not in {expected, '.jpeg'} or (fmt != 'JPEG' and ext != expected):
        if not (fmt == 'JPEG' and ext in {'.jpg', '.jpeg'}):
            raise GorevDosyaError('Dosya uzantısı içeriğiyle uyuşmuyor.')
    return GorevDosya.TUR_GORSEL, mime, '.jpg' if fmt == 'JPEG' and ext == '.jpeg' else expected


def validate_upload(uploaded) -> tuple[bytes, str, str, str, str]:
    if uploaded is None:
        raise GorevDosyaError('Dosya seçilmedi.')
    size = int(getattr(uploaded, 'size', 0) or 0)
    ext = os.path.splitext(getattr(uploaded, 'name', '') or '')[1].lower()
    if ext == '.jpeg':
        ext = '.jpg'
    limit = IMAGE_MAX_BYTES if ext in {'.jpg', '.png', '.gif', '.webp'} else FILE_MAX_BYTES
    if size <= 0:
        raise GorevDosyaError('Dosya boş.')
    if size > limit:
        if ext in {'.jpg', '.png', '.gif', '.webp'}:
            raise GorevDosyaError('Görsel en fazla 5 MB olabilir.')
        raise GorevDosyaError('Dosya en fazla 15 MB olabilir.')
    data = uploaded.read()
    if len(data) > limit:
        raise GorevDosyaError('Dosya boyut sınırı aşıldı.')
    tur, mime, normalized_ext = _sniff(data, ext if ext != '.jpg' else '.jpg')
    if tur == GorevDosya.TUR_GORSEL and len(data) > IMAGE_MAX_BYTES:
        raise GorevDosyaError('Görsel en fazla 5 MB olabilir.')
    name = safe_original_name(getattr(uploaded, 'name', ''), normalized_ext)
    return data, tur, mime, normalized_ext, name


def _blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        or ip.is_multicast or ip.is_unspecified
    )


def assert_public_image_url(url: str) -> None:
    parsed = urlsplit((url or '').strip())
    host = (parsed.hostname or '').strip('[]').lower()
    if parsed.scheme not in {'http', 'https'} or not host:
        raise GorevDosyaError('Yalnızca http veya https görsel adresi alınabilir.')
    if host in {'localhost', 'localhost.localdomain'} or host.endswith('.local') or host.endswith('.internal'):
        raise GorevDosyaError('Bu adresten görsel alınamaz.')
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if _blocked_ip(literal):
            raise GorevDosyaError('Bu adresten görsel alınamaz.')
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise GorevDosyaError('Görsel adresi çözülemedi.') from exc
    for info in infos:
        if _blocked_ip(ipaddress.ip_address(info[4][0])):
            raise GorevDosyaError('Bu adresten görsel alınamaz.')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


_IMAGE_OPENER = urllib.request.build_opener(_NoRedirect)


def download_remote_image(url: str) -> tuple[bytes, str]:
    current = (url or '').strip()
    data = b''
    for _hop in range(4):
        assert_public_image_url(current)
        request = urllib.request.Request(current, headers={'User-Agent': '3KKampusGorev/1.0'})
        try:
            with _IMAGE_OPENER.open(request, timeout=8) as response:
                final = response.geturl()
                assert_public_image_url(final)
                content_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
                if content_type and not content_type.startswith('image/'):
                    raise GorevDosyaError('Adres bir görsel değil.')
                data = response.read(IMAGE_MAX_BYTES + 1)
                current = final
                break
        except GorevDosyaError:
            raise
        except urllib.error.HTTPError as exc:
            if exc.code not in {301, 302, 303, 307, 308}:
                raise GorevDosyaError('Görsel indirilemedi.') from exc
            location = exc.headers.get('Location')
            if not location:
                raise GorevDosyaError('Görsel indirilemedi.') from exc
            current = urllib.request.urljoin(exc.geturl() or current, location)
            continue
        except Exception as exc:
            raise GorevDosyaError('Görsel indirilemedi.') from exc
    else:
        raise GorevDosyaError('Görsel indirilemedi.')
    if len(data) > IMAGE_MAX_BYTES:
        raise GorevDosyaError('Görsel en fazla 5 MB olabilir.')
    name = os.path.basename(urlsplit(current).path) or 'yapistirma.jpg'
    return data, name


class _BytesUpload:
    def __init__(self, data: bytes, name: str):
        self.size = len(data)
        self.name = name
        self._data = data

    def read(self):
        return self._data


def store_upload(*, kurum_id: int, user_id: int, uploaded) -> GorevDosya:
    data, tur, mime, _ext, name = validate_upload(uploaded)
    digest = hashlib.sha256(data).hexdigest()
    existing = GorevDosya.objects.filter(
        kurum_id=kurum_id,
        yukleyen_id=user_id,
        sha256=digest,
        gorev__isnull=True,
        tur=tur,
    ).first()
    if existing:
        return existing
    obj = GorevDosya(
        kurum_id=kurum_id,
        yukleyen_id=user_id,
        orijinal_ad=name,
        icerik_turu=mime,
        boyut=len(data),
        tur=tur,
        sha256=digest,
    )
    obj.dosya.save(name, ContentFile(data), save=True)
    return obj


def filename_for_image(data: bytes, fallback: str) -> str:
    """Adres .jpg dese de içerik WebP olabiliyor; kayıt adı gerçek biçime uymalı."""
    stem = os.path.splitext(os.path.basename(fallback or '') or 'yapistirma')[0]
    stem = re.sub(r'[^0-9A-Za-z._\-]+', '_', stem).strip('._') or 'yapistirma'
    try:
        with Image.open(io.BytesIO(data)) as image:
            fmt = (image.format or '').upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise GorevDosyaError('Adres bir görsel değil.') from exc
    if fmt == 'MPO':
        fmt = 'JPEG'
    spec = IMAGE_FORMATS.get(fmt)
    if not spec:
        raise GorevDosyaError('Bu görsel biçimi desteklenmiyor. JPG, PNG, GIF veya WEBP kullanın.')
    return f'{stem[:80]}{spec[1]}'


def store_remote_image(*, kurum_id: int, user_id: int, url: str) -> GorevDosya:
    data, name = download_remote_image(url)
    return store_upload(
        kurum_id=kurum_id,
        user_id=user_id,
        uploaded=_BytesUpload(data, filename_for_image(data, name)),
    )


def delete_stored(dosya: GorevDosya):
    name = dosya.dosya.name
    storage = dosya.dosya.storage
    dosya.delete()
    if name:
        storage.delete(name)


def sync_gorev_dosyalari(gorev: Gorev, user_id: int, uploaded_ids):
    """HTML içinde geçen dosyaları göreve bağlar; bu kayıtta artık geçmeyenleri siler."""
    referenced = extract_dosya_ids(gorev.aciklama)
    uploaded = {str(item).lower() for item in (uploaded_ids or [])}
    manage = uploaded_ids is not None or looks_like_html(gorev.aciklama)
    if not referenced and not manage:
        return

    if referenced:
        for dosya in GorevDosya.objects.filter(kurum_id=gorev.kurum_id, id__in=referenced):
            if dosya.gorev_id and dosya.gorev_id != gorev.id:
                continue
            if dosya.gorev_id is None and dosya.yukleyen_id != user_id:
                continue
            if dosya.gorev_id != gorev.id:
                dosya.gorev = gorev
                dosya.save(update_fields=['gorev'])

    if not manage:
        return

    for dosya in list(gorev.dosyalar.all()):
        if str(dosya.id) not in referenced:
            delete_stored(dosya)

    if uploaded_ids is not None and uploaded - referenced:
        stale = GorevDosya.objects.filter(
            id__in=uploaded - referenced,
            kurum_id=gorev.kurum_id,
            yukleyen_id=user_id,
            gorev__isnull=True,
        )
        for dosya in list(stale):
            delete_stored(dosya)


def serialize_dosya(dosya: GorevDosya) -> dict:
    return {
        'id': str(dosya.id),
        'url': f'/api/gorev/api/dosyalar/{dosya.id}/',
        'orijinal_ad': dosya.orijinal_ad,
        'boyut': dosya.boyut,
        'icerik_turu': dosya.icerik_turu,
        'tur': dosya.tur,
    }
