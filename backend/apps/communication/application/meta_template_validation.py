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
# WhatsApp başlık metni: * _ ~ ` ve emoji / sembol yasak (#100 Invalid parameter).
HEADER_FORMAT_CHARS_RE = re.compile(r'[*_~`]')
# Geniş emoji / pictograph aralığı (başlıkta "ifade simgesi" reddi).
EMOJI_RE = re.compile(
    '['
    '\U0001F300-\U0001FAFF'  # symbols & pictographs + extensions
    '\U00002700-\U000027BF'  # dingbats
    '\U00002600-\U000026FF'  # misc symbols
    '\U0001F1E0-\U0001F1FF'  # flags
    '\U0000FE00-\U0000FE0F'  # variation selectors
    '\U0000200D'             # ZWJ
    ']+',
)

BODY_MAX_LENGTH = 1024
HEADER_TEXT_MAX_LENGTH = 60
FOOTER_MAX_LENGTH = 60


def _starts_with_variable(text: str) -> bool:
    return bool(VAR_TOKEN_RE.match(text))


def _ends_with_variable(text: str) -> bool:
    matches = list(VAR_TOKEN_RE.finditer(text))
    return bool(matches) and matches[-1].end() == len(text)


def has_static_text(text: str) -> bool:
    """Değişkenler çıkarıldığında geriye okunur sabit metin kalıyor mu?"""
    return bool(VAR_TOKEN_RE.sub('', text or '').strip())


def header_provides_leading_text(header_json: dict[str, Any] | None) -> bool:
    """Gövdeden önce sabit içerik var mı? (TEXT başlık metni veya medya başlığı)"""
    header = header_json or {}
    htype = (header.get('type') or '').upper()
    if htype == 'TEXT':
        return has_static_text(header.get('text') or '')
    return htype in ('IMAGE', 'VIDEO', 'DOCUMENT')


def validate_body(
    body_named: str,
    *,
    has_leading_text: bool = False,
    has_trailing_text: bool = False,
) -> list[str]:
    """
    Gövde kuralları.

    Meta "değişkenle başlama/bitme" kuralını şablonun bütününe uygular; başlıkta
    sabit metin (veya medya) varsa gövde değişkenle başlayabilir, alt bilgi varsa
    değişkenle bitebilir.
    """
    errors: list[str] = []
    body = (body_named or '').strip()
    if not body:
        return ['Mesaj gövdesi zorunludur.']

    if len(body) > BODY_MAX_LENGTH:
        errors.append(
            f'Mesaj gövdesi en fazla {BODY_MAX_LENGTH} karakter olabilir '
            f'(şu an {len(body)}).',
        )
    if _starts_with_variable(body) and not has_leading_text:
        errors.append(
            'Mesaj bir değişkenle başlayamaz (Meta kuralı). Başına sabit bir metin '
            'ekleyin veya "Metin" türünde bir başlık girin.',
        )
    if _ends_with_variable(body) and not has_trailing_text:
        errors.append(
            'Mesaj bir değişkenle bitemez (Meta kuralı). Sonuna sabit bir metin '
            'ekleyin veya alt bilgi girin.',
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
    raw = header.get('text') or ''
    text = raw.strip()
    if not text:
        return ['Başlık türü "Metin" seçildi ancak başlık metni boş.']
    if '\n' in raw or '\r' in raw:
        errors.append(
            'Başlık metninde yeni satır kullanılamaz (Meta kuralı). Tek satır yazın.',
        )
    if HEADER_FORMAT_CHARS_RE.search(text):
        errors.append(
            'Başlık metninde yıldız (*) veya biçimlendirme karakterleri '
            '(*kalın*, _italik_, ~üstü çizili~, `kod`) kullanılamaz.',
        )
    if EMOJI_RE.search(text):
        errors.append(
            'Başlık metninde emoji / ifade simgesi kullanılamaz (Meta kuralı).',
        )
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
    # Meta FOOTER parametre kabul etmez; değişkenler gönderim öncesi sabitlenir
    # (bkz. meta_template_mapper.freeze_variables). Bu yüzden burada engellenmez.
    if VAR_TOKEN_RE.search(footer) and not has_static_text(footer):
        errors.append(
            'Alt bilgi yalnızca değişkenden oluşamaz; yanına sabit bir metin ekleyin.',
        )
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
        *validate_body(
            body_named,
            has_leading_text=header_provides_leading_text(header_json),
            has_trailing_text=bool((footer_text or '').strip()),
        ),
        *validate_header(header_json),
        *validate_footer(footer_text),
        *validate_buttons(buttons_json),
    ]
