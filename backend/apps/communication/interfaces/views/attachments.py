"""
Kampanya ek dosyası yükleme API.
"""
import os

from django.core.exceptions import ValidationError

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.communication.application.attachment_service import AttachmentService
from apps.communication.interfaces.sube_context import assert_record_sube_access
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationBulkPermission

MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024  # 16 MB
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'}


class AttachmentUploadView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'file alanı zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        if upload.size > MAX_ATTACHMENT_BYTES:
            return Response({'error': 'Dosya boyutu 16 MB sınırını aşıyor.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response(
                {'error': f'Desteklenmeyen dosya türü: {ext}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            attachment = AttachmentService().upload(
                kurum_id,
                upload,
                sube_id=sube_id,
                uploaded_by_id=request.user.id if request.user.is_authenticated else None,
            )
        except ValidationError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'id': str(attachment.id),
            'original_name': attachment.original_name,
            'mime_type': attachment.mime_type,
            'file_size': attachment.file_size,
            'created_at': attachment.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class AttachmentDetailView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def get(self, request, attachment_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        attachment = AttachmentService().get(kurum_id, attachment_id, sube_id=sube_id)
        if not attachment:
            return Response({'error': 'Ek bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gate = assert_record_sube_access(request, kurum_id, attachment.sube_id)
        if gate:
            return gate

        return Response({
            'id': str(attachment.id),
            'original_name': attachment.original_name,
            'mime_type': attachment.mime_type,
            'file_size': attachment.file_size,
            'created_at': attachment.created_at.isoformat(),
        })
