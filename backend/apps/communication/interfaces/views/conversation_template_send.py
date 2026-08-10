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
from apps.communication.application.personal_chat_template_seed import (
    preferred_personal_chat_template_name,
)
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


def _order_personal_templates(rows: list[dict], *, preferred_name: str | None, audience: str | None):
    """
    Alıcıya göre filtrele + birim şablonunu (sohbet_kocluk_*) öne al.
    Veli → yalnızca *_veli; öğrenci → yalnızca *_ogrenci (varsa).
    """
    suffix = f'_{audience}' if audience in ('veli', 'ogrenci') else ''
    if suffix:
        audience_rows = [r for r in rows if (r.get('name') or '').endswith(suffix)]
        if audience_rows:
            rows = audience_rows

    def sort_key(row: dict):
        name = row.get('name') or ''
        if preferred_name and name == preferred_name:
            return (0, name)
        if audience and name == f'sohbet_genel_{audience}':
            return (1, name)
        if suffix and name.endswith(suffix):
            return (2, name)
        return (3, name)

    return sorted(rows, key=sort_key)


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

        channel = getattr(conversation, 'channel_config', None)
        channel_config_id = conversation.channel_config_id or None
        if channel is None:
            # Eski sohbetlerde channel_config boş olabilir — koçun erişilebilir
            # varsayılan hesabını kullan (şablon listesi + sohbet_kocluk_* tercihi).
            try:
                from apps.communication.application.account_resolver import (
                    AccountResolver,
                )
                channel = AccountResolver.resolve(
                    kurum_id=kurum_id,
                    user=request.user,
                    sube_id=sube_id,
                    raise_if_missing=False,
                )
                if channel is not None:
                    channel_config_id = channel.id
            except Exception:
                channel = None

        templates = MetaTemplateService.list_templates(
            kurum_id,
            channel_config_id=channel_config_id,
            approved_only=True,
            usage=MetaTemplateUsage.PERSONAL,
        )
        context = build_recipient_context_from_conversation(
            conversation, sender_user=request.user,
        )
        contact_type = (conversation.contact_type or '').upper()
        audience = (
            'veli' if contact_type == 'VELI'
            else 'ogrenci' if contact_type == 'OGRENCI'
            else None
        )
        department = (getattr(channel, 'department', None) or '') if channel else ''
        preferred_name = preferred_personal_chat_template_name(department, audience)

        data = WhatsAppMetaTemplateSerializer(templates, many=True).data
        data = _order_personal_templates(
            list(data),
            preferred_name=preferred_name,
            audience=audience,
        )
        for row in data:
            row['preview'] = resolve_variables(row.get('body_named') or '', context)
        return Response({
            'templates': data,
            'session': window_for_conversation(conversation).as_dict(),
            'context': context,
            'preferred_audience': audience,
            'preferred_template_name': preferred_name,
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
