"""
Meta template HEADER medya parametresi (DOCUMENT / IMAGE / VIDEO).

Gönderim sırasında PDF/görsel ekini template header component'ine çevirir.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

_TR_ASCII = str.maketrans({
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
})


def sanitize_document_filename(filename: str, *, default: str = 'document.pdf') -> str:
    """Meta DOCUMENT header için ASCII, uzantılı dosya adı."""
    raw = (filename or '').strip() or default
    # Yol parçalarını at
    raw = raw.replace('\\', '/').rsplit('/', 1)[-1]
    name = raw.translate(_TR_ASCII)
    name = unicodedata.normalize('NFKD', name)
    name = name.encode('ascii', 'ignore').decode('ascii')
    name = re.sub(r'[^\w.\-]+', '-', name).strip('.-') or 'document'
    if not name.lower().endswith('.pdf'):
        # uzantıyı koru veya pdf ekle
        if '.' not in name:
            name = f'{name}.pdf'
    return name[:120]


def build_media_header_component(
    *,
    header_type: str,
    media_id: str | None = None,
    link: str | None = None,
    filename: str = '',
) -> dict[str, Any] | None:
    """
    Graph API template.components header parametresi.

    Örn. DOCUMENT:
    {"type": "header", "parameters": [{"type": "document", "document": {"id": "...", "filename": "x.pdf"}}]}
    """
    htype = (header_type or '').upper()
    if htype not in ('DOCUMENT', 'IMAGE', 'VIDEO'):
        return None
    # Template medya header'da public link sık Invalid parameter üretir;
    # tercih media_id. Link yalnızca geçerli https ise yedek.
    use_link = ''
    if not media_id and link and str(link).startswith('https://'):
        use_link = str(link)
    if not media_id and not use_link:
        return None

    media_key = htype.lower()  # document | image | video
    media_payload: dict[str, str] = {}
    if media_id:
        media_payload['id'] = media_id
    else:
        media_payload['link'] = use_link
    if htype == 'DOCUMENT':
        media_payload['filename'] = sanitize_document_filename(filename)

    return {
        'type': 'header',
        'parameters': [{
            'type': media_key,
            media_key: media_payload,
        }],
    }


def meta_template_header_type(meta_tpl) -> str:
    """WhatsAppMetaTemplate.header_json.type → DOCUMENT|IMAGE|VIDEO|TEXT|''."""
    header = getattr(meta_tpl, 'header_json', None) or {}
    if not isinstance(header, dict):
        return ''
    return (header.get('type') or '').upper()


def strip_header_components(components: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """extra_components içindeki header'ları çıkar (dinamik medya header eklenecek)."""
    out = []
    for comp in components or []:
        if (comp.get('type') or '').lower() == 'header':
            continue
        out.append(comp)
    return out
