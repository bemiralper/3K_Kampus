"""
Kurum şablon kategorisi CRUD ve varsayılan seed.
"""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.text import slugify

from apps.communication.application.template_audience import visible_audience_scopes_for_user
from apps.communication.domain.enums import TemplateAudienceScope, TemplateCategory
from apps.communication.domain.models import MessageTemplate, MessageTemplateCategory

DEFAULT_CATEGORIES: list[tuple[str, str, int, str]] = [
    (TemplateCategory.DENEME_SONUCU, 'Deneme Sonucu', 10, TemplateAudienceScope.COACH),
    (TemplateCategory.HAFTALIK_ODEV, 'Haftalık Ödev', 20, TemplateAudienceScope.COACH),
    (TemplateCategory.DEVAMSIZLIK, 'Devamsızlık', 30, TemplateAudienceScope.ADMIN),
    (TemplateCategory.YOKLAMA_GELMEDI, 'Yoklama — Gelmedi', 31, TemplateAudienceScope.COACH),
    (TemplateCategory.YOKLAMA_GEC, 'Yoklama — Geç Kalma', 32, TemplateAudienceScope.COACH),
    (TemplateCategory.YOKLAMA_CIKIS, 'Yoklama — Çıkış', 33, TemplateAudienceScope.COACH),
    (TemplateCategory.TEBRIK, 'Tebrik', 40, TemplateAudienceScope.GENEL),
    (TemplateCategory.ODEME, 'Ödeme', 50, TemplateAudienceScope.MUHASEBE),
    (TemplateCategory.ODEME_GECIKME, 'Ödeme Gecikme', 51, TemplateAudienceScope.MUHASEBE),
    (TemplateCategory.KARNE, 'Karne', 60, TemplateAudienceScope.GENEL),
    (TemplateCategory.DUYURU, 'Duyuru', 70, TemplateAudienceScope.ADMIN),
    (TemplateCategory.OZEL, 'Özel', 80, TemplateAudienceScope.GENEL),
]


class TemplateCategoryService:
    """Kurum mesaj şablon kategorileri."""

    @classmethod
    def ensure_defaults(cls, kurum_id: int, sube_id: int) -> None:
        if MessageTemplateCategory.objects.filter(kurum_id=kurum_id, sube_id=sube_id).exists():
            return
        MessageTemplateCategory.objects.bulk_create([
            MessageTemplateCategory(
                kurum_id=kurum_id,
                sube_id=sube_id,
                slug=slug,
                label=label,
                sort_order=order,
                audience_scope=scope,
                is_active=True,
            )
            for slug, label, order, scope in DEFAULT_CATEGORIES
        ])

    def list_categories(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        active_only: bool = False,
        user=None,
        audience_scope: str | None = None,
    ):
        if sube_id is None:
            return MessageTemplateCategory.objects.none()
        self.ensure_defaults(kurum_id, sube_id)
        qs = MessageTemplateCategory.objects.filter(kurum_id=kurum_id, sube_id=sube_id)
        if active_only:
            qs = qs.filter(is_active=True)
        if audience_scope:
            qs = qs.filter(audience_scope=audience_scope)
        elif user:
            scopes = visible_audience_scopes_for_user(user)
            if scopes:
                qs = qs.filter(audience_scope__in=scopes)
            else:
                qs = qs.none()
        return qs.order_by('sort_order', 'label')

    def get_category(
        self,
        kurum_id: int,
        category_id,
        *,
        sube_id: int | None = None,
    ) -> MessageTemplateCategory | None:
        qs = MessageTemplateCategory.objects.filter(
            kurum_id=kurum_id,
            id=category_id,
        )
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        return qs.first()

    def get_label_map(self, kurum_id: int, *, sube_id: int | None = None, user=None) -> dict[str, str]:
        cats = self.list_categories(kurum_id, sube_id=sube_id, active_only=False, user=user)
        return {c.slug: c.label for c in cats}

    def _unique_slug(self, kurum_id: int, sube_id: int, label: str, exclude_id=None) -> str:
        base = slugify(label)[:32] or 'kategori'
        slug = base
        counter = 1
        while MessageTemplateCategory.objects.filter(sube_id=sube_id, slug=slug).exclude(
            id=exclude_id,
        ).exists():
            suffix = f'-{counter}'
            slug = f'{base[:32 - len(suffix)]}{suffix}'
            counter += 1
        return slug

    @transaction.atomic
    def create(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        label: str,
        audience_scope: str = TemplateAudienceScope.GENEL,
        sort_order: int | None = None,
    ) -> MessageTemplateCategory:
        if sube_id is None:
            raise ValidationError('Şube bağlamı zorunludur.')
        label = (label or '').strip()
        if not label:
            raise ValidationError('Kategori adı zorunludur.')
        scope = audience_scope or TemplateAudienceScope.GENEL
        valid_scopes = {choice[0] for choice in TemplateAudienceScope.choices}
        if scope not in valid_scopes:
            raise ValidationError('Geçersiz hedef kitle.')
        slug = self._unique_slug(kurum_id, sube_id, label)
        if sort_order is None:
            last = (
                MessageTemplateCategory.objects.filter(kurum_id=kurum_id, sube_id=sube_id)
                .order_by('-sort_order')
                .values_list('sort_order', flat=True)
                .first()
            )
            sort_order = (last or 0) + 10
        return MessageTemplateCategory.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            slug=slug,
            label=label,
            audience_scope=scope,
            sort_order=sort_order,
            is_active=True,
        )

    def update(
        self,
        category: MessageTemplateCategory,
        *,
        label: str | None = None,
        audience_scope: str | None = None,
        sort_order: int | None = None,
        is_active: bool | None = None,
    ) -> MessageTemplateCategory:
        if label is not None:
            label = label.strip()
            if not label:
                raise ValidationError('Kategori adı zorunludur.')
            category.label = label
        if audience_scope is not None:
            valid_scopes = {choice[0] for choice in TemplateAudienceScope.choices}
            if audience_scope not in valid_scopes:
                raise ValidationError('Geçersiz hedef kitle.')
            category.audience_scope = audience_scope
        if sort_order is not None:
            category.sort_order = sort_order
        if is_active is not None:
            category.is_active = is_active
        category.save()
        return category

    @transaction.atomic
    def delete(self, category: MessageTemplateCategory) -> None:
        active_count = MessageTemplateCategory.objects.filter(
            kurum_id=category.kurum_id,
            sube_id=category.sube_id,
            is_active=True,
        ).count()
        if active_count <= 1 and category.is_active:
            raise ValidationError('En az bir aktif kategori kalmalıdır.')
        in_use = MessageTemplate.objects.filter(
            kurum_id=category.kurum_id,
            sube_id=category.sube_id,
            category=category.slug,
            is_active=True,
        ).count()
        if in_use:
            raise ValidationError(
                f'Bu kategoride {in_use} aktif şablon var. Önce şablonları taşıyın veya silin.',
            )
        category.is_active = False
        category.save(update_fields=['is_active', 'updated_at'])

    def validate_category_slug(
        self,
        kurum_id: int,
        slug: str,
        *,
        sube_id: int | None = None,
        existing_slug: str | None = None,
        user=None,
    ) -> None:
        if not slug:
            raise ValidationError('Kategori zorunludur.')
        if sube_id is None:
            raise ValidationError('Şube bağlamı zorunludur.')
        self.ensure_defaults(kurum_id, sube_id)
        if existing_slug and slug == existing_slug:
            return
        qs = MessageTemplateCategory.objects.filter(
            kurum_id=kurum_id,
            sube_id=sube_id,
            slug=slug,
            is_active=True,
        )
        if user:
            scopes = visible_audience_scopes_for_user(user)
            if scopes:
                qs = qs.filter(audience_scope__in=scopes)
            else:
                qs = qs.none()
        if not qs.exists():
            raise ValidationError('Geçersiz veya pasif kategori.')
