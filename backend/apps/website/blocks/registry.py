"""Blok tipi registry — Page Builder doğrulama ve varsayılan props."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

# Ortak stil şeması (her blokta opsiyonel)
DEFAULT_STYLE: dict[str, Any] = {
    'visibility': {'desktop': True, 'tablet': True, 'mobile': True},
    'padding': {'top': 0, 'right': 0, 'bottom': 0, 'left': 0},
    'margin': {'top': 0, 'right': 0, 'bottom': 0, 'left': 0},
    'background': '',
    'overlay': '',
    'gradient': '',
    'borderRadius': '',
    'shadow': '',
    'animation': '',
    'animationDelay': 0,
    'zIndex': 0,
    'className': '',
    'id': '',
}

BLOCK_TYPES: dict[str, dict[str, Any]] = {
    'hero': {
        'label': 'Hero',
        'category': 'layout',
        'defaults': {
            'title': '',
            'subtitle': '',
            'description': '',
            'button1': {'label': '', 'url': ''},
            'button2': {'label': '', 'url': ''},
            'imageUrl': '',
            'mobileImageUrl': '',
            'videoUrl': '',
            'alignment': 'center',
            'overlay': 'rgba(0,0,0,0.35)',
        },
    },
    'slider': {
        'label': 'Slider',
        'category': 'media',
        'defaults': {'slides': [], 'autoplay': True, 'intervalMs': 5000},
    },
    'banner': {
        'label': 'Banner',
        'category': 'layout',
        'defaults': {'title': '', 'imageUrl': '', 'linkUrl': '', 'height': 280},
    },
    'richText': {
        'label': 'Metin',
        'category': 'content',
        'defaults': {'html': '', 'markdown': ''},
    },
    'heading': {
        'label': 'Başlık',
        'category': 'content',
        'defaults': {'text': '', 'level': 2, 'align': 'left'},
    },
    'button': {
        'label': 'Buton',
        'category': 'content',
        'defaults': {'label': 'Tıkla', 'url': '#', 'variant': 'primary', 'align': 'left'},
    },
    'image': {
        'label': 'Resim',
        'category': 'media',
        'defaults': {'src': '', 'alt': '', 'caption': '', 'linkUrl': ''},
    },
    'gallery': {
        'label': 'Galeri',
        'category': 'media',
        'defaults': {'images': [], 'columns': 3},
    },
    'video': {
        'label': 'Video',
        'category': 'media',
        'defaults': {'src': '', 'poster': '', 'autoplay': False},
    },
    'youtube': {
        'label': 'YouTube',
        'category': 'media',
        'defaults': {'videoId': '', 'title': ''},
    },
    'map': {
        'label': 'Harita',
        'category': 'embed',
        'defaults': {'embedUrl': '', 'height': 360},
    },
    'counter': {
        'label': 'Sayaç',
        'category': 'content',
        'defaults': {'items': []},
    },
    'iconBoxes': {
        'label': 'İkon Kutuları',
        'category': 'content',
        'defaults': {'items': [], 'columns': 3},
    },
    'cards': {
        'label': 'Kartlar',
        'category': 'content',
        'defaults': {'items': [], 'columns': 3},
    },
    'accordion': {
        'label': 'Accordion',
        'category': 'content',
        'defaults': {'items': []},
    },
    'timeline': {
        'label': 'Timeline',
        'category': 'content',
        'defaults': {'items': []},
    },
    'cta': {
        'label': 'CTA',
        'category': 'layout',
        'defaults': {
            'title': '',
            'description': '',
            'buttonLabel': '',
            'buttonUrl': '',
        },
    },
    'testimonials': {
        'label': 'Referanslar',
        'category': 'content',
        'defaults': {'items': []},
    },
    'staff': {
        'label': 'Personeller',
        'category': 'content',
        'defaults': {'items': []},
    },
    'faq': {
        'label': 'SSS',
        'category': 'content',
        'defaults': {'items': [], 'source': 'manual'},  # manual | cms
    },
    'duyurularList': {
        'label': 'Duyurular',
        'category': 'dynamic',
        'defaults': {'limit': 6, 'kind': 'duyuru'},
    },
    'haberlerList': {
        'label': 'Haberler',
        'category': 'dynamic',
        'defaults': {'limit': 6, 'kind': 'haber'},
    },
    'blogList': {
        'label': 'Blog',
        'category': 'dynamic',
        'defaults': {'limit': 6, 'kind': 'blog'},
    },
    'etkinliklerList': {
        'label': 'Etkinlikler',
        'category': 'dynamic',
        'defaults': {'limit': 6, 'kind': 'etkinlik'},
    },
    'sinavTakvim': {
        'label': 'Sınav Takvimi',
        'category': 'dynamic',
        'defaults': {'limit': 12, 'tur': ''},
    },
    'form': {
        'label': 'Form',
        'category': 'dynamic',
        'defaults': {'formSlug': '', 'formId': None},
    },
    'html': {
        'label': 'HTML',
        'category': 'code',
        'defaults': {'html': ''},
    },
    'javascript': {
        'label': 'JavaScript',
        'category': 'code',
        'defaults': {'code': ''},
    },
    'css': {
        'label': 'CSS',
        'category': 'code',
        'defaults': {'code': ''},
    },
    'spacer': {
        'label': 'Spacer',
        'category': 'layout',
        'defaults': {'height': 32},
    },
    'divider': {
        'label': 'Divider',
        'category': 'layout',
        'defaults': {'style': 'solid', 'color': '#e5e7eb'},
    },
}

ALLOWED_BLOCK_TYPES = frozenset(BLOCK_TYPES.keys())


def list_block_types() -> list[dict[str, Any]]:
    return [
        {
            'type': key,
            'label': meta['label'],
            'category': meta['category'],
            'defaults': deepcopy(meta['defaults']),
            'defaultStyle': deepcopy(DEFAULT_STYLE),
        }
        for key, meta in BLOCK_TYPES.items()
    ]


def new_block(block_type: str, props: dict | None = None, style: dict | None = None) -> dict:
    if block_type not in BLOCK_TYPES:
        raise ValueError(f'Bilinmeyen blok tipi: {block_type}')
    import uuid
    return {
        'id': str(uuid.uuid4()),
        'type': block_type,
        'props': {**deepcopy(BLOCK_TYPES[block_type]['defaults']), **(props or {})},
        'style': {**deepcopy(DEFAULT_STYLE), **(style or {})},
    }


def validate_blocks(blocks: Any) -> tuple[list[dict], list[str]]:
    """Blok listesini doğrular. (normalized_blocks, errors)"""
    errors: list[str] = []
    if blocks is None:
        return [], []
    if not isinstance(blocks, list):
        return [], ['blocks bir dizi olmalıdır']

    normalized: list[dict] = []
    for i, raw in enumerate(blocks):
        if not isinstance(raw, dict):
            errors.append(f'Blok[{i}] nesne olmalıdır')
            continue
        btype = raw.get('type')
        if btype not in ALLOWED_BLOCK_TYPES:
            errors.append(f'Blok[{i}]: geçersiz tip "{btype}"')
            continue
        bid = raw.get('id') or f'block-{i}'
        props = raw.get('props') if isinstance(raw.get('props'), dict) else {}
        style = raw.get('style') if isinstance(raw.get('style'), dict) else {}
        defaults = BLOCK_TYPES[btype]['defaults']
        merged_props = {**deepcopy(defaults), **props}
        merged_style = {**deepcopy(DEFAULT_STYLE), **style}
        # visibility zorunlu şekil
        vis = merged_style.get('visibility') or {}
        if not isinstance(vis, dict):
            vis = {}
        merged_style['visibility'] = {
            'desktop': bool(vis.get('desktop', True)),
            'tablet': bool(vis.get('tablet', True)),
            'mobile': bool(vis.get('mobile', True)),
        }
        normalized.append({
            'id': str(bid),
            'type': btype,
            'props': merged_props,
            'style': merged_style,
        })
    return normalized, errors
