"""
Koç bildirim özeti API.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import filter_conversations_for_user
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository


class NotificationSummaryView(CommunicationAPIView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        qs = ConversationRepository.list_by_kurum_and_sube(kurum_id, sube_id, exclude_archived=True)
        qs = filter_conversations_for_user(qs, request.user)
        unread_count = ConversationRepository.unread_count_for_queryset(qs)
        unread_conversations = qs.filter(unread_count_coach__gt=0).count()

        return Response({
            'unread_count': unread_count,
            'unread_conversations': unread_conversations,
        })
