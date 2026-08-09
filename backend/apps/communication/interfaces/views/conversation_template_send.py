"""
Sohbete Meta onaylı şablon gönderimi.

24 saatlik pencere kapalıyken kullanıcının serbest metin yerine kullandığı yol;
değişkenler adlarıyla gönderilir, Meta'nın beklediği pozisyonel parametrelere
dönüşüm gönderim katmanında yapılır.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.communication_service import (
    CommunicationService,
    MessageContent,
    MessageSource,
    RecipientQuery,
)
from apps.communication.application.meta_template_service import MetaTemplateService
from apps.communication.application.session_window import window_for_conversation
from apps.communication.application.variable_resolver import (
    build_recipient_context_from_conversation,
    resolve_variables,
)
from apps.communication.domain.enums import MetaTemplateUsage
from apps.communication.interfaces.serializers import MessageSerializer
from apps.communication.interfaces.serializers.meta_template import (
    WhatsAppMetaTemplateSerializer,
)
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.interfaces.views.messages import _load_conversation_for_messages


class ConversationTemplateSendView(CommunicationAPIView):
    """
    GET  — sohbette kullanılabilecek kişisel şablonlar ve pencere durumu
    POST — seçilen şablonu gönder
    """

    def get(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        conversation, err_resp = _load_conversation_for_messages(
            request, kurum_id, conversation_id, sube_id,
        )
        if err_resp:
            return err_resp

        templates = MetaTemplateService.list_templates(
            kurum_id,
            channel_config_id=conversation.channel_config_id or None,
            approved_only=True,
            usage=MetaTemplateUsage.PERSONAL,
        )
        context = build_recipient_context_from_conversation(
            conversation, sender_user=request.user,
        )
        contact_type = (conversation.contact_type or '').upper()
        preferred_suffix = '_veli' if contact_type == 'VELI' else (
            '_ogrenci' if contact_type == 'OGRENCI' else ''
        )
        data = WhatsAppMetaTemplateSerializer(templates, many=True).data
        if preferred_suffix:
            data = sorted(
                data,
                key=lambda row: (
                    0 if (row.get('name') or '').endswith(preferred_suffix) else 1,
                    row.get('name') or '',
                ),
            )
        for row in data:
            row['preview'] = resolve_variables(row.get('body_named') or '', context)
        return Response({
            'templates': data,
            'session': window_for_conversation(conversation).as_dict(),
            'context': context,
            'preferred_audience': (
                'veli' if preferred_suffix == '_veli'
                else 'ogrenci' if preferred_suffix == '_ogrenci'
                else None
            ),
        })

    def post(self, request, conversation_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        conversation, err_resp = _load_conversation_for_messages(
            request, kurum_id, conversation_id, sube_id,
        )
        if err_resp:
            return err_resp

        template_id = request.data.get('template_id')
        if not template_id:
            return Response(
                {'error': 'template_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        template = MetaTemplateService.get(kurum_id, template_id)
        if not template:
            return Response(
                {'error': 'Şablon bulunamadı.'}, status=status.HTTP_404_NOT_FOUND,
            )

        variables = request.data.get('variables') or {}
        if not isinstance(variables, dict):
            return Response(
                {'error': 'variables bir nesne olmalıdır.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        context = {
            **build_recipient_context_from_conversation(
                conversation, sender_user=request.user,
            ),
            **{k: str(v) if v is not None else '' for k, v in variables.items()},
        }

        from apps.communication.application.conversation_phone_sync import resolve_outbound_phone

        result = CommunicationService().send(
            kurum_id,
            recipients=RecipientQuery(
                conversation_id=str(conversation_id),
                phone=resolve_outbound_phone(conversation),
            ),
            content=MessageContent(
                text=resolve_variables(template.body_named or '', context),
                template_name=template.name,
                template_language=template.language or 'tr',
                channel_config_id=str(template.channel_config_id),
                template_context=context,
            ),
            source=MessageSource(module='manual', ref_id=str(conversation_id)),
            sender_user_id=request.user.id,
        )
        if not result.success:
            return Response({'error': result.errors}, status=status.HTTP_400_BAD_REQUEST)

        from apps.communication.domain.models import Message

        message = Message.objects.filter(id=result.message_id).prefetch_related(
            'attachments', 'reactions', 'reactions__reacted_by',
        ).first()
        return Response(
            MessageSerializer(message).data if message else {'message_id': result.message_id},
            status=status.HTTP_201_CREATED,
        )
