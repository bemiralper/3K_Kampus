"""
Kampanya ek dosyası yükleme.
"""
from __future__ import annotations

import mimetypes
import os

from django.conf import settings
from django.core.exceptions import ValidationError

from apps.communication.domain.models import CampaignAttachment

ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'}
MAX_BYTES = getattr(settings, 'COMMUNICATION_ATTACHMENT_MAX_BYTES', 16 * 1024 * 1024)


class AttachmentService:
    def upload(
        self,
        kurum_id: int,
        uploaded_file,
        *,
        sube_id: int | None = None,
        uploaded_by_id: int | None = None,
    ) -> CampaignAttachment:
        if not uploaded_file:
            raise ValidationError('Dosya zorunludur.')

        size = uploaded_file.size or 0
        if size > MAX_BYTES:
            raise ValidationError(f'Dosya boyutu {MAX_BYTES // (1024 * 1024)} MB sınırını aşıyor.')

        name = uploaded_file.name or 'attachment'
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValidationError('Desteklenmeyen dosya türü. PDF, PNG, JPG veya DOC kullanın.')

        mime = uploaded_file.content_type or mimetypes.guess_type(name)[0] or 'application/octet-stream'

        return CampaignAttachment.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            file=uploaded_file,
            mime_type=mime,
            original_name=name,
            file_size=size,
            uploaded_by_id=uploaded_by_id,
        )

    def get(self, kurum_id: int, attachment_id, *, sube_id: int | None = None) -> CampaignAttachment | None:
        qs = CampaignAttachment.objects.filter(
            kurum_id=kurum_id,
            id=attachment_id,
        )
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        return qs.first()
