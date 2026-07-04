"""
AI mesaj asistanı arayüzü — varsayılan NullAiAssistProvider (OpenAI yok).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AiAssistProvider(ABC):
    @abstractmethod
    def suggest_reply(self, conversation_id: str, context: dict[str, Any] | None = None) -> str:
        ...

    @abstractmethod
    def draft_message(self, intent: str, recipient: dict[str, Any] | None = None) -> str:
        ...

    @abstractmethod
    def summarize_thread(self, conversation_id: str) -> str:
        ...


class NullAiAssistProvider(AiAssistProvider):
    """AI kapalıyken no-op implementasyon."""

    def suggest_reply(self, conversation_id: str, context: dict[str, Any] | None = None) -> str:
        return ''

    def draft_message(self, intent: str, recipient: dict[str, Any] | None = None) -> str:
        return ''

    def summarize_thread(self, conversation_id: str) -> str:
        return ''


def get_ai_assist_provider() -> AiAssistProvider:
    from django.conf import settings

    if getattr(settings, 'COMMUNICATION_AI_ENABLED', False):
        # Gelecekte alternatif sağlayıcı buraya bağlanır; OpenAI kullanılmaz.
        return NullAiAssistProvider()
    return NullAiAssistProvider()
