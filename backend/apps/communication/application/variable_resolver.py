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
    personel=None,
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

    if personel:
        ctx['personel_ad'] = (
            getattr(personel, 'tam_ad', None)
            or f'{getattr(personel, "ad", "")} {getattr(personel, "soyad", "")}'.strip()
            or display_name
        )
    elif recipient_type == 'PERSONEL' and display_name:
        ctx['personel_ad'] = display_name

    if sinif_ad:
        ctx['sinif'] = sinif_ad
    if sube_ad:
        ctx['sube'] = sube_ad

    sube_id = getattr(ogrenci, 'sube_id', None) if ogrenci is not None else None
    ctx.update(kutuphane_first_etut_times(sube_id=sube_id))

    return ctx


def aktif_sinif_ad(ogrenci) -> str:
    """Öğrencinin aktif kaydındaki sınıf adı."""
    ogrenci_id = getattr(ogrenci, 'id', None) if ogrenci is not None else None
    if not ogrenci_id:
        return ''
    from apps.ogrenci.domain.models import OgrenciKayit

    kayit = (
        OgrenciKayit.objects
        .filter(ogrenci_id=ogrenci_id, aktif_mi=True)
        .select_related('sinif')
        .order_by('-id')
        .first()
    )
    if kayit and kayit.sinif_id:
        return getattr(kayit.sinif, 'ad', '') or ''
    return ''


def resolve_sender_personel_ad(user) -> str:
    """Gönderen kullanıcının personel görünen adı (sohbet şablon {{personel_ad}})."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return ''
    personel = getattr(user, 'personel', None)
    if personel is None:
        try:
            from apps.personel.domain.models import Personel

            personel = Personel.objects.filter(user_id=user.id).only('ad', 'soyad').first()
        except Exception:
            personel = None
    if personel is not None:
        return f'{getattr(personel, "ad", "")} {getattr(personel, "soyad", "")}'.strip()
    full = (user.get_full_name() or '').strip()
    if full:
        return full
    return (getattr(user, 'username', None) or '').strip()


def build_recipient_context_from_conversation(conversation, *, sender_user=None) -> dict[str, str]:
    """Konuşmadaki veli/öğrenci bağlantılarından değişken sözlüğü üret."""
    kurum = getattr(conversation, 'kurum', None)
    if kurum is None and conversation.kurum_id:
        from apps.kurum.domain.models import Kurum

        kurum = Kurum.objects.filter(id=conversation.kurum_id).first()

    veli = conversation.veli if conversation.veli_id else None
    ogrenci = conversation.ogrenci if conversation.ogrenci_id else None
    if ogrenci is None and veli is not None:
        ogrenci = getattr(veli, 'ogrenci', None)

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

    ctx = build_recipient_context(
        display_name=display_name,
        recipient_type=recipient_type,
        ogrenci=ogrenci,
        veli=veli,
        kurum=kurum,
        sinif_ad=aktif_sinif_ad(ogrenci),
        sube_ad=sube_ad,
    )
    personel_ad = resolve_sender_personel_ad(sender_user)
    if personel_ad:
        ctx['personel_ad'] = personel_ad
    return ctx


def _format_time(value) -> str:
    if not value:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    return str(value)


def kutuphane_first_etut_times(
    *,
    program=None,
    sube_id=None,
    gun: int | None = None,
) -> dict[str, str]:
    """Kütüphane ders programındaki ilk etüt giriş saatleri (sabah / öğle / akşam)."""
    from apps.kutuphane.ders_programi_utils import (
        empty_first_etut_times,
        first_etut_times_for_weekday,
    )

    empty = empty_first_etut_times()
    if program is None and sube_id:
        try:
            from apps.kutuphane.infrastructure.repository import SubeDersProgramiRepository

            program = SubeDersProgramiRepository.get_by_sube(int(sube_id))
        except (TypeError, ValueError):
            program = None
    if program is None:
        return empty
    if gun is None:
        from django.utils import timezone

        gun = timezone.localdate().weekday()
    return first_etut_times_for_weekday(
        getattr(program, 'ders_saatleri', None),
        gun,
        getattr(program, 'gun_bazli_aktiflik', None),
    )


def build_attendance_context(
    *,
    session,
    record,
    ogrenci,
    veli,
    kurum=None,
) -> dict[str, str]:
    """Yoklama bildirimi şablon değişkenleri."""
    sube_ad = ''
    if ogrenci and getattr(ogrenci, 'sube_id', None):
        sube = getattr(ogrenci, 'sube', None)
        if sube:
            sube_ad = getattr(sube, 'ad', '') or ''

    ctx = build_recipient_context(
        display_name=getattr(veli, 'tam_ad', '') if veli else '',
        recipient_type='VELI',
        ogrenci=ogrenci,
        veli=veli,
        kurum=kurum,
        sinif_ad=aktif_sinif_ad(ogrenci),
        sube_ad=sube_ad,
    )

    library = getattr(session, 'library', None)
    ctx['oturum_ad'] = session.get_periyot_kodu_display() if session else ''
    ctx['yoklama_tarihi'] = session.tarih.strftime('%d.%m.%Y') if session and session.tarih else ''
    ctx['salon_ad'] = getattr(library, 'ad', '') if library else ''
    ctx['giris_saati'] = _format_time(getattr(record, 'giris_saati', None))
    ctx['cikis_saati'] = _format_time(getattr(record, 'cikis_saati', None))

    ders_no = getattr(session, 'ders_no', None)
    ctx['ders_no'] = str(ders_no) if ders_no else ''

    # Bildirim olay katalogu {{tarih}}/{{saat}} kullanır; LMS şablonları
    # yoklama_tarihi/giris_saati/cikis_saati kullanır — ikisini de doldur.
    ctx['tarih'] = ctx['yoklama_tarihi']
    ctx['saat'] = ctx['giris_saati'] or ctx['cikis_saati'] or ''

    program = getattr(session, 'sube_ders_programi', None) if session else None
    library_sube = getattr(library, 'sube_id', None)
    program_sube = getattr(ogrenci, 'sube_id', None) or library_sube
    gun = None
    if session and getattr(session, 'tarih', None):
        gun = session.tarih.weekday()
    ctx.update(kutuphane_first_etut_times(
        program=program,
        sube_id=program_sube,
        gun=gun,
    ))

    return ctx
