"""
WhatsApp kampanya maliyet tahmini.
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings


def unit_message_cost_usd() -> Decimal:
    return Decimal(str(getattr(settings, 'COMMUNICATION_WHATSAPP_COST_USD', '0.0009')))


def estimate_campaign_cost(
    message_count: int,
    *,
    attachment_count: int = 0,
) -> Decimal:
    """Basit maliyet: mesaj başına sabit ücret (ekler aynı birim)."""
    if message_count <= 0:
        return Decimal('0')
    per_message = unit_message_cost_usd()
    # Ekli mesajlar ek birim maliyet taşımaz — aynı konuşma oturumunda sayılır
    _ = attachment_count
    return (per_message * message_count).quantize(Decimal('0.000001'))
