"""
Named LMS değişkenleri ↔ Meta {{1}}, {{2}} eşlemesi.
Kullanıcı yalnızca {{ogrenci_ad}} görür; Meta payload numaralıdır.
"""
from __future__ import annotations

import re
from typing import Any

from apps.communication.application.variable_resolver import VARIABLE_PATTERN

# Header TEXT / body / URL button params için örnek değerler (Meta zorunlu)
SAMPLE_VALUES: dict[str, str] = {
    'ogrenci_ad': 'Ahmet Yılmaz',
    'veli_ad': 'Ayşe Yılmaz',
    'kurum_ad': 'Demo Kurum',
    'sube': 'Merkez',
    'sinif': '12-A',
    'taksit_tutar': '1.500 TL',
    'vade_tarihi': '15.09.2026',
    'odeme_link': 'https://example.com/odeme',
    'tarih': '02.08.2026',
    'saat': '14:30',
}


def extract_named_variables_in_order(text: str) -> list[str]:
    """İlk geçiş sırasına göre benzersiz named değişkenler."""
    seen: set[str] = set()
    ordered: list[str] = []
    for match in VARIABLE_PATTERN.finditer(text or ''):
        key = match.group(1)
        if key.isdigit():
            continue
        if key not in seen:
            seen.add(key)
            ordered.append(key)
    return ordered


def build_variable_map(body_named: str, *extra_texts: str) -> dict[str, str]:
    """
    {'1': 'ogrenci_ad', '2': 'kurum_ad'} — sıra: body, sonra ekstra metinler
    (header text, dynamic URL vb.) içinde ilk görülen named var.
    """
    ordered: list[str] = []
    seen: set[str] = set()
    for text in (body_named, *extra_texts):
        for key in extract_named_variables_in_order(text):
            if key not in seen:
                seen.add(key)
                ordered.append(key)
    return {str(i): name for i, name in enumerate(ordered, start=1)}


def named_to_numbered(text: str, variable_map: dict[str, str]) -> str:
    """{{ogrenci_ad}} → {{1}} (map'e göre)."""
    reverse = {v: k for k, v in variable_map.items()}

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        if key.isdigit():
            return match.group(0)
        idx = reverse.get(key)
        if not idx:
            return match.group(0)
        return '{{' + idx + '}}'

    return VARIABLE_PATTERN.sub(replacer, text or '')


def numbered_to_named(text: str, variable_map: dict[str, str]) -> str:
    """{{1}} → {{ogrenci_ad}}."""

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        name = variable_map.get(key)
        if name:
            return '{{' + name + '}}'
        return match.group(0)

    return VARIABLE_PATTERN.sub(replacer, text or '')


def example_values_for_map(variable_map: dict[str, str]) -> list[str]:
    """Meta template create için body/header example dizisi (sıralı)."""
    if not variable_map:
        return []
    max_idx = max(int(k) for k in variable_map if str(k).isdigit())
    values: list[str] = []
    for i in range(1, max_idx + 1):
        name = variable_map.get(str(i), '')
        values.append(SAMPLE_VALUES.get(name, f'Örnek{i}'))
    return values


def _header_component(header: dict[str, Any], variable_map: dict[str, str]) -> dict[str, Any] | None:
    if not header:
        return None
    htype = (header.get('type') or '').upper()
    if not htype or htype == 'NONE':
        return None

    if htype == 'TEXT':
        text_named = header.get('text') or ''
        text = named_to_numbered(text_named, variable_map)
        comp: dict[str, Any] = {
            'type': 'HEADER',
            'format': 'TEXT',
            'text': text,
        }
        examples = example_values_for_map(
            {k: v for k, v in variable_map.items() if v in extract_named_variables_in_order(text_named)},
        )
        # Header örnekleri yalnızca header'daki değişkenler için
        header_keys = extract_named_variables_in_order(text_named)
        if header_keys:
            reverse = {v: k for k, v in variable_map.items()}
            header_examples = [
                SAMPLE_VALUES.get(k, f'Örnek{reverse.get(k, "1")}') for k in header_keys
            ]
            comp['example'] = {'header_text': header_examples}
        return comp

    if htype in ('IMAGE', 'VIDEO', 'DOCUMENT'):
        example_handle = header.get('example_handle') or header.get('media_handle') or ''
        comp = {
            'type': 'HEADER',
            'format': htype,
        }
        if example_handle:
            comp['example'] = {'header_handle': [example_handle]}
        return comp

    return None


def _buttons_component(buttons: list[dict[str, Any]], variable_map: dict[str, str]) -> dict[str, Any] | None:
    if not buttons:
        return None
    meta_buttons: list[dict[str, Any]] = []
    for btn in buttons:
        btype = (btn.get('type') or '').upper()
        if btype == 'QUICK_REPLY':
            meta_buttons.append({
                'type': 'QUICK_REPLY',
                'text': (btn.get('text') or '')[:25],
            })
        elif btype == 'URL':
            url_named = btn.get('url') or ''
            url = named_to_numbered(url_named, variable_map)
            entry: dict[str, Any] = {
                'type': 'URL',
                'text': (btn.get('text') or '')[:25],
                'url': url,
            }
            url_vars = extract_named_variables_in_order(url_named)
            if url_vars:
                entry['example'] = [
                    SAMPLE_VALUES.get(url_vars[0], 'ornek'),
                ]
            meta_buttons.append(entry)
        elif btype in ('PHONE_NUMBER', 'PHONE'):
            meta_buttons.append({
                'type': 'PHONE_NUMBER',
                'text': (btn.get('text') or '')[:25],
                'phone_number': btn.get('phone_number') or btn.get('phone') or '',
            })
        elif btype == 'OTP':
            # AUTHENTICATION — Meta OTP button; minimal support
            meta_buttons.append({
                'type': 'OTP',
                'otp_type': btn.get('otp_type') or 'COPY_CODE',
            })
    if not meta_buttons:
        return None
    return {'type': 'BUTTONS', 'buttons': meta_buttons}


def build_meta_components(
    *,
    body_named: str,
    header_json: dict[str, Any] | None = None,
    footer_text: str = '',
    buttons_json: list[dict[str, Any]] | None = None,
    variable_map: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """
    Meta create payload components + variable_map.
    Dönüş: (components, variable_map)
    """
    header = header_json or {}
    buttons = buttons_json or []
    header_text = header.get('text') or '' if (header.get('type') or '').upper() == 'TEXT' else ''
    url_texts = [
        b.get('url') or ''
        for b in buttons
        if (b.get('type') or '').upper() == 'URL'
    ]
    vmap = variable_map or build_variable_map(body_named, header_text, *url_texts)

    components: list[dict[str, Any]] = []
    header_comp = _header_component(header, vmap)
    if header_comp:
        components.append(header_comp)

    body_numbered = named_to_numbered(body_named, vmap)
    body_comp: dict[str, Any] = {
        'type': 'BODY',
        'text': body_numbered,
    }
    body_examples = example_values_for_map(vmap)
    # Body örnekleri: body içinde geçenler
    body_keys = extract_named_variables_in_order(body_named)
    if body_keys:
        reverse = {v: k for k, v in vmap.items()}
        body_only = [
            SAMPLE_VALUES.get(k, f'Örnek{reverse.get(k, "1")}') for k in body_keys
        ]
        body_comp['example'] = {'body_text': [body_only]}
    elif body_examples:
        body_comp['example'] = {'body_text': [body_examples]}
    components.append(body_comp)

    if footer_text:
        components.append({
            'type': 'FOOTER',
            'text': footer_text[:60],
        })

    buttons_comp = _buttons_component(buttons, vmap)
    if buttons_comp:
        components.append(buttons_comp)

    return components, vmap


def build_send_body_parameters(
    variable_map: dict[str, str],
    context: dict[str, Any],
) -> list[dict[str, str]]:
    """Gönderim anında sıralı body parameters (map sırasına göre)."""
    if not variable_map:
        return []
    max_idx = max(int(k) for k in variable_map if str(k).isdigit())
    params: list[dict[str, str]] = []
    for i in range(1, max_idx + 1):
        name = variable_map.get(str(i), '')
        value = context.get(name)
        text = '' if value is None else str(value)
        params.append({'type': 'text', 'text': text})
    return params


def infer_named_body_from_meta_components(components: list[dict[str, Any]]) -> tuple[str, dict, str, list, dict]:
    """
    Meta sync'ten gelen components → body_named ({{1}} kalır; map yoksa),
    header_json, footer, buttons, boş variable_map.
    Kullanıcı named map'i sonradan bağlayabilir; sync'te numaralı bırakılır.
    """
    body = ''
    header: dict[str, Any] = {}
    footer = ''
    buttons: list[dict[str, Any]] = []
    for comp in components or []:
        ctype = (comp.get('type') or '').upper()
        if ctype == 'BODY':
            body = comp.get('text') or ''
        elif ctype == 'HEADER':
            fmt = (comp.get('format') or 'TEXT').upper()
            header = {'type': fmt}
            if fmt == 'TEXT':
                header['text'] = comp.get('text') or ''
            else:
                example = comp.get('example') or {}
                handles = example.get('header_handle') or []
                if handles:
                    header['example_handle'] = handles[0]
        elif ctype == 'FOOTER':
            footer = comp.get('text') or ''
        elif ctype == 'BUTTONS':
            for btn in comp.get('buttons') or []:
                btype = (btn.get('type') or '').upper()
                entry = {'type': btype, 'text': btn.get('text') or ''}
                if btype == 'URL':
                    entry['url'] = btn.get('url') or ''
                elif btype == 'PHONE_NUMBER':
                    entry['phone_number'] = btn.get('phone_number') or ''
                buttons.append(entry)
    return body, header, footer, buttons, {}


def map_meta_status(meta_status: str) -> str:
    from apps.communication.domain.enums import MetaTemplateStatus

    raw = (meta_status or '').upper()
    mapping = {
        'APPROVED': MetaTemplateStatus.APPROVED,
        'PENDING': MetaTemplateStatus.PENDING,
        'REJECTED': MetaTemplateStatus.REJECTED,
        'PAUSED': MetaTemplateStatus.PAUSED,
        'DISABLED': MetaTemplateStatus.DISABLED,
        'IN_APPEAL': MetaTemplateStatus.PENDING,
        'PENDING_DELETION': MetaTemplateStatus.DISABLED,
        'DELETED': MetaTemplateStatus.DISABLED,
    }
    return mapping.get(raw, MetaTemplateStatus.PENDING)
