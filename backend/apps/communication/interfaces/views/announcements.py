"""
Duyuru gönderimi — all_veliler kampanya kısayolu.
"""
from django.core.exceptions import ValidationError

from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.integration_hooks import notify_announcement
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationBulkPermission, user_can_bulk_communicate


class AnnouncementSendView(CommunicationAPIView):
    """POST /api/communication/announcements/send/ — duyuru toplu gönderim.

    Duyuru kitlesi varsayılan olarak şubedeki tüm velilerdir; bu uç yalnız gerçek
    toplu gönderim yetkisine (bulk / manage / muhasebe) açıktır. Koç kapsamı
    kampanya ekranından (`campaigns/`) kapsam denetimiyle çalışır (K-04).
    """

    permission_classes = [CommunicationBulkPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        from apps.communication.application.coach_scope import is_coach_bulk_user

        if not user_can_bulk_communicate(request.user) or is_coach_bulk_user(request.user):
            return Response(
                {'error': 'Duyuru göndermek için toplu gönderim yetkisi gerekir.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        body = (request.data.get('body') or '').strip()
        title = (request.data.get('title') or '').strip()
        template_name = (request.data.get('template_name') or '').strip()
        template_language = (request.data.get('template_language') or 'tr').strip()
        if not body and not template_name:
            return Response({'error': 'body zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        audience_filter = request.data.get('audience_filter') or {'audience_type': 'all_veliler'}
        audience_type = audience_filter.get('audience_type')
        if sube_id and audience_type in ('all_veliler', 'all_ogrenciler'):
            audience_filter = {**audience_filter, 'sube_id': sube_id}

        try:
            result = notify_announcement(
                kurum_id,
                body,
                title=title,
                sent_by_user_id=request.user.id if request.user.is_authenticated else None,
                audience_filter=audience_filter,
                template_name=template_name,
                template_language=template_language,
                user=request.user,
                sube_id=sube_id,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if not result or not result.success:
            errors = result.errors if result else ['Gönderim başarısız.']
            return Response({'error': errors[0] if errors else 'Gönderim başarısız.'}, status=400)

        return Response({
            'success': True,
            'campaign_id': result.message_id,
            'message': 'Duyuru kuyruğa alındı.',
        }, status=status.HTTP_201_CREATED)
