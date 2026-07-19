"""
Telefon numarasından konuşma açma / bulma API.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.contact_resolver import ContactResolver
from apps.communication.domain.enums import Channel, RecipientType
from apps.communication.interfaces.serializers import ConversationListSerializer
from apps.communication.interfaces.sube_context import assert_conversation_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.infrastructure.repository import ConversationRepository


class ConversationOpenView(CommunicationAPIView):
    """wa.me yerine uygulama içi thread açmak için."""

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        phone = (request.data.get('phone') or '').strip()
        if not phone:
            return Response({'error': 'phone zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            e164 = ContactResolver.normalize(phone)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        resolved = ContactResolver.resolve_contact(kurum_id, e164)
        req_ogrenci_id = request.data.get('ogrenci_id')
        req_veli_id = request.data.get('veli_id')

        if req_veli_id:
            veli_id = int(req_veli_id)
        elif resolved.veli_id and resolved.contact_type == RecipientType.VELI:
            veli_id = resolved.veli_id
        else:
            veli_id = None

        if veli_id:
            from apps.ogrenci.domain.models import OgrenciVeli

            veli = OgrenciVeli.objects.filter(id=veli_id).select_related('ogrenci').first()
            ogrenci_id = veli.ogrenci_id if veli else resolved.ogrenci_id
            if veli and veli.ogrenci and veli.ogrenci.sube_id != sube_id:
                return Response({'error': 'Kayıt bu şubeye ait değil.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            ogrenci_id = int(req_ogrenci_id) if req_ogrenci_id else resolved.ogrenci_id

        if ogrenci_id:
            from apps.ogrenci.domain.models import Ogrenci

            student_sube_id = Ogrenci.objects.filter(id=ogrenci_id).values_list('sube_id', flat=True).first()
            if student_sube_id and int(student_sube_id) != int(sube_id):
                return Response({'error': 'Kayıt bu şubeye ait değil.'}, status=status.HTTP_403_FORBIDDEN)

        is_veli_thread = bool(veli_id)

        from apps.communication.application.conversation_phone_sync import sync_conversation_linked_phone
        from apps.communication.application.debug_trace import debug_trace, mask_phone

        conversation = None
        if veli_id:
            conversation = ConversationRepository.find_latest_for_veli(
                kurum_id, veli_id, channel=Channel.WHATSAPP,
            )
        elif req_ogrenci_id:
            from apps.communication.domain.models import Conversation

            conversation = (
                Conversation.objects.filter(
                    kurum_id=kurum_id,
                    channel=Channel.WHATSAPP,
                    ogrenci_id=ogrenci_id,
                    veli_id__isnull=True,
                )
                .order_by('-last_message_at', '-updated_at')
                .first()
            )
        if not conversation:
            conversation = ConversationRepository.find_by_phone(
                kurum_id, Channel.WHATSAPP, e164,
            )

        if conversation:
            gate = assert_conversation_sube_access(request, kurum_id, conversation)
            if gate:
                return gate

            conversation = sync_conversation_linked_phone(conversation)
            update_fields = []
            if ogrenci_id and conversation.ogrenci_id != ogrenci_id:
                conversation.ogrenci_id = ogrenci_id
                update_fields.append('ogrenci_id')
            elif ogrenci_id and not conversation.ogrenci_id:
                conversation.ogrenci_id = ogrenci_id
                update_fields.append('ogrenci_id')
            if is_veli_thread and veli_id:
                conversation.veli_id = veli_id
                conversation.contact_type = RecipientType.VELI
                update_fields.extend(['veli_id', 'contact_type'])
            if conversation.sube_id != sube_id:
                conversation.sube_id = sube_id
                update_fields.append('sube_id')
            if update_fields:
                update_fields.append('updated_at')
                conversation.save(update_fields=update_fields)
        else:
            if is_veli_thread:
                contact_type = RecipientType.VELI
            elif req_ogrenci_id or ogrenci_id:
                contact_type = RecipientType.OGRENCI
            else:
                contact_type = resolved.contact_type

            conversation, created = ConversationRepository.get_or_create_for_contact(
                kurum_id=kurum_id,
                channel=Channel.WHATSAPP,
                contact_phone=e164,
                contact_type=contact_type,
                contact_identity=resolved.identity,
                ogrenci_id=ogrenci_id,
                veli_id=veli_id,
            )
            if created and req_ogrenci_id and not is_veli_thread:
                conversation.veli_id = None
                conversation.contact_type = RecipientType.OGRENCI
                conversation.sube_id = sube_id
                conversation.save(update_fields=['veli_id', 'contact_type', 'sube_id', 'updated_at'])
            elif conversation.sube_id != sube_id:
                conversation.sube_id = sube_id
                conversation.save(update_fields=['sube_id', 'updated_at'])
            conversation = sync_conversation_linked_phone(conversation)

        from apps.coaching.services.coach_access import get_coach_profile, user_can_access_student
        from apps.communication.application.coach_scope import user_can_access_conversation

        coach_profile = get_coach_profile(request.user)
        if coach_profile is not None:
            sid = conversation.ogrenci_id or ogrenci_id
            if sid and not user_can_access_student(request.user, int(sid)):
                return Response(
                    {'error': 'Bu öğrenciye mesaj gönderme yetkiniz yok.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            update_fields = []
            if sid and not conversation.ogrenci_id:
                conversation.ogrenci_id = int(sid)
                update_fields.append('ogrenci_id')
            if not conversation.assigned_coach_id:
                conversation.assigned_coach = coach_profile
                update_fields.append('assigned_coach')
            if update_fields:
                update_fields.append('updated_at')
                conversation.save(update_fields=update_fields)
            elif not user_can_access_conversation(request.user, conversation):
                return Response(
                    {'error': 'Bu konuşmaya erişim yetkiniz yok.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        debug_trace(
            'A',
            'conversation_open.py:post',
            'conversation_opened',
            {
                'request_phone': mask_phone(e164),
                'req_veli_id': int(req_veli_id) if req_veli_id else None,
                'resolved_veli_id': resolved.veli_id,
                'resolved_contact_type': resolved.contact_type,
                'chosen_veli_id': veli_id,
                'conversation_id': str(conversation.id),
                'conversation_phone': mask_phone(conversation.contact_phone),
                'ogrenci_id': conversation.ogrenci_id,
                'veli_id': conversation.veli_id,
            },
        )

        return Response(ConversationListSerializer(conversation).data, status=status.HTTP_200_OK)
