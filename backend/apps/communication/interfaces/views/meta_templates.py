"""
Meta WABA message_templates listesi — geriye uyumluluk.
Tercihen yerel WhatsAppMetaTemplate (APPROVED) döner; yoksa canlı Meta GET.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.application.meta_template_service import MetaTemplateService
from apps.communication.domain.enums import MetaTemplateStatus
from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.infrastructure.repository import ChannelConfigRepository
from apps.communication.permissions import CommunicationModulePermission


def _resolve_kurum_id(request) -> int | None:
    kurum_id = request.query_params.get('kurum_id') or request.data.get('kurum_id')
    if kurum_id:
        try:
            return int(kurum_id)
        except (TypeError, ValueError):
            return None
    active = getattr(request, 'active_kurum_id', None)
    return int(active) if active else None


class WhatsAppMetaTemplatesView(APIView):
    permission_classes = [CommunicationModulePermission]

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        account_id = request.query_params.get('account_id') or request.query_params.get('channel_config_id')
        approved_only = request.query_params.get('approved_only', '1') not in ('0', 'false', 'False')

        local_qs = MetaTemplateService.list_templates(
            kurum_id,
            channel_config_id=account_id,
            approved_only=approved_only,
        )
        local = list(local_qs[:500])
        if local:
            templates = [
                {
                    'id': str(t.id),
                    'meta_template_id': t.meta_template_id,
                    'name': t.name,
                    'status': t.status,
                    'language': t.language,
                    'category': t.meta_category,
                    'body_named': t.body_named,
                    'variable_map_json': t.variable_map_json,
                    'header_json': t.header_json,
                    'footer_text': t.footer_text,
                    'buttons_json': t.buttons_json,
                }
                for t in local
            ]
            return Response({'success': True, 'templates': templates, 'source': 'local'})

        # Yerel boşsa canlı Meta (eski davranış)
        channel_config = None
        if account_id:
            channel_config = ChannelConfigRepository.get_by_id(kurum_id, account_id)
        client = WhatsAppCloudClient(channel_config=channel_config)
        result = client.list_message_templates(kurum_id)
        templates = []
        for tpl in result.get('templates', []):
            st = tpl.get('status', '')
            if approved_only and st != MetaTemplateStatus.APPROVED and st != 'APPROVED':
                continue
            templates.append({
                'name': tpl.get('name', ''),
                'status': st,
                'language': tpl.get('language', ''),
                'category': tpl.get('category', ''),
                'id': tpl.get('id', ''),
            })
        return Response({
            'success': result.get('success', False),
            'error': result.get('error', ''),
            'templates': templates,
            'source': 'meta',
        })
