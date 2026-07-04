"""
Kanal yönlendirici — WHATSAPP / SMS / EMAIL client seçimi.
"""
from __future__ import annotations

from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.channels.base import BaseChannelClient
from apps.communication.infrastructure.channels.email_stub import EmailStubClient
from apps.communication.infrastructure.channels.sms_stub import SmsStubClient
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient


class ChannelDispatcher:
    """Mesaj kanalına göre uygun client'ı döndürür."""

    def __init__(self):
        self._clients: dict[str, BaseChannelClient] = {
            Channel.WHATSAPP: WhatsAppCloudClient(),
            Channel.SMS: SmsStubClient(),
            Channel.EMAIL: EmailStubClient(),
        }
        self._default = self._clients[Channel.WHATSAPP]

    def get_client(self, channel: str | None = None) -> BaseChannelClient:
        if not channel:
            return self._default
        return self._clients.get(channel, self._default)
