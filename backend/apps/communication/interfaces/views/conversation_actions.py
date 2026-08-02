"""Claim / transfer / notes / tags API."""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.claim_service import ClaimConflictError, ClaimService
from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.application.conversation_events import log_conversation_event
from apps.communication.domain.enums import ConversationEventType
from apps.communication.domain.models import Conversation, ConversationNote, ConversationTag
from apps.communication.interfaces.serializers import ConversationListSerializer
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository
from shared.permissions import user_has_any_permission

User = get_user_model()

DEFAULT_TAGS = [
    ('akademik', 'Akademik', '#2563eb'),
    ('odeme', 'Ödeme', '#059669'),
    ('devamsizlik', 'Devamsızlık', '#d97706'),
    ('deneme', 'Deneme', '#7c3aed'),
    ('kayit', 'Kayıt', '#0891b2'),
    ('rehberlik', 'Rehberlik', '#db2777'),
    ('acil', 'Acil', '#dc2626'),
    ('bilgi_talebi', 'Bilgi Talebi', '#64748b'),
]


def _get_conversation(request, conversation_id):
    kurum_id, sube_id, err = resolve_kurum_and_sube(request)
    if err:
        return None, None, None, err
    conversation = ConversationRepository.get_by_id(kurum_id, conversation_id, sube_id=sube_id)
    if not conversation:
        return kurum_id, sube_id, None, Response(
            {'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND,
        )
    gate = assert_conversation_sube_access(request, kurum_id, conversation)
    if gate:
        return kurum_id, sube_id, None, gate
    if not user_can_access_conversation(request.user, conversation):
        return kurum_id, sube_id, None, Response(
            {'error': 'Bu konuşmaya erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN,
        )
    return kurum_id, sube_id, conversation, None


class ConversationClaimView(CommunicationAPIView):
    def post(self, request, conversation_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        expected = request.data.get('claim_version')
        try:
            expected_int = int(expected) if expected is not None else None
        except (TypeError, ValueError):
            expected_int = None
        try:
            conv = ClaimService.claim(
                conversation.id, request.user, expected_version=expected_int,
            )
        except ClaimConflictError as exc:
            return Response({'error': exc.message}, status=status.HTTP_409_CONFLICT)
        except Conversation.DoesNotExist:
            return Response({'error': 'Konuşma bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        conv = ConversationRepository.get_by_id(conv.kurum_id, conv.id) or conv
        return Response(ConversationListSerializer(conv, context={'request': request}).data)


class ConversationTransferView(CommunicationAPIView):
    def post(self, request, conversation_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        to_user_id = request.data.get('to_user_id')
        reason = (request.data.get('reason') or '').strip()
        if not to_user_id:
            return Response({'error': 'to_user_id gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            to_user = User.objects.get(pk=to_user_id)
        except User.DoesNotExist:
            return Response({'error': 'Hedef kullanıcı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        is_manage = user_has_any_permission(request.user, 'communication.manage')
        if is_manage:
            request.user._force_transfer = True  # type: ignore[attr-defined]
        try:
            conv = ClaimService.transfer(
                conversation.id, request.user, to_user, reason=reason,
            )
        except ClaimConflictError as exc:
            return Response({'error': exc.message}, status=status.HTTP_409_CONFLICT)
        finally:
            if hasattr(request.user, '_force_transfer'):
                delattr(request.user, '_force_transfer')

        conv = ConversationRepository.get_by_id(conv.kurum_id, conv.id) or conv
        return Response(ConversationListSerializer(conv, context={'request': request}).data)


class ConversationNotesView(CommunicationAPIView):
    def get(self, request, conversation_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        notes = conversation.internal_notes.select_related('author').all()[:100]
        data = []
        for n in notes:
            author_name = ''
            if n.author_id:
                author_name = (n.author.get_full_name() or n.author.username or '').strip()
            data.append({
                'id': str(n.id),
                'body': n.body,
                'author_id': n.author_id,
                'author_name': author_name,
                'edit_history': n.edit_history or [],
                'created_at': n.created_at.isoformat() if n.created_at else None,
                'updated_at': n.updated_at.isoformat() if n.updated_at else None,
            })
        return Response({'notes': data})

    def post(self, request, conversation_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'error': 'Not metni gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        note = ConversationNote.objects.create(
            conversation=conversation,
            author=request.user,
            body=body,
        )
        log_conversation_event(
            conversation,
            ConversationEventType.NOTE_ADDED,
            actor=request.user,
            meta={'note_id': str(note.id)},
        )
        return Response({
            'id': str(note.id),
            'body': note.body,
            'author_id': note.author_id,
            'author_name': (request.user.get_full_name() or request.user.username or '').strip(),
            'edit_history': [],
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class ConversationNoteDetailView(CommunicationAPIView):
    def patch(self, request, conversation_id, note_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        try:
            note = conversation.internal_notes.get(pk=note_id)
        except ConversationNote.DoesNotExist:
            return Response({'error': 'Not bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        body = (request.data.get('body') or '').strip()
        if not body:
            return Response({'error': 'Not metni gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        history = list(note.edit_history or [])
        history.append({
            'body': note.body,
            'edited_by': request.user.id,
            'edited_at': note.updated_at.isoformat() if note.updated_at else None,
        })
        note.body = body
        note.edit_history = history[-50:]
        note.save(update_fields=['body', 'edit_history', 'updated_at'])
        return Response({
            'id': str(note.id),
            'body': note.body,
            'edit_history': note.edit_history,
            'updated_at': note.updated_at.isoformat(),
        })


class ConversationTagsView(CommunicationAPIView):
    def get(self, request, conversation_id=None):
        """Liste: kurum etiketleri (conversation_id opsiyonel)."""
        kurum_id, _, err = resolve_kurum_and_sube(request)
        if err:
            return err
        self._ensure_default_tags(kurum_id)
        tags = ConversationTag.objects.filter(kurum_id=kurum_id).order_by('name')
        return Response({
            'tags': [
                {'id': str(t.id), 'slug': t.slug, 'name': t.name, 'color': t.color}
                for t in tags
            ],
        })

    def post(self, request, conversation_id):
        _, _, conversation, err = _get_conversation(request, conversation_id)
        if err:
            return err
        tag_ids = request.data.get('tag_ids')
        slugs = request.data.get('slugs')
        if tag_ids is None and slugs is None:
            return Response({'error': 'tag_ids veya slugs gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
        self._ensure_default_tags(conversation.kurum_id)
        tags = ConversationTag.objects.filter(kurum_id=conversation.kurum_id)
        if tag_ids:
            tags = tags.filter(id__in=tag_ids)
        elif slugs:
            tags = tags.filter(slug__in=slugs)
        else:
            # Açık boş liste: sohbetin tüm etiketlerini kaldır
            tags = tags.none()
        conversation.tags.set(tags)
        log_conversation_event(
            conversation,
            ConversationEventType.TAG_CHANGED,
            actor=request.user,
            meta={'slugs': list(conversation.tags.values_list('slug', flat=True))},
        )
        return Response(ConversationListSerializer(conversation, context={'request': request}).data)

    @staticmethod
    def _ensure_default_tags(kurum_id: int) -> None:
        existing = set(
            ConversationTag.objects.filter(kurum_id=kurum_id).values_list('slug', flat=True)
        )
        to_create = [
            ConversationTag(kurum_id=kurum_id, slug=s, name=n, color=c, is_system=True)
            for s, n, c in DEFAULT_TAGS
            if s not in existing
        ]
        if to_create:
            ConversationTag.objects.bulk_create(to_create, ignore_conflicts=True)


class ConversationTagCatalogView(CommunicationAPIView):
    def get(self, request):
        return ConversationTagsView().get(request)
