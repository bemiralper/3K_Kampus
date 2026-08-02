"""
Meta şablon içerik kuralları — Meta'ya göndermeden önce yerel doğrulama.

Meta'nın reddettiği tipik durumlar burada Türkçe, düzeltilebilir mesajlara çevrilir
(örn. "Variables can't be at the start or end of the template").
"""
from __future__ import annotations

import re
from typing import Any

VAR_TOKEN_RE = re.compile(r'\{\{\s*\w+\s*\}\}')
ADJACENT_VARS_RE = re.compile(r'\}\}\s*\{\{')

BODY_MAX_LENGTH = 1024
HEADER_TEXT_MAX_LENGTH = 60
FOOTER_MAX_LENGTH = 60


def _starts_with_variable(text: str) -> bool:
    return bool(VAR_TOKEN_RE.match(text))


def _ends_with_variable(text: str) -> bool:
    matches = list(VAR_TOKEN_RE.finditer(text))
    return bool(matches) and matches[-1].end() == len(text)


def validate_body(body_named: str) -> list[str]:
    errors: list[str] = []
    body = (body_named or '').strip()
    if not body:
        return ['Mesaj gövdesi zorunludur.']

    if len(body) > BODY_MAX_LENGTH:
        errors.append(
            f'Mesaj gövdesi en fazla {BODY_MAX_LENGTH} karakter olabilir '
            f'(şu an {len(body)}).',
        )
    if _starts_with_variable(body):
        errors.append(
            'Mesaj bir değişkenle başlayamaz (Meta kuralı). Başına sabit bir metin '
            'ekleyin — örn. "Sayın {{veli_ad}}, …".',
        )
    if _ends_with_variable(body):
        errors.append(
            'Mesaj bir değişkenle bitemez (Meta kuralı). Sonuna sabit bir metin '
            'ekleyin — örn. "… {{tarih}} tarihinde paylaşıldı.".',
        )
    if ADJACENT_VARS_RE.search(body):
        errors.append(
            'İki değişken yan yana olamaz. Aralarına açıklayıcı metin ekleyin — '
            'örn. "{{ogrenci_ad}} için {{tarih}}".',
        )
    return errors


def validate_header(header_json: dict[str, Any] | None) -> list[str]:
    header = header_json or {}
    htype = (header.get('type') or '').upper()
    if htype != 'TEXT':
        return []

    errors: list[str] = []
    text = (header.get('text') or '').strip()
    if not text:
        return ['Başlık türü "Metin" seçildi ancak başlık metni boş.']
    if len(text) > HEADER_TEXT_MAX_LENGTH:
        errors.append(
            f'Başlık metni en fazla {HEADER_TEXT_MAX_LENGTH} karakter olabilir '
            f'(şu an {len(text)}).',
        )
    variables = VAR_TOKEN_RE.findall(text)
    if len(variables) > 1:
        errors.append('Başlık metninde en fazla bir değişken kullanılabilir.')
    if _starts_with_variable(text) or _ends_with_variable(text):
        errors.append(
            'Başlık metni değişkenle başlayamaz veya bitemez; sabit metinle çevreleyin.',
        )
    return errors


def validate_footer(footer_text: str) -> list[str]:
    footer = (footer_text or '').strip()
    if not footer:
        return []
    errors: list[str] = []
    if len(footer) > FOOTER_MAX_LENGTH:
        errors.append(f'Alt bilgi en fazla {FOOTER_MAX_LENGTH} karakter olabilir.')
    if VAR_TOKEN_RE.search(footer):
        errors.append('Alt bilgide değişken kullanılamaz.')
    return errors


def validate_buttons(buttons_json: list[dict[str, Any]] | None) -> list[str]:
    buttons = buttons_json or []
    errors: list[str] = []
    if len(buttons) > 3:
        errors.append('En fazla 3 buton eklenebilir.')
    for btn in buttons:
        btype = (btn.get('type') or '').upper()
        text = (btn.get('text') or '').strip()
        if btype in ('QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'PHONE') and not text:
            errors.append('Buton metni boş olamaz.')
        if btype == 'URL' and not (btn.get('url') or '').strip():
            errors.append('Bağlantı butonu için URL girin.')
        if btype in ('PHONE_NUMBER', 'PHONE') and not (
            btn.get('phone_number') or btn.get('phone') or ''
        ).strip():
            errors.append('Telefon butonu için numara girin.')
    return errors


def validate_template_content(
    *,
    body_named: str,
    header_json: dict[str, Any] | None = None,
    footer_text: str = '',
    buttons_json: list[dict[str, Any]] | None = None,
) -> list[str]:
    """Meta'ya göndermeden önce tespit edilebilen tüm kural ihlalleri."""
    return [
        *validate_body(body_named),
        *validate_header(header_json),
        *validate_footer(footer_text),
        *validate_buttons(buttons_json),
    ]
