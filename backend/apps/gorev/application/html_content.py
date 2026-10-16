"""Görev açıklaması — düz metin uyumluluğu ve HTML temizleme.

Kayıt biçimi değişmez: `Gorev.aciklama` bir metin alanıdır.
Eski kayıtlar düz metin olarak kalır. Zengin içerik, allowlist ile temizlenmiş HTML olarak aynı alana yazılır.
"""
from __future__ import annotations

import html
import re

import nh3

MAX_ACIKLAMA_CHARS = 200_000

_BLOCK_TAG = re.compile(
    r'</?(?:p|div|h1|h2|h3|ul|ol|li|table|thead|tbody|tr|td|th|img|a|blockquote|'
    r'pre|span|strong|em|u|s|sub|sup|br|hr|mark|code|input)\b',
    re.IGNORECASE,
)

_DANGEROUS = re.compile(
    r'<\s*script\b|<\s*/\s*script\b|<\s*(?:iframe|object|embed|form|meta|base|link|svg|math)\b|'
    r'javascript\s*:|vbscript\s*:|data\s*:\s*text/html|'
    r'<\s*[^>]*\s(?:on[a-z]+|srcdoc|formaction|xlink:href)\s*=',
    re.IGNORECASE,
)

_DOSYA_SRC = re.compile(
    r'^/(?:api/)?gorev/api/dosyalar/'
    r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/?$'
)

_IMG_SRC = re.compile(r'<img\b[^>]*?\ssrc\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
_DOSYA_ID = re.compile(
    r'(?:/gorev/api/dosyalar/|data-dosya-id=["\'])'
    r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
    re.IGNORECASE,
)

_ALLOWED_TAGS = {
    'a', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'hr', 'i', 'img',
    'input', 'li', 'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup',
    'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'b', 'strike', 'col', 'colgroup',
}

_ALLOWED_ATTRIBUTES = {
    '*': {'style', 'class', 'title'},
    'a': {'href', 'target', 'title'},
    'img': {'src', 'alt', 'title', 'width', 'height'},
    'td': {'colspan', 'rowspan', 'colwidth'},
    'th': {'colspan', 'rowspan', 'colwidth'},
    'ol': {'start'},
    'input': {'type', 'checked', 'disabled'},
    'col': {'style', 'width'},
}

_STYLE_PROPS = {
    'color', 'background-color', 'text-align', 'font-size', 'font-family',
    'line-height', 'margin-left', 'width', 'max-width', 'text-decoration',
    'vertical-align', 'font-weight', 'font-style',
}

_FONTS = {
    'arial', 'georgia', 'times new roman', 'courier new', 'verdana', 'tahoma',
    'trebuchet ms', 'ui-sans-serif', 'ui-monospace',
}


class GorevHtmlError(ValueError):
    """Kullanıcıya gösterilen açıklama güvenlik hatası."""


def looks_like_html(value: str) -> bool:
    return bool(_BLOCK_TAG.search(value or ''))


def normalize_dosya_src(value: str) -> str | None:
    match = _DOSYA_SRC.match((value or '').strip())
    if not match:
        return None
    return f'/api/gorev/api/dosyalar/{match.group(1).lower()}/'


def normalize_href(value: str) -> str | None:
    raw = (value or '').strip()
    if not raw or raw.startswith('//') or re.match(r'(?i)^(javascript|vbscript|data):', raw):
        return None
    dosya = normalize_dosya_src(raw)
    if dosya:
        return dosya
    if re.match(r'(?i)^https?://[^\s]+$', raw) or re.match(r'(?i)^mailto:[^\s]+$', raw):
        return raw
    return None


def extract_dosya_ids(value: str) -> set[str]:
    return {item.lower() for item in _DOSYA_ID.findall(value or '')}


def _sanitize_style(value: str) -> str:
    if not value:
        return ''
    kept: list[str] = []
    for part in value.split(';'):
        if ':' not in part:
            continue
        prop, _, raw = part.partition(':')
        prop = prop.strip().lower()
        raw = raw.strip()
        if prop not in _STYLE_PROPS or not raw:
            continue
        if re.search(r'url\s*\(|expression|javascript|@import|behavior', raw, re.IGNORECASE):
            continue
        if prop in ('color', 'background-color') and not re.fullmatch(
            r'(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]{1,20})',
            raw,
        ):
            continue
        if prop == 'text-align' and raw not in ('left', 'center', 'right', 'justify', 'start', 'end'):
            continue
        if prop == 'font-size' and not re.fullmatch(r'\d{1,2}(\.\d+)?(px|pt|rem|em)', raw):
            continue
        if prop == 'font-family':
            families = []
            for item in raw.split(','):
                name = item.strip().strip('"').strip("'")
                if name.lower() in _FONTS:
                    families.append(name)
            if not families:
                continue
            raw = ', '.join(families)
        if prop in ('width', 'max-width', 'margin-left') and not re.fullmatch(
            r'\d{1,4}(\.\d+)?(px|%|em|rem)', raw,
        ):
            continue
        if prop == 'line-height' and not re.fullmatch(r'\d(\.\d{1,2})?|\d{1,2}(\.\d+)?(px|em)', raw):
            continue
        if prop == 'text-decoration' and raw not in ('underline', 'line-through', 'none'):
            continue
        if prop == 'vertical-align' and raw not in ('baseline', 'sub', 'super', 'top', 'middle', 'bottom'):
            continue
        if prop == 'font-weight' and raw not in ('normal', 'bold', '400', '500', '600', '700'):
            continue
        if prop == 'font-style' and raw not in ('normal', 'italic'):
            continue
        kept.append(f'{prop}: {raw}')
    return '; '.join(kept)


def _attribute_filter(tag: str, attr: str, value: str):
    if attr == 'style':
        cleaned = _sanitize_style(value)
        return cleaned or None
    if attr == 'class':
        classes = [item for item in (value or '').split() if re.fullmatch(r'[A-Za-z0-9_\-]{1,40}', item)]
        return ' '.join(classes[:8]) or None
    if tag == 'img' and attr == 'src':
        return normalize_dosya_src(value)
    if tag == 'a' and attr == 'href':
        return normalize_href(value)
    if tag == 'a' and attr == 'target':
        return '_blank' if value == '_blank' else None
    if tag == 'input' and attr == 'type':
        return 'checkbox' if (value or '').lower() == 'checkbox' else None
    if attr in ('width', 'height') and not re.fullmatch(r'\d{1,4}(px|%)?', value or ''):
        return None
    return value


def _has_dangerous_markup(value: str) -> bool:
    decoded = html.unescape(value or '')
    return bool(_DANGEROUS.search(value or '') or _DANGEROUS.search(decoded))


def _foreign_images(value: str) -> bool:
    for src in _IMG_SRC.findall(value or ''):
        if not normalize_dosya_src(html.unescape(src)):
            return True
    return False


def sanitize_gorev_html(value: str) -> str:
    cleaned = nh3.clean(
        value or '',
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        attribute_filter=_attribute_filter,
        generic_attribute_prefixes={'data-'},
        url_schemes={'http', 'https', 'mailto'},
        filter_style_properties=_STYLE_PROPS,
        strip_comments=True,
        link_rel='noopener noreferrer',
        set_tag_attribute_values={'input': {'disabled': '', 'type': 'checkbox'}},
    )
    cleaned = re.sub(r'<img\b(?![^>]*\ssrc=)[^>]*>', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def prepare_aciklama(value) -> str:
    """Kayıt öncesi. Düz metne dokunmaz. Tehlikeli HTML'i reddeder."""
    text = '' if value is None else str(value)
    text = text.replace('\x00', '')
    if len(text) > MAX_ACIKLAMA_CHARS:
        raise GorevHtmlError('Açıklama çok uzun. Lütfen içeriği kısaltın.')
    if not looks_like_html(text):
        return text
    if _has_dangerous_markup(text):
        raise GorevHtmlError(
            'Açıklama güvenlik nedeniyle kaydedilemedi. Betik, olay niteliği veya güvenli olmayan adres kullanılamaz.',
        )
    if _foreign_images(text):
        raise GorevHtmlError(
            'Görseller yalnızca bilgisayardan yüklenerek eklenebilir. Dış adres veya gömülü görsel kaydedilemez.',
        )
    cleaned = sanitize_gorev_html(text)
    visible = re.sub(r'<[^>]+>', '', cleaned)
    visible = html.unescape(visible).replace('\xa0', ' ').strip()
    has_media = bool(re.search(r'<img\b|data-latex=|data-dosya-id=|<table\b', cleaned, re.IGNORECASE))
    if not visible and not has_media:
        return ''
    return cleaned


def plain_excerpt(value: str, limit: int = 400) -> str:
    """Bildirim ve takvim kopyası için etiketlerden arındırılmış kısa metin."""
    raw = value or ''
    if looks_like_html(raw):
        latex = ' '.join(re.findall(r'data-latex="([^"]*)"', raw))
        text = nh3.clean(raw, tags=set())
        text = html.unescape(text)
        if latex:
            text = f'{text} {html.unescape(latex)}'.strip()
    else:
        text = raw
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + '…'
