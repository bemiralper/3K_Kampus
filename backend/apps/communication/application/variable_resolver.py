"""
Şablon değişken çözümleme — gönderim anında kişi bazlı substitute.
"""
from __future__ import annotations

import re
from typing import Any

VARIABLE_PATTERN = re.compile(r'\{\{(\w+)\}\}')


def resolve_variables(body: str, context: dict[str, Any]) -> str:
    """{{veli_ad}} gibi token'ları context değerleriyle değiştir."""

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        value = context.get(key)
        if value is None:
            return match.group(0)
        return str(value)

    return VARIABLE_PATTERN.sub(replacer, body or '')


def build_recipient_context(
    *,
    display_name: str = '',
    recipient_type: str = '',
    ogrenci=None,
    veli=None,
    kurum=None,
    sinif_ad: str = '',
    sube_ad: str = '',
) -> dict[str, str]:
    """Alıcı kaydından değişken sözlüğü üret."""
    ctx: dict[str, str] = {}

    if kurum:
        ctx['kurum_ad'] = getattr(kurum, 'ad', '') or ''

    if veli:
        ctx['veli_ad'] = getattr(veli, 'tam_ad', '') or display_name
    elif recipient_type == 'VELI' and display_name:
        ctx['veli_ad'] = display_name

    if ogrenci:
        ctx['ogrenci_ad'] = f'{getattr(ogrenci, "ad", "")} {getattr(ogrenci, "soyad", "")}'.strip()
    elif recipient_type == 'OGRENCI' and display_name:
        ctx['ogrenci_ad'] = display_name

    if sinif_ad:
        ctx['sinif'] = sinif_ad
    if sube_ad:
        ctx['sube'] = sube_ad

    return ctx


def build_recipient_context_from_conversation(conversation) -> dict[str, str]:
    """Konuşmadaki veli/öğrenci bağlantılarından değişken sözlüğü üret."""
    kurum = getattr(conversation, 'kurum', None)
    if kurum is None and conversation.kurum_id:
        from apps.kurum.domain.models import Kurum

        kurum = Kurum.objects.filter(id=conversation.kurum_id).first()

    veli = conversation.veli if conversation.veli_id else None
    ogrenci = conversation.ogrenci if conversation.ogrenci_id else None

    display_name = conversation.contact_phone
    recipient_type = conversation.contact_type or ''
    if veli:
        display_name = veli.tam_ad
        recipient_type = 'VELI'
    elif ogrenci:
        display_name = f'{ogrenci.ad} {ogrenci.soyad}'.strip()
        recipient_type = 'OGRENCI'

    sube_ad = ''
    if ogrenci and getattr(ogrenci, 'sube_id', None):
        sube = getattr(ogrenci, 'sube', None)
        if sube is None:
            from apps.sube.domain.models import Sube

            sube = Sube.objects.filter(id=ogrenci.sube_id).first()
        if sube:
            sube_ad = getattr(sube, 'ad', '') or ''

    return build_recipient_context(
        display_name=display_name,
        recipient_type=recipient_type,
        ogrenci=ogrenci,
        veli=veli,
        kurum=kurum,
        sube_ad=sube_ad,
    )


def _format_time(value) -> str:
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    return str(value)


def build_attendance_context(
    *,
    session,
    record,
    ogrenci,
    veli,
    kurum=None,
) -> dict[str, str]:
    """Yoklama bildirimi şablon değişkenleri."""
    ctx = build_recipient_context(
        display_name=getattr(veli, 'tam_ad', '') if veli else '',
        recipient_type='VELI',
        ogrenci=ogrenci,
        veli=veli,
        kurum=kurum,
    )

    library = getattr(session, 'library', None)
    ctx['oturum_ad'] = session.get_periyot_kodu_display() if session else ''
    ctx['yoklama_tarihi'] = session.tarih.strftime('%d.%m.%Y') if session and session.tarih else ''
    ctx['salon_ad'] = getattr(library, 'ad', '') if library else ''
    ctx['giris_saati'] = _format_time(getattr(record, 'giris_saati', None))
    ctx['cikis_saati'] = _format_time(getattr(record, 'cikis_saati', None))

    ders_no = getattr(session, 'ders_no', None)
    ctx['ders_no'] = str(ders_no) if ders_no else ''

    if ogrenci and getattr(ogrenci, 'sube_id', None):
        sube = getattr(ogrenci, 'sube', None)
        if sube:
            ctx['sube'] = getattr(sube, 'ad', '') or ''

    return ctx
