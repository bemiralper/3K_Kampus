"""
Alıcı çözümleme API.
"""
from rest_framework import status
from rest_framework.response import Response

from apps.coaching.services.coach_access import get_coach_profile
from apps.communication.application.campaign_service import AudienceResolver, CampaignService
from apps.communication.interfaces.serializers.config import CampaignPreviewRequestSerializer
from apps.communication.interfaces.views.campaigns import CampaignBulkView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube


class RecipientResolveView(CampaignBulkView):
    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        serializer = CampaignPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'error': 'Geçersiz veri.', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipient_filter = serializer.validated_data.get('recipient_filter') or {}
        audience_type = recipient_filter.get('audience_type')
        if sube_id and audience_type in ('all_veliler', 'all_ogrenciler'):
            recipient_filter = {**recipient_filter, 'sube_id': sube_id}

        result = CampaignService().resolve_recipients(
            kurum_id,
            recipient_filter,
            user=request.user,
        )
        return Response(result)


class CoachStudentsRecipientsView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({'error': 'Koç profili bulunamadı.'}, status=status.HTTP_403_FORBIDDEN)

        filter_json = {
            'audience_type': 'coach_students',
            'coach_id': coach_profile.id,
            'sube_id': sube_id,
        }
        result = AudienceResolver.resolve(kurum_id, filter_json, user=request.user)
        return Response(result.to_dict(include_recipients=True))


class CoachParentsRecipientsView(CampaignBulkView):
    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        coach_profile = get_coach_profile(request.user)
        if not coach_profile:
            return Response({'error': 'Koç profili bulunamadı.'}, status=status.HTTP_403_FORBIDDEN)

        filter_json = {
            'audience_type': 'coach_parents',
            'coach_id': coach_profile.id,
            'sube_id': sube_id,
        }
        result = AudienceResolver.resolve(kurum_id, filter_json, user=request.user)
        return Response(result.to_dict(include_recipients=True))
