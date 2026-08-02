"""
Konuşma listesi ve detay API.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import (
    filter_conversations_for_user,
    user_can_access_conversation,
)
from apps.communication.domain.enums import ConversationStatus
from apps.communication.interfaces.serializers import (
    ConversationDetailSerializer,
    ConversationListSerializer,
)
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository


def _parse_filters(request) -> dict:
    filters: dict = {}
    status_param = request.query_params.get('status')
    if status_param:
        filters['status'] = status_param
    inbox = (request.query_params.get('inbox') or '').strip().lower()
    if inbox:
        filters['inbox'] = inbox
    if request.query_params.get('unread') in ('1', 'true', 'yes'):
        filters['unread'] = True
    if request.query_params.get('archived') in ('1', 'true', 'yes') or inbox == 'archived':
        filters['archived'] = True
    elif status_param != ConversationStatus.ARCHIVED and inbox != 'archived':
        filters['exclude_archived'] = True
    search = request.query_params.get('search', '').strip()
    if search:
        filters['search'] = search
    ogrenci_id = request.query_params.get('ogrenci_id')
    if ogrenci_id:
        try:
            filters['ogrenci_id'] = int(ogrenci_id)
        except (TypeError, ValueError):
            pass
    channel_config_id = request.query_params.get('channel_config_id') or request.query_params.get('account_id')
    if channel_config_id:
        filters['channel_config_id'] = channel_config_id
    period = (request.query_params.get('period') or '').strip().lower()
    if period:
        filters['period'] = period
    department = (request.query_params.get('department') or '').strip()
    if department:
        filters['department'] = department
    return filters


class ConversationListView(CommunicationAPIView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        filters = _parse_filters(request)
        inbox = filters.get('inbox')
        qs = ConversationRepository.list_by_kurum_and_sube(kurum_id, sube_id, **filters)
        qs = filter_conversations_for_user(qs, request.user, inbox=inbox)
        serializer = ConversationListSerializer(qs, many=True, context={'request': request})
        return Response({
            'conversations': serializer.data,
            'total': qs.count(),
        })


class ConversationDetailView(CommunicationAPIView):
    def get(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
        if not conversation:
            return Response({'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_conversation_sube_access(request, kurum_id, conversation)
        if gate:
            return gate

        if not user_can_access_conversation(request.user, conversation):
            return Response({'error': 'Bu konuşmaya erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        return Response(ConversationDetailSerializer(conversation).data)


class ConversationArchiveView(CommunicationAPIView):
    def patch(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
        if not conversation:
            return Response({'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_conversation_sube_access(request, kurum_id, conversation)
        if gate:
            return gate

        if not user_can_access_conversation(request.user, conversation):
            return Response({'error': 'Bu konuşmaya erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        archive = request.data.get('archive', True)
        if archive in (False, 'false', '0', 0):
            ConversationRepository.unarchive(conversation)
        else:
            ConversationRepository.archive(conversation)

        conversation.refresh_from_db()
        return Response(ConversationListSerializer(conversation).data)


class ConversationReadView(CommunicationAPIView):
    def patch(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
        if not conversation:
            return Response({'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_conversation_sube_access(request, kurum_id, conversation)
        if gate:
            return gate

        if not user_can_access_conversation(request.user, conversation):
            return Response({'error': 'Bu konuşmaya erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)

        ConversationRepository.mark_read(conversation)
        conversation.refresh_from_db()
        return Response(ConversationListSerializer(conversation).data)
