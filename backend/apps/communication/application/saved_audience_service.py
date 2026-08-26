"""Kayıtlı kitleler — kullanıcı + kurum bazlı dinamik filtre kuralları."""
from __future__ import annotations

from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError

from apps.communication.application.audience_query import (
    AudienceQueryService,
    describe_query,
    normalize_query,
)
from apps.communication.domain.models import SavedAudience


def serialize_saved_audience(
    item: SavedAudience,
    *,
    kurum_id: int,
    user=None,
    context_sube_id: int | None = None,
    context_egitim_yili_id: int | None = None,
    include_counts: bool = True,
) -> dict[str, Any]:
    query = normalize_query(item.query_json)
    data = {
        'id': str(item.id),
        'name': item.name,
        'description': item.description or describe_query(query),
        'query': query,
        'created_at': item.created_at.isoformat() if item.created_at else None,
        'updated_at': item.updated_at.isoformat() if item.updated_at else None,
    }
    if include_counts:
        result = AudienceQueryService.resolve(
            kurum_id,
            query,
            user=user,
            context_sube_id=context_sube_id,
            context_egitim_yili_id=context_egitim_yili_id,
        )
        data['counts'] = result.to_preview_dict()
    return data


def list_saved_audiences(
    kurum_id: int,
    user,
    *,
    context_sube_id: int | None = None,
    context_egitim_yili_id: int | None = None,
) -> list[dict[str, Any]]:
    if not user or not user.is_authenticated:
        raise PermissionDenied('Oturum gerekli.')
    items = SavedAudience.objects.filter(
        kurum_id=kurum_id,
        created_by=user,
    )
    return [
        serialize_saved_audience(
            item,
            kurum_id=kurum_id,
            user=user,
            context_sube_id=context_sube_id,
            context_egitim_yili_id=context_egitim_yili_id,
        )
        for item in items
    ]


def create_saved_audience(
    kurum_id: int,
    user,
    *,
    name: str,
    query: dict,
    description: str = '',
    sube_id: int | None = None,
) -> SavedAudience:
    if not user or not user.is_authenticated:
        raise PermissionDenied('Oturum gerekli.')
    name = (name or '').strip()
    if not name:
        raise ValidationError('Kitle adı zorunludur.')
    query = normalize_query(query)
    if not query.get('person_types'):
        raise ValidationError('En az bir kişi türü seçin.')
    if SavedAudience.objects.filter(kurum_id=kurum_id, created_by=user, name=name).exists():
        raise ValidationError('Bu isimde bir kayıtlı kitle zaten var.')
    return SavedAudience.objects.create(
        kurum_id=kurum_id,
        sube_id=sube_id,
        created_by=user,
        name=name,
        description=(description or describe_query(query))[:300],
        query_json=query,
    )


def update_saved_audience(
    kurum_id: int,
    user,
    audience_id,
    *,
    name: str | None = None,
    query: dict | None = None,
    description: str | None = None,
) -> SavedAudience:
    item = _owned(kurum_id, user, audience_id)
    if name is not None:
        name = name.strip()
        if not name:
            raise ValidationError('Kitle adı zorunludur.')
        clash = SavedAudience.objects.filter(
            kurum_id=kurum_id, created_by=user, name=name,
        ).exclude(id=item.id).exists()
        if clash:
            raise ValidationError('Bu isimde bir kayıtlı kitle zaten var.')
        item.name = name
    if query is not None:
        item.query_json = normalize_query(query)
        if not item.query_json.get('person_types'):
            raise ValidationError('En az bir kişi türü seçin.')
    if description is not None:
        item.description = description[:300]
    item.save()
    return item


def delete_saved_audience(kurum_id: int, user, audience_id) -> None:
    item = _owned(kurum_id, user, audience_id)
    item.delete()


def _owned(kurum_id: int, user, audience_id) -> SavedAudience:
    if not user or not user.is_authenticated:
        raise PermissionDenied('Oturum gerekli.')
    item = SavedAudience.objects.filter(
        id=audience_id, kurum_id=kurum_id, created_by=user,
    ).first()
    if not item:
        raise PermissionDenied('Kayıtlı kitle bulunamadı.')
    return item
