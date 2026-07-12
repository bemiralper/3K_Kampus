"""
Koç inbox SSE — okunmamış mesaj değişikliklerini canlı bildirir.
"""
from __future__ import annotations

import json
import time

from django.conf import settings
from django.db import close_old_connections
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response

from apps.communication.application.coach_scope import filter_conversations_for_user
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationModulePermission


def _sse_event(event: str, data: dict) -> str:
    return f'event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


class EventStreamRenderer(BaseRenderer):
    """DRF content negotiation için text/event-stream desteği."""

    media_type = 'text/event-stream'
    format = 'txt'
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class CommunicationEventsStreamView(CommunicationAPIView):
    """GET /api/communication/events/stream/ — Server-Sent Events."""

    permission_classes = [CommunicationModulePermission]
    renderer_classes = [EventStreamRenderer]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        def event_generator():
            last_unread = -1
            last_conversations = -1
            # Gunicorn sync worker --timeout (genelde 120s) dolmadan temiz kapanmalı.
            max_iter = int(getattr(settings, 'COMMUNICATION_SSE_MAX_ITERATIONS', 18) or 0)
            poll_sec = float(getattr(settings, 'COMMUNICATION_SSE_POLL_SECONDS', 5) or 5)
            if poll_sec < 1:
                poll_sec = 1
            iteration = 0
            try:
                close_old_connections()
                yield _sse_event('connected', {'kurum_id': kurum_id, 'sube_id': sube_id})
                while True:
                    close_old_connections()
                    qs = ConversationRepository.list_by_kurum_and_sube(
                        kurum_id, sube_id, exclude_archived=True,
                    )
                    qs = filter_conversations_for_user(qs, request.user)
                    unread_count = ConversationRepository.unread_count_for_queryset(qs)
                    unread_conversations = qs.filter(unread_count_coach__gt=0).count()

                    if unread_count != last_unread or unread_conversations != last_conversations:
                        yield _sse_event('new_message', {
                            'unread_count': unread_count,
                            'unread_conversations': unread_conversations,
                        })
                        last_unread = unread_count
                        last_conversations = unread_conversations
                    else:
                        yield _sse_event('heartbeat', {'ok': True})

                    close_old_connections()
                    iteration += 1
                    if max_iter and iteration >= max_iter:
                        yield _sse_event('reconnect', {'reason': 'max_iterations', 'after_sec': 1})
                        break
                    time.sleep(poll_sec)
            except GeneratorExit:
                pass
            finally:
                close_old_connections()

        response = StreamingHttpResponse(
            event_generator(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
