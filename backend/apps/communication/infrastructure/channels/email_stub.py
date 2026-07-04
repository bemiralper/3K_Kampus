"""
E-posta kanal stub — log-only, gerçek sağlayıcı Faz 5+ ile değiştirilir.
"""
from __future__ import annotations

import logging
from typing import Any

from apps.communication.domain.enums import Channel
from apps.communication.infrastructure.channels.base import BaseChannelClient

logger = logging.getLogger(__name__)


class EmailStubClient(BaseChannelClient):
    channel = Channel.EMAIL

    def send_text(self, kurum_id: int, to_e164: str, text: str) -> dict[str, Any]:
        logger.info('[EMAIL stub] kurum=%s to=%s len=%s', kurum_id, to_e164, len(text))
        return {
            'success': True,
            'stub': True,
            'messages': [{'id': f'email_stub_{kurum_id}_{to_e164.lstrip("+")}'}],
        }

    def test_connection(self, kurum_id: int) -> dict[str, Any]:
        return {
            'success': True,
            'configured': False,
            'stub': True,
            'message': 'E-posta stub modu — SMTP yapılandırılmadı.',
        }
