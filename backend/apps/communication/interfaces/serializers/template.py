"""
Mesaj şablonu API serializers.
"""
from rest_framework import serializers

from apps.communication.domain.models import MessageTemplate


class MessageTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    category_label = serializers.SerializerMethodField()
    template_group_label = serializers.SerializerMethodField()
    system_usages = serializers.SerializerMethodField()
    is_system_active = serializers.SerializerMethodField()
    odev_pdf_role = serializers.SerializerMethodField()
    meta_template_name = serializers.SerializerMethodField()
    meta_template_status = serializers.SerializerMethodField()

    class Meta:
        model = MessageTemplate
        fields = [
            'id', 'category', 'category_label', 'audience_scope',
            'template_group', 'template_group_label', 'name', 'body',
            'header_json', 'footer_text',
            'variables_json', 'attachment_ids_json',
            'is_active', 'usage_count', 'stats_sent', 'stats_read', 'stats_failed',
            'avg_read_seconds', 'created_by', 'created_by_name', 'created_at', 'updated_at',
            'system_usages', 'is_system_active', 'odev_pdf_role',
            'meta_template', 'meta_template_name', 'meta_template_status',
        ]
        read_only_fields = [
            'id', 'usage_count', 'stats_sent', 'stats_read', 'stats_failed',
            'avg_read_seconds', 'created_by', 'created_at', 'updated_at',
        ]

    def get_category_label(self, obj) -> str:
        labels = self.context.get('category_labels') or {}
        return labels.get(obj.category, obj.category)

    def get_template_group_label(self, obj) -> str:
        from apps.communication.application.notification_events import template_group_label
        return template_group_label(obj.template_group)

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_system_usages(self, obj) -> list[dict]:
        from apps.coaching.assignment_manual.assignment_template_roles import (
            list_template_system_usages,
        )
        from apps.communication.application.notification_binding_service import (
            list_message_template_binding_usages,
        )
        return [
            *list_template_system_usages(obj),
            *list_message_template_binding_usages(obj),
        ]

    def get_is_system_active(self, obj) -> bool:
        return bool(self.get_system_usages(obj))

    def get_odev_pdf_role(self, obj) -> str | None:
        from apps.coaching.assignment_manual.assignment_template_roles import get_template_odev_role
        return get_template_odev_role(obj)

    def get_meta_template_name(self, obj) -> str:
        return obj.meta_template.name if obj.meta_template_id else ''

    def get_meta_template_status(self, obj) -> str:
        return obj.meta_template.status if obj.meta_template_id else ''


class MessageTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    body = serializers.CharField(required=False, allow_blank=True, default='')
    header_json = serializers.JSONField(required=False, default=dict)
    footer_text = serializers.CharField(required=False, allow_blank=True, default='', max_length=60)
    category = serializers.CharField(required=False, default='ozel')
    audience_scope = serializers.CharField(required=False, default='genel')
    template_group = serializers.CharField(
        required=False, allow_blank=True, max_length=64, default='',
    )
    variables_json = serializers.JSONField(required=False, default=list)
    attachment_ids_json = serializers.JSONField(required=False, default=list)
    is_active = serializers.BooleanField(required=False, default=True)
    odev_pdf_role = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    meta_template_id = serializers.UUIDField(required=False, allow_null=True)
    # Oluştururken aynı metinli Meta taslağı da üret
    also_create_meta_template = serializers.BooleanField(required=False, default=False)
    meta_channel_config_id = serializers.UUIDField(required=False, allow_null=True)
    meta_template_name = serializers.CharField(
        required=False, allow_blank=True, max_length=512, default='',
    )
    meta_language = serializers.CharField(
        required=False, allow_blank=True, max_length=16, default='tr',
    )
    meta_category = serializers.CharField(
        required=False, allow_blank=True, max_length=32, default='UTILITY',
    )


class CampaignAttachmentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    original_name = serializers.CharField()
    mime_type = serializers.CharField()
    file_size = serializers.IntegerField()
    created_at = serializers.DateTimeField()
