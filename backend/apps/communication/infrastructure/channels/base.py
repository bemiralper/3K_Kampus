"""
Kanal sağlayıcı temel sınıfı.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseChannelClient(ABC):
    """WhatsApp / SMS / Email kanalları için ortak arayüz."""

    channel: str = ''

    @abstractmethod
    def send_text(self, kurum_id: int, to_e164: str, text: str) -> dict[str, Any]:
        ...

    @abstractmethod
    def test_connection(self, kurum_id: int) -> dict[str, Any]:
        ...

    def mask_token(self, token: str) -> str:
        if not token or len(token) < 8:
            return '****'
        return f'{token[:4]}...{token[-4:]}'
