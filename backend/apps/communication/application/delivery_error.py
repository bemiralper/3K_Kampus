"""
WhatsApp / Meta gönderim hatalarını kullanıcıya Türkçe açıklar.
"""
from __future__ import annotations

import re
from typing import Any


_CODE_MAP: dict[int, str] = {
    131026: (
        'Mesaj iletilemedi. Numara WhatsApp’te kayıtlı değil, kurum '
        'numarasını engellemiş veya WhatsApp teslimatı reddetmiş olabilir.'
    ),
    131047: (
        '24 saatlik sohbet penceresi kapalı. Serbest metin yerine onaylı '
        'Meta şablonu kullanın.'
    ),
    131051: 'Bu mesaj türü WhatsApp tarafından desteklenmiyor.',
    131021: 'Alıcı numarası geçici bir WhatsApp kısıtlamasında; daha sonra deneyin.',
    131031: 'WhatsApp iş hesabı kilitli veya kısıtlı. Meta İşletme yöneticisini kontrol edin.',
    131045: 'Bu numaraya çok sık mesaj gönderildiği için WhatsApp geçici olarak durdurdu.',
    131053: 'Medya dosyası WhatsApp’e yüklenemedi. Dosyayı kontrol edip tekrar deneyin.',
    132000: 'Şablon değişkenleri Meta’daki sırayla eşleşmiyor. Şablon bağını kontrol edin.',
    132001: 'Bu şablon Meta’da bulunamadı veya silinmiş.',
    132015: 'Şablon Meta tarafından duraklatılmış. Onay / kalite durumunu kontrol edin.',
    132016: 'Şablon Meta tarafından devre dışı bırakılmış.',
    130429: 'Gönderim kotası doldu. Bir süre sonra tekrar deneyin.',
    368: 'WhatsApp hesabı geçici olarak engellenmiş. Meta İşletme yöneticisini kontrol edin.',
}

_SHORT_MAP: dict[int, str] = {
    131026: 'İletilemedi',
    131047: 'Pencere kapalı',
    131051: 'Desteklenmiyor',
    131021: 'Geçici kısıtlama',
    131031: 'Hesap kilitli',
    131045: 'Çok sık gönderim',
    131053: 'Medya yüklenemedi',
    132000: 'Şablon değişkeni',
    132001: 'Şablon yok',
    132015: 'Şablon duraklatıldı',
    132016: 'Şablon kapalı',
    130429: 'Kota doldu',
    368: 'Hesap engelli',
}

_TITLE_MAP: dict[str, str] = {
    'message undeliverable': _CODE_MAP[131026],
    'undeliverable': _CODE_MAP[131026],
    're-engagement message': _CODE_MAP[131047],
    '(#131047) re-engagement message': _CODE_MAP[131047],
    'unsupported message type': _CODE_MAP[131051],
    'template does not exist': _CODE_MAP[132001],
    'parameter format does not match format in the created template': _CODE_MAP[132000],
    'rate limit hit': _CODE_MAP[130429],
    'spam rate limit hit': _CODE_MAP[130429],
    'business account has been locked': _CODE_MAP[131031],
}


def explain_delivery_failure(
    reason: str | None,
    *,
    code: int | None = None,
    details: str = '',
) -> str:
    """Meta İngilizce başlığını / kodunu Türkçe açıklamaya çevirir."""
    if code is not None:
        mapped = _CODE_MAP.get(int(code))
        if mapped:
            return mapped

    text = (reason or '').strip()
    if not text and details:
        text = details.strip()
    if not text:
        return 'Mesaj iletilemedi.'

    key = text.lower()
    if key in _TITLE_MAP:
        return _TITLE_MAP[key]
    for needle, translated in _TITLE_MAP.items():
        if needle in key:
            return translated

    code_match = re.search(r'\b(13\d{4}|368)\b', text)
    if code_match:
        mapped = _CODE_MAP.get(int(code_match.group(1)))
        if mapped:
            return mapped

    return text


def _short_from_reason(reason: str | None, *, code: int | None = None) -> str:
    if code is not None:
        mapped = _SHORT_MAP.get(int(code))
        if mapped:
            return mapped
    text = (reason or '').strip()
    if not text:
        return ''
    code_match = re.search(r'\b(13\d{4}|368)\b', text)
    if code_match:
        mapped = _SHORT_MAP.get(int(code_match.group(1)))
        if mapped:
            return mapped
    key = text.lower()
    for needle, translated in _TITLE_MAP.items():
        if needle in key:
            for mapped_code, short in _SHORT_MAP.items():
                if _CODE_MAP.get(mapped_code) == translated:
                    return short
            break
    first = re.split(r'[.!?]', text, maxsplit=1)[0].strip()
    if len(first) > 36:
        return first[:34].rstrip() + '…'
    return first or text


def summarize_delivery_failure(
    reason: str | None,
    *,
    code: int | None = None,
    details: str = '',
) -> tuple[str, str]:
    """(kısa etiket, tam açıklama) — tabloda kısa, hover’da uzun. Boş neden = boş."""
    text = (reason or '').strip()
    extra = (details or '').strip()
    if not text and not extra and code is None:
        return '', ''
    full = explain_delivery_failure(reason, code=code, details=details)
    short = _short_from_reason(reason, code=code) or _short_from_reason(full)
    return short or full, full


def explain_from_webhook_errors(errors: list[Any] | None) -> str:
    if not errors:
        return 'Mesaj iletilemedi.'
    first = errors[0] if isinstance(errors[0], dict) else {}
    code = first.get('code')
    try:
        code_int = int(code) if code is not None else None
    except (TypeError, ValueError):
        code_int = None
    details = ''
    error_data = first.get('error_data') or {}
    if isinstance(error_data, dict):
        details = str(error_data.get('details') or '')
    title = first.get('title') or first.get('message') or ''
    return explain_delivery_failure(str(title), code=code_int, details=details)
