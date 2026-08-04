"""Doğum günü görsel havuzu CRUD."""
from __future__ import annotations

import mimetypes
import os

from django.core.exceptions import ValidationError
from django.db.models import Q

from apps.communication.domain.models import BirthdayMediaAsset

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}
MAX_BYTES = 5 * 1024 * 1024


class BirthdayMediaService:
    def list_assets(self, kurum_id: int, *, sube_id: int | None = None, active_only: bool = False):
        qs = BirthdayMediaAsset.objects.filter(kurum_id=kurum_id)
        if sube_id is not None:
            qs = qs.filter(Q(sube_id=sube_id) | Q(sube_id__isnull=True))
        if active_only:
            qs = qs.filter(is_active=True)
        return qs.order_by('sort_order', '-created_at')

    def get(self, kurum_id: int, asset_id) -> BirthdayMediaAsset | None:
        return BirthdayMediaAsset.objects.filter(kurum_id=kurum_id, id=asset_id).first()

    def upload(
        self,
        kurum_id: int,
        upload,
        *,
        sube_id: int | None = None,
        uploaded_by_id: int | None = None,
        sort_order: int = 0,
    ) -> BirthdayMediaAsset:
        if not upload:
            raise ValidationError('Dosya zorunludur.')
        if upload.size > MAX_BYTES:
            raise ValidationError('Görsel en fazla 5 MB olabilir.')
        ext = os.path.splitext(upload.name or '')[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValidationError(f'Desteklenmeyen tür: {ext}. png/jpg/webp kullanın.')

        mime = getattr(upload, 'content_type', '') or mimetypes.guess_type(upload.name)[0] or ''
        asset = BirthdayMediaAsset(
            kurum_id=kurum_id,
            sube_id=sube_id,
            original_name=upload.name or 'birthday.jpg',
            mime_type=mime,
            file_size=int(upload.size or 0),
            sort_order=sort_order,
            created_by_id=uploaded_by_id,
            is_active=True,
        )
        asset.file.save(upload.name or 'birthday.jpg', upload, save=True)
        return asset

    def update(self, asset: BirthdayMediaAsset, **fields) -> BirthdayMediaAsset:
        allowed = {'is_active', 'sort_order', 'sube_id'}
        for key, value in fields.items():
            if key in allowed:
                setattr(asset, key, value)
        asset.save()
        return asset

    def delete(self, asset: BirthdayMediaAsset) -> None:
        if asset.file:
            asset.file.delete(save=False)
        asset.delete()
