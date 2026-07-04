"""
AI asistan stub endpoint — COMMUNICATION_AI_ENABLED=False iken 501 döner.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.ai_assist_provider import get_ai_assist_provider
from apps.communication.infrastructure.repository import ConversationRepository
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationManagePermission


class AiSuggestReplyView(CommunicationAPIView):
    """POST /api/communication/ai/suggest-reply/ — admin-only stub."""

    permission_classes = [CommunicationManagePermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        if not getattr(settings, 'COMMUNICATION_AI_ENABLED', False):
            return Response(
                {
                    'error': 'AI asistan devre dışı.',
                    'detail': 'COMMUNICATION_AI_ENABLED=False — öneri üretilemez.',
                },
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        conversation_id = request.data.get('conversation_id', '')
        if conversation_id:
            conversation = ConversationRepository.get_by_id(
                kurum_id, conversation_id, sube_id=sube_id,
            )
            if not conversation:
                return Response({'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
            gate = assert_conversation_sube_access(request, kurum_id, conversation)
            if gate:
                return gate

        provider = get_ai_assist_provider()
        suggestion = provider.suggest_reply(
            str(conversation_id),
            context=request.data.get('context'),
        )
        return Response({'suggestion': suggestion})
