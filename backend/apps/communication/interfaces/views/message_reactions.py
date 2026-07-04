"""
Mesaj reaksiyon API.
"""
from django.core.exceptions import ValidationError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.application.message_reaction_service import MessageReactionService
from apps.communication.domain.models import Message
from apps.communication.interfaces.serializers.config import MessageReactionSerializer
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube


class MessageReactionView(CommunicationAPIView):
    def post(self, request, conversation_id, message_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        message = Message.objects.filter(
            id=message_id,
            conversation_id=conversation_id,
            conversation__kurum_id=kurum_id,
        ).select_related(
            'conversation',
            'conversation__ogrenci',
            'conversation__veli__ogrenci',
            'conversation__sube',
        ).first()
        if not message:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_conversation_sube_access(request, kurum_id, message.conversation)
        if gate:
            return gate

        if not user_can_access_conversation(request.user, message.conversation):
            return Response({'error': 'Bu konuşmaya erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        emoji = request.data.get('emoji', '')
        service = MessageReactionService()
        try:
            reaction = service.react(message, emoji=emoji, user=request.user, kurum_id=kurum_id)
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if reaction is None:
            return Response({'ok': True, 'removed': True})

        return Response(MessageReactionSerializer(reaction).data, status=status.HTTP_201_CREATED)
