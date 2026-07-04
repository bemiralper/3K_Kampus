"""
Mesaj gönderme ve listeleme API.
"""
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.communication.application.coach_scope import user_can_access_conversation
from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
)
from apps.communication.domain.enums import MessageType
from apps.communication.interfaces.serializers import MessageCreateSerializer, MessageSerializer
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository, MessageRepository


class ConversationMessagesView(CommunicationAPIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

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

        from apps.communication.application.conversation_phone_sync import sync_conversation_linked_phone

        conversation = sync_conversation_linked_phone(conversation)

        try:
            limit = min(int(request.query_params.get('limit', 50)), 100)
        except (TypeError, ValueError):
            limit = 50
        before_id = request.query_params.get('before')

        msgs = list(MessageRepository.list_by_conversation(conversation_id, limit=limit, before_id=before_id))
        msgs.reverse()
        total = MessageRepository.count_by_conversation(conversation_id)

        return Response({
            'messages': MessageSerializer(msgs, many=True).data,
            'total': total,
            'has_more': total > len(msgs),
        })

    def post(self, request, conversation_id):
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

        from apps.communication.application.conversation_phone_sync import sync_conversation_linked_phone

        conversation = sync_conversation_linked_phone(conversation)

        uploaded_file = request.FILES.get('file')
        attachment_id = request.data.get('attachment_id')

        if uploaded_file:
            from apps.communication.application.attachment_service import AttachmentService

            try:
                att = AttachmentService().upload(
                    kurum_id,
                    uploaded_file,
                    sube_id=sube_id,
                    uploaded_by_id=request.user.id,
                )
            except Exception as exc:
                from django.core.exceptions import ValidationError

                message = str(exc)
                if isinstance(exc, ValidationError):
                    if hasattr(exc, 'message_dict'):
                        parts = []
                        for val in exc.message_dict.values():
                            parts.extend(val if isinstance(val, list) else [str(val)])
                        message = ' '.join(parts) or message
                    elif getattr(exc, 'messages', None):
                        message = ' '.join(str(m) for m in exc.messages)
                return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)
            attachment_id = str(att.id)

        payload = {
            'text': request.data.get('text', ''),
            'message_type': request.data.get('message_type', 'TEXT'),
            'attachment_id': attachment_id,
            'reply_to_message_id': request.data.get('reply_to_message_id'),
        }
        input_serializer = MessageCreateSerializer(data=payload)
        if not input_serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': input_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message_type = input_serializer.validated_data.get('message_type', MessageType.TEXT)
        attachment_path = None
        attachment_filename = ''
        attachment_mime = ''

        att_id = input_serializer.validated_data.get('attachment_id')
        if att_id:
            from apps.communication.domain.models import CampaignAttachment

            campaign_att = CampaignAttachment.objects.filter(
                kurum_id=kurum_id,
                sube_id=sube_id,
                id=att_id,
            ).first()
            if campaign_att and campaign_att.file:
                attachment_path = campaign_att.file.name
                attachment_filename = campaign_att.original_name
                attachment_mime = campaign_att.mime_type
                if (campaign_att.mime_type or '').startswith('image/'):
                    message_type = MessageType.IMAGE
                else:
                    message_type = MessageType.DOCUMENT

        text = input_serializer.validated_data.get('text', '')
        if not text and not attachment_path:
            return Response({'error': 'Mesaj metni veya ek gerekli.'}, status=status.HTTP_400_BAD_REQUEST)

        if text and '{{' in text:
            from apps.communication.application.variable_resolver import (
                build_recipient_context_from_conversation,
                resolve_variables,
            )

            text = resolve_variables(text, build_recipient_context_from_conversation(conversation))

        from apps.communication.application.conversation_phone_sync import resolve_outbound_phone
        from apps.communication.application.debug_trace import debug_trace, mask_phone

        outbound_phone = resolve_outbound_phone(conversation)
        debug_trace(
            'B',
            'messages.py:post',
            'send_requested',
            {
                'conversation_id': str(conversation_id),
                'conversation_phone': mask_phone(conversation.contact_phone),
                'resolve_outbound_phone': mask_phone(outbound_phone),
                'veli_id': conversation.veli_id,
                'ogrenci_id': conversation.ogrenci_id,
                'phones_match': conversation.contact_phone == outbound_phone,
            },
        )

        process_immediately = request.data.get('process_immediately', True)
        service = CommunicationService()
        result = service.send(
            kurum_id,
            recipients=RecipientQuery(
                conversation_id=str(conversation_id),
                phone=outbound_phone,
            ),
            content=MessageContent(
                text=text or (attachment_filename or 'Ek'),
                message_type=message_type,
                attachment_path=attachment_path,
                attachment_filename=attachment_filename,
                attachment_mime_type=attachment_mime,
                reply_to_message_id=str(input_serializer.validated_data['reply_to_message_id'])
                if input_serializer.validated_data.get('reply_to_message_id')
                else None,
            ),
            source=MessageSource(module='manual', ref_id=str(conversation_id)),
            sender_user_id=request.user.id,
            process_immediately=bool(process_immediately),
        )

        if not result.success:
            return Response({'error': result.errors}, status=status.HTTP_400_BAD_REQUEST)

        message = None
        if result.message_id:
            from apps.communication.domain.models import Message

            message = Message.objects.filter(id=result.message_id).prefetch_related(
                'attachments',
                'reactions',
                'reactions__reacted_by',
                'reply_to__attachments',
            ).select_related('reply_to').first()

        return Response(
            MessageSerializer(message).data if message else {'message_id': result.message_id},
            status=status.HTTP_201_CREATED,
        )
