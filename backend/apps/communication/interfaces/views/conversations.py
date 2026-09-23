"""
Konuşma listesi ve detay API.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import (
    _has_full_inbox_access,
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


def _serialize_one(conversation, request) -> dict:
    """Tek sohbet — kullanıcıya özel sabitleme/susturma durumuyla birlikte."""
    states = ConversationRepository.user_state_map(request.user, [conversation.id])
    return ConversationListSerializer(
        conversation, context={'request': request, '_user_states': states},
    ).data


def _parse_chat_filters(request, kurum_id) -> dict:
    """Yeni Sohbetler ekranının ek filtreleri.

    Eski inbox'ın parametreleri aynen çalışmaya devam eder; buradakiler
    yalnızca gönderildiklerinde devreye girer.
    """
    extra: dict = {}
    if request.query_params.get('read') in ('1', 'true', 'yes'):
        extra['read'] = True
    if request.query_params.get('awaiting_reply') in ('1', 'true', 'yes'):
        extra['awaiting_reply'] = True
    if request.query_params.get('search_messages') in ('1', 'true', 'yes'):
        extra['search_messages'] = True

    kinds = (request.query_params.get('contact_kinds') or '').strip()
    if kinds:
        allowed = {'ogrenci', 'veli', 'koc', 'ogretmen', 'diger'}
        selected = [k for k in (p.strip() for p in kinds.split(',')) if k in allowed]
        if selected:
            extra['contact_kinds'] = selected

    since = (request.query_params.get('since') or '').strip().lower()
    if since in ('24h', '7d', '30d'):
        extra['since_hours'] = {'24h': 24, '7d': 168, '30d': 720}[since]

    if request.query_params.get('pinned') in ('1', 'true', 'yes'):
        # Hiç sabitlenmiş sohbet yoksa boş sonuç dönsün diye imkânsız bir id
        extra['pinned_ids'] = ConversationRepository.pinned_conversation_ids(
            request.user, kurum_id,
        ) or ['00000000-0000-0000-0000-000000000000']
    return extra


class ConversationListView(CommunicationAPIView):
    """Sohbet listesi.

    Sayfalama iki yolla çalışır:
    - `cursor` (önerilen): son satırın (last_message_at, id) çiftinden türetilen
      opak imleç; canlı sıralama değişse de satır atlanmaz (M-10).
    - `offset` (eski): `limit` ile birlikte.
    `limit` verilmezse en fazla `MAX_LIMIT` satır döner; sınırsız tam liste yok (A-02).
    """

    MAX_LIMIT = 100
    DEFAULT_LIMIT = 30

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        filters = _parse_filters(request)
        filters.update(_parse_chat_filters(request, kurum_id))
        inbox = filters.get('inbox')
        qs = ConversationRepository.list_by_kurum_and_sube(kurum_id, sube_id, **filters)
        qs = filter_conversations_for_user(
            qs, request.user, inbox=inbox, kurum_id=kurum_id, sube_id=sube_id,
        )

        total = qs.count()
        limit_param = request.query_params.get('limit')
        cursor_param = (request.query_params.get('cursor') or '').strip()
        try:
            limit = max(1, min(int(limit_param), self.MAX_LIMIT)) if limit_param else self.MAX_LIMIT
        except (TypeError, ValueError):
            limit = self.DEFAULT_LIMIT

        offset = 0
        next_cursor = None
        if cursor_param:
            qs = ConversationRepository.apply_cursor(qs, cursor_param)
            rows = list(qs[:limit])
            if len(rows) == limit:
                next_cursor = ConversationRepository.cursor_for(rows[-1])
            has_more = next_cursor is not None
        else:
            try:
                offset = max(0, int(request.query_params.get('offset') or 0))
            except (TypeError, ValueError):
                offset = 0
            rows = list(qs[offset:offset + limit])
            has_more = (offset + len(rows)) < total
            if has_more and rows:
                next_cursor = ConversationRepository.cursor_for(rows[-1])

        from apps.communication.application.conversation_display import (
            prefetch_linked_student_names,
        )

        states = ConversationRepository.user_state_map(request.user, [c.id for c in rows])
        serializer = ConversationListSerializer(
            rows, many=True, context={
                'request': request,
                '_user_states': states,
                '_linked_names': prefetch_linked_student_names(rows),
            },
        )
        return Response({
            'conversations': serializer.data,
            'total': total,
            'offset': offset,
            'has_more': has_more,
            'next_cursor': next_cursor,
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


class ConversationItemView(CommunicationAPIView):
    """Tek sohbetin liste satırı.

    Sohbetler ekranı seçili sohbeti listeden okur; derin bağlantıyla gelen ya
    da aktif filtreye (okunmamış, departman, sayfa) uymayan sohbet listede
    olmayabilir. Bu uç nokta o satırı tek başına döndürür.
    """

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

        return Response(_serialize_one(conversation, request))


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
        return Response(_serialize_one(conversation, request))


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

        # Bildirim çanı kişiye özel kapanır; sohbetin koç sayacı yalnızca
        # yönetici olmayanlarda (veya yönetici cevap yazınca) sıfırlanır.
        ConversationRepository.clear_notifications_for_user(conversation, request.user)
        if not _has_full_inbox_access(request.user):
            ConversationRepository.mark_read(conversation)
        conversation.refresh_from_db()
        return Response(_serialize_one(conversation, request))
