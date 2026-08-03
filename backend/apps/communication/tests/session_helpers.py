"""
Test yardımcıları — 24 saatlik serbest mesaj penceresi.

Gerçek hayatta pencere kişinin gönderdiği mesajla açılır. Serbest mesaj gönderimini
sınayan testler bu yardımcıyla o durumu kurar.
"""
from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import Channel
from apps.communication.domain.models import Conversation


def open_session_window(
    kurum_id: int,
    *phones: str,
    channel: str = Channel.WHATSAPP,
    minutes_ago: int = 5,
) -> list[Conversation]:
    """Verilen numaralar için sohbeti "az önce mesaj attı" durumuna getir."""
    last_inbound = timezone.now() - timedelta(minutes=minutes_ago)
    conversations = []
    for phone in phones:
        if not phone:
            continue
        try:
            e164 = ContactResolver.normalize(phone)
        except Exception:
            e164 = phone
        conversation, _ = Conversation.objects.get_or_create(
            kurum_id=kurum_id,
            channel=channel,
            contact_phone=e164,
            defaults={'last_customer_message_at': last_inbound},
        )
        if conversation.last_customer_message_at != last_inbound:
            conversation.last_customer_message_at = last_inbound
            conversation.save(update_fields=['last_customer_message_at', 'updated_at'])
        conversations.append(conversation)
    return conversations


def close_session_window(kurum_id: int, *phones: str, channel: str = Channel.WHATSAPP) -> None:
    """Pencereyi kapat — son müşteri mesajı 24 saatten eski."""
    expired = timezone.now() - timedelta(hours=48)
    qs = Conversation.objects.filter(kurum_id=kurum_id, channel=channel)
    if phones:
        normalized = []
        for phone in phones:
            try:
                normalized.append(ContactResolver.normalize(phone))
            except Exception:
                normalized.append(phone)
        qs = qs.filter(contact_phone__in=normalized)
    qs.update(last_customer_message_at=expired)
