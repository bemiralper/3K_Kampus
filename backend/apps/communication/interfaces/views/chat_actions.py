"""Sohbetler ekranı aksiyonları — sabitleme, susturma, yıldız, silme, iletme, arama.

Mevcut inbox uçlarını (`conversations.py`, `conversation_actions.py`) bozmadan,
yeni Sohbetler arayüzünün ihtiyaç duyduğu işlemleri ekler.
"""
from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.domain.models import Message
from apps.communication.infrastructure.repository import (
    ConversationRepository,
    MessageRepository,
)
from apps.communication.interfaces.serializers import (
    ConversationListSerializer,
    MessageSerializer,
)
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.interfaces.views.base import CommunicationAPIView

TRUTHY = (True, 'true', 'True', '1', 1, 'yes')


def _load(request, conversation_id):
    """(kurum_id, sube_id, conversation, error_response)."""
    kurum_id, sube_id, err = resolve_kurum_and_sube(request)
    if err:
        return None, None, None, err
    conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
    if not conversation:
        return kurum_id, sube_id, None, Response(
            {'error': 'Sohbet bulunamadı.'}, status=status.HTTP_404_NOT_FOUND,
        )
    gate = assert_conversation_sube_access(request, kurum_id, conversation)
    if gate:
        return kurum_id, sube_id, None, gate
    if not user_can_access_conversation(request.user, conversation):
        return kurum_id, sube_id, None, Response(
            {'error': 'Bu sohbete erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN,
        )
    return kurum_id, sube_id, conversation, None


def _serialize(conversation, request):
    states = ConversationRepository.user_state_map(request.user, [conversation.id])
    return ConversationListSerializer(
        conversation, context={'request': request, '_user_states': states},
    ).data


class ConversationPinView(CommunicationAPIView):
    """PATCH — sohbeti kullanıcıya özel sabitle / sabitlemeyi kaldır."""

    def patch(self, request, conversation_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        state = ConversationRepository.user_state(conversation, request.user)
        pin = request.data.get('pin', True)
        state.pinned_at = timezone.now() if pin in TRUTHY else None
        state.save(update_fields=['pinned_at', 'updated_at'])
        return Response(_serialize(conversation, request))


class ConversationMuteView(CommunicationAPIView):
    """PATCH — bildirimleri süreli veya süresiz sustur."""

    def patch(self, request, conversation_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        state = ConversationRepository.user_state(conversation, request.user)
        mute = request.data.get('mute', True)
        if mute in TRUTHY:
            hours = request.data.get('hours')
            try:
                hours_int = int(hours) if hours is not None else None
            except (TypeError, ValueError):
                hours_int = None
            # hours verilmezse "süresiz" — 100 yıl ileri bir tarih
            state.muted_until = (
                timezone.now() + timedelta(hours=hours_int)
                if hours_int
                else timezone.now() + timedelta(days=36500)
            )
        else:
            state.muted_until = None
        state.save(update_fields=['muted_until', 'updated_at'])
        return Response(_serialize(conversation, request))


class ConversationUnreadView(CommunicationAPIView):
    """PATCH — okunmadı olarak işaretle."""

    def patch(self, request, conversation_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        ConversationRepository.mark_unread(conversation)
        conversation.refresh_from_db()
        return Response(_serialize(conversation, request))


class ConversationDeleteView(CommunicationAPIView):
    """DELETE — sohbeti listeden kaldır (soft delete; mesaj geçmişi korunur)."""

    def delete(self, request, conversation_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        ConversationRepository.soft_delete(conversation, actor=request.user)
        return Response({'ok': True, 'id': str(conversation.id)})


class ConversationReadAllView(CommunicationAPIView):
    """POST — görünür tüm sohbetleri okundu yap."""

    def post(self, request):
        from apps.communication.application.coach_scope import filter_conversations_for_user

        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        qs = ConversationRepository.list_by_kurum_and_sube(
            kurum_id, sube_id, exclude_archived=True, unread=True,
        )
        qs = filter_conversations_for_user(
            qs, request.user, kurum_id=kurum_id, sube_id=sube_id,
        )
        updated = 0
        for conversation in qs.iterator():
            ConversationRepository.mark_read(conversation)
            updated += 1
        return Response({'ok': True, 'updated': updated})


class ConversationMessageSearchView(CommunicationAPIView):
    """GET — sohbet içi mesaj araması (WhatsApp'taki 'bu sohbette ara')."""

    def get(self, request, conversation_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        query = (request.query_params.get('q') or '').strip()
        if len(query) < 2:
            return Response({'results': [], 'total': 0})
        rows = MessageRepository.search_in_conversation(conversation.id, query)
        return Response({
            'results': [
                {
                    'id': str(row['id']),
                    'body': row['body'],
                    'direction': row['direction'],
                    'created_at': row['created_at'].isoformat() if row['created_at'] else None,
                }
                for row in rows
            ],
            'total': len(rows),
        })


class ConversationMessageContextView(CommunicationAPIView):
    """GET — bir mesajın etrafındaki pencere; arama sonucuna atlarken kullanılır."""

    def get(self, request, conversation_id, message_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        msgs = MessageRepository.list_around(conversation.id, anchor_id=message_id)
        if not msgs:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        oldest = msgs[0]
        has_more = MessageRepository.visible(conversation.id).filter(
            created_at__lt=oldest.created_at,
        ).exists()
        return Response({
            'messages': MessageSerializer(
                msgs, many=True, context={'_user_id': request.user.id},
            ).data,
            'anchor_id': str(message_id),
            'has_more': has_more,
        })


class MessageStarView(CommunicationAPIView):
    """PATCH — mesajı yıldızla / yıldızı kaldır (kullanıcıya özel)."""

    def patch(self, request, conversation_id, message_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        message = Message.objects.filter(
            id=message_id, conversation_id=conversation.id, deleted_at__isnull=True,
        ).first()
        if not message:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        star = request.data.get('star', True)
        if star in TRUTHY:
            message.starred_by.add(request.user)
        else:
            message.starred_by.remove(request.user)
        message = (
            Message.objects.filter(id=message.id)
            .select_related('reply_to', 'forwarded_from', 'sender_user')
            .prefetch_related(*MessageRepository.THREAD_PREFETCH)
            .first()
        )
        return Response(MessageSerializer(message, context={'_user_id': request.user.id}).data)


class MessagePinView(CommunicationAPIView):
    """PATCH — mesajı sohbetin üstüne sabitle / sabitlemeyi kaldır.

    Yıldızlamanın aksine sabitleme sohbet geneline aittir; aynı anda tek mesaj
    sabitli kalır, böylece üstteki şerit her kullanıcı için aynı bilgiyi taşır.
    """

    def patch(self, request, conversation_id, message_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        message = Message.objects.filter(
            id=message_id, conversation_id=conversation.id, deleted_at__isnull=True,
        ).first()
        if not message:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        pin = request.data.get('pin', True) in TRUTHY
        with transaction.atomic():
            Message.objects.filter(
                conversation_id=conversation.id, pinned_at__isnull=False,
            ).exclude(id=message.id).update(pinned_at=None, pinned_by=None)
            if pin:
                message.pinned_at = timezone.now()
                message.pinned_by = request.user
            else:
                message.pinned_at = None
                message.pinned_by = None
            message.save(update_fields=['pinned_at', 'pinned_by', 'updated_at'])

        message = (
            Message.objects.filter(id=message.id)
            .select_related('reply_to', 'forwarded_from', 'sender_user')
            .prefetch_related(*MessageRepository.THREAD_PREFETCH)
            .first()
        )
        return Response(MessageSerializer(message, context={'_user_id': request.user.id}).data)


class MessageDeleteView(CommunicationAPIView):
    """DELETE — mesajı bu ekrandan kaldır (soft delete).

    WhatsApp'ta olduğu gibi karşı taraftan silinmez; Meta Cloud API giden
    mesajın geri çekilmesini desteklemiyor. Kayıt veritabanında kalır.
    """

    def delete(self, request, conversation_id, message_id):
        _, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        message = Message.objects.filter(
            id=message_id, conversation_id=conversation.id, deleted_at__isnull=True,
        ).first()
        if not message:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        message.deleted_at = timezone.now()
        message.deleted_by = request.user
        message.save(update_fields=['deleted_at', 'deleted_by', 'updated_at'])
        return Response({'ok': True, 'id': str(message.id)})


class MessageForwardView(CommunicationAPIView):
    """POST — mesajı bir veya birden çok sohbete ilet."""

    def post(self, request, conversation_id, message_id):
        from apps.communication.application.communication_service import (
            CommunicationService,
            MessageContent,
            MessageSource,
            RecipientQuery,
        )
        from apps.communication.application.conversation_phone_sync import resolve_outbound_phone

        kurum_id, _, conversation, err = _load(request, conversation_id)
        if err:
            return err
        source = Message.objects.filter(
            id=message_id, conversation_id=conversation.id, deleted_at__isnull=True,
        ).prefetch_related('attachments').first()
        if not source:
            return Response({'error': 'Mesaj bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        target_ids = request.data.get('conversation_ids') or []
        if isinstance(target_ids, str):
            target_ids = [target_ids]
        if not target_ids:
            return Response(
                {'error': 'En az bir hedef sohbet seçin.'}, status=status.HTTP_400_BAD_REQUEST,
            )

        attachment = source.attachments.first()
        service = CommunicationService()
        results = []
        for target_id in target_ids[:20]:
            _, _, target, target_err = _load(request, target_id)
            if target_err:
                results.append({'conversation_id': str(target_id), 'ok': False,
                                'error': 'Hedef sohbete erişilemedi.'})
                continue
            result = service.send(
                kurum_id,
                recipients=RecipientQuery(
                    conversation_id=str(target.id),
                    phone=resolve_outbound_phone(target),
                ),
                content=MessageContent(
                    text=source.body or (attachment.original_name if attachment else 'Ek'),
                    message_type=source.message_type,
                    attachment_path=attachment.file.name if attachment and attachment.file else None,
                    attachment_filename=attachment.original_name if attachment else '',
                    attachment_mime_type=attachment.mime_type if attachment else '',
                ),
                source=MessageSource(module='forward', ref_id=str(source.id)),
                sender_user_id=request.user.id,
                process_immediately=True,
            )
            if result.success and result.message_id:
                Message.objects.filter(id=result.message_id).update(forwarded_from=source)
            results.append({
                'conversation_id': str(target.id),
                'ok': bool(result.success),
                'error': None if result.success else (result.errors or 'Gönderilemedi.'),
                'session_expired': bool(getattr(result, 'session_expired', False)),
            })

        ok_count = sum(1 for r in results if r['ok'])
        return Response({'results': results, 'sent': ok_count, 'total': len(results)})


class StarredMessagesView(CommunicationAPIView):
    """GET — kullanıcının yıldızladığı mesajlar."""

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        msgs = (
            Message.objects.filter(
                starred_by=request.user,
                conversation__kurum_id=kurum_id,
                deleted_at__isnull=True,
            )
            .select_related('conversation', 'sender_user')
            .prefetch_related('attachments')
            .order_by('-created_at')[:100]
        )
        return Response({
            'messages': [
                {
                    'id': str(m.id),
                    'conversation_id': str(m.conversation_id),
                    'contact_name': m.conversation.contact_name or m.conversation.contact_phone,
                    'body': m.body,
                    'direction': m.direction,
                    'created_at': m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ],
        })
