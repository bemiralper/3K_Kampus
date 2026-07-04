"""
Mesaj şablonu CRUD ve istatistik güncelleme.
"""
from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.communication.application.template_audience import (
    assert_can_write_template,
    visible_audience_scopes_for_user,
)
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.domain.enums import MessageStatus, TemplateAudienceScope, TemplateCategory
from apps.communication.domain.models import Message, MessageTemplate


class TemplateService:
    """Kurum mesaj şablonları."""

    def list_templates(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        category: str | None = None,
        audience_scope: str | None = None,
        user=None,
        active_only: bool = True,
    ):
        qs = MessageTemplate.objects.filter(kurum_id=kurum_id)
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        if active_only:
            qs = qs.filter(is_active=True)
        if category:
            qs = qs.filter(category=category)
        if audience_scope:
            qs = qs.filter(audience_scope=audience_scope)
        elif user:
            scopes = visible_audience_scopes_for_user(user)
            if scopes:
                qs = qs.filter(audience_scope__in=scopes)
            else:
                qs = qs.none()
        return qs.select_related('created_by').order_by('-updated_at')

    def get_template(self, kurum_id: int, template_id, *, sube_id: int | None = None) -> MessageTemplate | None:
        qs = MessageTemplate.objects.filter(
            kurum_id=kurum_id,
            id=template_id,
        )
        if sube_id is not None:
            qs = qs.filter(sube_id=sube_id)
        return qs.select_related('created_by', 'sube').first()

    def create(
        self,
        kurum_id: int,
        *,
        sube_id: int | None = None,
        user,
        name: str,
        body: str = '',
        category: str = TemplateCategory.OZEL,
        audience_scope: str = TemplateAudienceScope.GENEL,
        variables_json: list | None = None,
        attachment_ids_json: list | None = None,
    ) -> MessageTemplate:
        scope = audience_scope or TemplateAudienceScope.GENEL
        assert_can_write_template(user, scope)
        if not name.strip():
            raise ValidationError('Şablon adı zorunludur.')
        category_slug = category or TemplateCategory.OZEL
        TemplateCategoryService().validate_category_slug(
            kurum_id, category_slug, sube_id=sube_id,
        )
        return MessageTemplate.objects.create(
            kurum_id=kurum_id,
            sube_id=sube_id,
            name=name.strip(),
            body=body or '',
            category=category_slug,
            audience_scope=scope,
            variables_json=variables_json or [],
            attachment_ids_json=attachment_ids_json or [],
            created_by=user,
            is_active=True,
        )

    def update(
        self,
        template: MessageTemplate,
        *,
        user,
        **fields,
    ) -> MessageTemplate:
        new_scope = fields.get('audience_scope', template.audience_scope)
        assert_can_write_template(user, new_scope)
        if 'category' in fields and fields['category']:
            TemplateCategoryService().validate_category_slug(
                template.kurum_id,
                fields['category'],
                existing_slug=template.category,
                sube_id=template.sube_id,
            )
        allowed = {
            'name', 'body', 'category', 'audience_scope',
            'variables_json', 'attachment_ids_json', 'is_active',
        }
        for key, value in fields.items():
            if key in allowed:
                setattr(template, key, value)
        template.save()
        return template

    def delete(self, template: MessageTemplate, *, user) -> dict:
        assert_can_write_template(user, template.audience_scope)
        from apps.communication.application.template_system_usage import (
            deactivate_template_with_reassignment,
        )

        return deactivate_template_with_reassignment(template)

    @transaction.atomic
    def increment_usage(self, template: MessageTemplate) -> None:
        MessageTemplate.objects.filter(pk=template.pk).update(
            usage_count=template.usage_count + 1,
        )

    @classmethod
    def update_stats_on_message_status(cls, message: Message, new_status: str) -> None:
        """Webhook READ/FAILED olaylarında şablon istatistiklerini güncelle."""
        if not message.campaign_id:
            return
        from apps.communication.domain.models import OutboundCampaign

        campaign = OutboundCampaign.objects.filter(id=message.campaign_id).select_related('template').first()
        if not campaign or not campaign.template_id:
            return

        template = campaign.template
        update_fields = ['updated_at']

        if new_status == MessageStatus.READ:
            template.stats_read += 1
            update_fields.append('stats_read')
            if message.sent_at and message.read_at:
                delta = int((message.read_at - message.sent_at).total_seconds())
                if template.stats_read <= 1:
                    template.avg_read_seconds = max(delta, 0)
                else:
                    template.avg_read_seconds = int(
                        (template.avg_read_seconds * (template.stats_read - 1) + delta) / template.stats_read
                    )
                update_fields.append('avg_read_seconds')
        elif new_status == MessageStatus.FAILED:
            template.stats_failed += 1
            update_fields.append('stats_failed')
        elif new_status in (MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ):
            if new_status == MessageStatus.SENT:
                template.stats_sent += 1
                update_fields.append('stats_sent')

        template.updated_at = timezone.now()
        template.save(update_fields=update_fields)
