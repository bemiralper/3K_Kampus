"""
Meta WABA message_templates listesi.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.communication.infrastructure.channels.whatsapp_cloud import WhatsAppCloudClient
from apps.communication.permissions import CommunicationConfigPermission


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
    permission_classes = [CommunicationConfigPermission]

    def get(self, request):
        kurum_id = _resolve_kurum_id(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        client = WhatsAppCloudClient()
        result = client.list_message_templates(kurum_id)
        templates = []
        for tpl in result.get('templates', []):
            templates.append({
                'name': tpl.get('name', ''),
                'status': tpl.get('status', ''),
                'language': tpl.get('language', ''),
                'category': tpl.get('category', ''),
                'id': tpl.get('id', ''),
            })
        return Response({
            'success': result.get('success', False),
            'error': result.get('error', ''),
            'templates': templates,
        })
