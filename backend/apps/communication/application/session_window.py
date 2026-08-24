"""
WhatsApp 24 saatlik müşteri hizmetleri penceresi.

Meta, kişinin son mesajından itibaren 24 saat boyunca serbest metin gönderilmesine
izin verir; pencere kapalıyken yalnızca onaylı şablon iletilebilir (hata 131047).
Pencerenin durumu bu modülde tek yerden hesaplanır; gönderim yolları (sohbet,
olay bazlı bildirim, toplu gönderim) kararlarını buradan alır.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.communication.domain.enums import Channel

STATE_OPEN = 'OPEN'
STATE_EXPIRED = 'EXPIRED'
STATE_NEVER = 'NEVER'
STATE_NOT_APPLICABLE = 'NA'

STATE_LABELS = {
    STATE_OPEN: 'Normal mesaj gönderilebilir',
    STATE_EXPIRED: '24 saatlik süre dolmuş',
    STATE_NEVER: 'Henüz mesaj alınmadı',
    STATE_NOT_APPLICABLE: 'Süre sınırı yok',
}

CLOSED_NOTICE = (
    'Bu kişiye normal WhatsApp mesajı gönderilemez. Mesaj gönderebilmek için '
    'Meta onaylı bir şablon seçmeniz gerekir.'
)

# 131047 dışında pencere kapalıyken dönebilen Meta kodları
SESSION_EXPIRED_ERROR_CODES = frozenset({131047})

# Tekrar denemenin sonucu değiştirmeyeceği Meta hataları
PERMANENT_SEND_ERROR_CODES = frozenset({
    131047,  # 24 saat penceresi / re-engagement
    132001,  # Şablon adı bu dilde Meta'da yok
    132012,  # Şablon bileşen formatı uyuşmuyor
    133010,  # Phone Number ID Cloud API'de kayıtlı değil
})


def window_hours() -> int:
    return int(getattr(settings, 'COMMUNICATION_SESSION_WINDOW_HOURS', 24) or 24)


def enforcement_enabled() -> bool:
    """Kapalı pencerede serbest mesaj denemesi engellensin mi?"""
    return bool(getattr(settings, 'COMMUNICATION_ENFORCE_SESSION_WINDOW', True))


def _error_code(result: dict | None) -> int | None:
    if not result:
        return None
    code = result.get('error_code')
    try:
        return int(code) if code is not None else None
    except (TypeError, ValueError):
        return None


def is_session_error(result: dict | None) -> bool:
    """Meta yanıtı 24 saatlik pencere hatası mı?"""
    if not result:
        return False
    if _error_code(result) in SESSION_EXPIRED_ERROR_CODES:
        return True
    text = str(result.get('error') or '').lower()
    return '131047' in text or 're-engagement message' in text


def is_permanent_send_error(result: dict | None) -> bool:
    """
    Tekrar denemenin fayda etmeyeceği gönderim hataları.
    Örn. şablon Meta'da yok (#132001) veya 24 saat penceresi (#131047).
    """
    if not result:
        return False
    if _error_code(result) in PERMANENT_SEND_ERROR_CODES:
        return True
    if is_session_error(result):
        return True
    text = str(result.get('error') or '').lower()
    return (
        '132001' in text
        or '133010' in text
        or 'account not registered' in text
        or 'template name does not exist' in text
        or 'invalid parameter' in text
    )


@dataclass(frozen=True)
class SessionWindow:
    """Bir kişiyle serbest mesajlaşma penceresinin anlık durumu."""

    state: str = STATE_NEVER
    last_inbound_at: datetime | None = None
    expires_at: datetime | None = None
    conversation_id: str | None = None
    channel: str = Channel.WHATSAPP

    @property
    def is_open(self) -> bool:
        return self.state in (STATE_OPEN, STATE_NOT_APPLICABLE)

    @property
    def seconds_left(self) -> int:
        if self.state != STATE_OPEN or not self.expires_at:
            return 0
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))

    @property
    def label(self) -> str:
        return STATE_LABELS.get(self.state, self.state)

    @property
    def notice(self) -> str:
        return '' if self.is_open else CLOSED_NOTICE

    def as_dict(self) -> dict:
        return {
            'state': self.state,
            'is_open': self.is_open,
            'label': self.label,
            'notice': self.notice,
            'last_inbound_at': (
                self.last_inbound_at.isoformat() if self.last_inbound_at else None
            ),
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'seconds_left': self.seconds_left,
            'window_hours': window_hours(),
        }


def window_from_timestamp(
    last_inbound_at: datetime | None,
    *,
    conversation_id: str | None = None,
    channel: str = Channel.WHATSAPP,
) -> SessionWindow:
    if channel and channel != Channel.WHATSAPP:
        return SessionWindow(state=STATE_NOT_APPLICABLE, channel=channel)
    if not last_inbound_at:
        return SessionWindow(
            state=STATE_NEVER, conversation_id=conversation_id, channel=channel,
        )
    expires_at = last_inbound_at + timedelta(hours=window_hours())
    state = STATE_OPEN if expires_at > timezone.now() else STATE_EXPIRED
    return SessionWindow(
        state=state,
        last_inbound_at=last_inbound_at,
        expires_at=expires_at,
        conversation_id=conversation_id,
        channel=channel,
    )


def window_for_conversation(conversation) -> SessionWindow:
    if conversation is None:
        return SessionWindow()
    return window_from_timestamp(
        conversation.last_customer_message_at,
        conversation_id=str(conversation.id),
        channel=conversation.channel or Channel.WHATSAPP,
    )


def window_for_recipient(
    kurum_id: int,
    *,
    phone: str | None = None,
    veli_id: int | None = None,
    ogrenci_id: int | None = None,
    personel_id: int | None = None,
    channel: str = Channel.WHATSAPP,
) -> SessionWindow:
    """
    Alıcının en güncel sohbetine göre pencere durumu.

    Aynı kişiye ait birden çok thread olabilir (telefon + veli/öğrenci eşleşmesi);
    en son gelen müşteri mesajı esas alınır.
    """
    if channel and channel != Channel.WHATSAPP:
        return SessionWindow(state=STATE_NOT_APPLICABLE, channel=channel)

    from apps.communication.domain.models import Conversation

    resolved_phone = phone or _recipient_phone(
        kurum_id, veli_id=veli_id, ogrenci_id=ogrenci_id, personel_id=personel_id,
    )
    match = Q()
    if resolved_phone:
        normalized = _normalize_quiet(resolved_phone)
        if normalized:
            match |= Q(contact_phone=normalized)
    if veli_id:
        match |= Q(veli_id=veli_id)
    if ogrenci_id:
        match |= Q(ogrenci_id=ogrenci_id)
    if not match:
        return SessionWindow(channel=channel)

    conversation = (
        Conversation.objects.filter(kurum_id=kurum_id, channel=channel)
        .filter(match)
        .exclude(last_customer_message_at__isnull=True)
        .order_by('-last_customer_message_at')
        .only('id', 'channel', 'last_customer_message_at')
        .first()
    )
    if conversation is None:
        return SessionWindow(channel=channel)
    return window_for_conversation(conversation)


def _recipient_phone(
    kurum_id: int,
    *,
    veli_id: int | None,
    ogrenci_id: int | None,
    personel_id: int | None,
) -> str:
    """Sohbet henüz alıcıya bağlanmamışsa numara üzerinden eşleşebilmek için."""
    if veli_id:
        from apps.ogrenci.application.veli_contact import effective_veli_phone
        from apps.ogrenci.domain.models import OgrenciVeli

        veli = (
            OgrenciVeli.objects.filter(id=veli_id, ogrenci__kurum_id=kurum_id)
            .select_related('ogrenci')
            .first()
        )
        if veli:
            return effective_veli_phone(veli, veli.ogrenci) or (veli.telefon or '').strip()
    if ogrenci_id:
        from apps.ogrenci.domain.models import Ogrenci

        return (
            Ogrenci.objects.filter(id=ogrenci_id, kurum_id=kurum_id)
            .values_list('telefon', flat=True)
            .first()
            or ''
        ).strip()
    if personel_id:
        from apps.personel.domain.models import Personel

        personel = Personel.objects.filter(id=personel_id, kurum_id=kurum_id).first()
        if personel:
            return (personel.cep_telefon or '').strip() or (personel.telefon or '').strip()
    return ''


def _normalize_quiet(phone: str) -> str:
    from apps.communication.application.contact_resolver import ContactResolver

    try:
        return ContactResolver.normalize(phone)
    except Exception:
        return (phone or '').strip()
