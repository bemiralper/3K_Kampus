"""
Koç bildirim özeti API — conversation bazlı kartlar.
"""
from rest_framework.response import Response

from apps.communication.application.coach_scope import filter_conversations_for_user
from apps.communication.interfaces.serializers import ConversationListSerializer
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository


class NotificationSummaryView(CommunicationAPIView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        qs = ConversationRepository.list_by_kurum_and_sube(
            kurum_id, sube_id, exclude_archived=True,
        )
        qs = filter_conversations_for_user(
            qs, request.user, kurum_id=kurum_id, sube_id=sube_id,
        )
        department = (request.query_params.get('department') or '').strip()
        if department:
            qs = qs.filter(department=department)
        unread_qs = qs.filter(unread_count_coach__gt=0)
        unread_qs = ConversationRepository.exclude_cleared_notifications(
            unread_qs, request.user,
        )
        unread_count = ConversationRepository.unread_count_for_queryset(unread_qs)
        unread_conversations = unread_qs.count()

        cards = ConversationListSerializer(
            unread_qs[:50],
            many=True,
            context={'request': request},
        ).data

        return Response({
            'unread_count': unread_count,
            'unread_conversations': unread_conversations,
            'cards': cards,
        })
