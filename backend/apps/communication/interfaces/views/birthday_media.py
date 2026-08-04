"""Doğum günü görsel havuzu API."""
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.communication.application.birthday_media_service import BirthdayMediaService
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.permissions import CommunicationManagePermission


def _serialize(asset) -> dict:
    url = ''
    try:
        url = asset.file.url if asset.file else ''
    except Exception:
        url = ''
    return {
        'id': str(asset.id),
        'original_name': asset.original_name,
        'mime_type': asset.mime_type,
        'file_size': asset.file_size,
        'is_active': asset.is_active,
        'sort_order': asset.sort_order,
        'sube_id': asset.sube_id,
        'url': url,
        'created_at': asset.created_at.isoformat() if asset.created_at else None,
    }


class BirthdayMediaListCreateView(CommunicationAPIView):
    permission_classes = [CommunicationManagePermission]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        active_only = request.query_params.get('active_only') in ('1', 'true', 'True')
        assets = BirthdayMediaService().list_assets(
            kurum_id, sube_id=sube_id, active_only=active_only,
        )
        return Response({
            'assets': [_serialize(a) for a in assets],
            'total': assets.count(),
        })

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'file alanı zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            sort_order = int(request.data.get('sort_order') or 0)
        except (TypeError, ValueError):
            sort_order = 0
        try:
            asset = BirthdayMediaService().upload(
                kurum_id,
                upload,
                sube_id=sube_id,
                uploaded_by_id=request.user.id if request.user.is_authenticated else None,
                sort_order=sort_order,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(_serialize(asset), status=status.HTTP_201_CREATED)


class BirthdayMediaDetailView(CommunicationAPIView):
    permission_classes = [CommunicationManagePermission]

    def patch(self, request, asset_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        asset = BirthdayMediaService().get(kurum_id, asset_id)
        if not asset:
            return Response({'error': 'Görsel bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        gate = assert_record_sube_access(request, kurum_id, asset.sube_id)
        if gate:
            return gate
        fields = {}
        if 'is_active' in request.data:
            fields['is_active'] = request.data.get('is_active') in (True, 'true', 'True', '1', 1)
        if 'sort_order' in request.data:
            try:
                fields['sort_order'] = int(request.data.get('sort_order'))
            except (TypeError, ValueError):
                pass
        asset = BirthdayMediaService().update(asset, **fields)
        return Response(_serialize(asset))

    def delete(self, request, asset_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        asset = BirthdayMediaService().get(kurum_id, asset_id)
        if not asset:
            return Response({'error': 'Görsel bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        gate = assert_record_sube_access(request, kurum_id, asset.sube_id)
        if gate:
            return gate
        BirthdayMediaService().delete(asset)
        return Response({'success': True})
