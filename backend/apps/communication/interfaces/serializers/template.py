"""
Mesaj şablonu API serializers.
"""
from rest_framework import serializers

from apps.communication.domain.models import MessageTemplate


class MessageTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    category_label = serializers.SerializerMethodField()
    system_usages = serializers.SerializerMethodField()
    is_system_active = serializers.SerializerMethodField()
    odev_pdf_role = serializers.SerializerMethodField()

    class Meta:
        model = MessageTemplate
        fields = [
            'id', 'category', 'category_label', 'audience_scope', 'name', 'body', 'variables_json', 'attachment_ids_json',
            'is_active', 'usage_count', 'stats_sent', 'stats_read', 'stats_failed',
            'avg_read_seconds', 'created_by', 'created_by_name', 'created_at', 'updated_at',
            'system_usages', 'is_system_active', 'odev_pdf_role',
        ]
        read_only_fields = [
            'id', 'usage_count', 'stats_sent', 'stats_read', 'stats_failed',
            'avg_read_seconds', 'created_by', 'created_at', 'updated_at',
        ]

    def get_category_label(self, obj) -> str:
        labels = self.context.get('category_labels') or {}
        return labels.get(obj.category, obj.category)

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_system_usages(self, obj) -> list[dict]:
        from apps.coaching.assignment_manual.assignment_template_roles import list_template_system_usages
        return list_template_system_usages(obj)

    def get_is_system_active(self, obj) -> bool:
        return bool(self.get_system_usages(obj))

    def get_odev_pdf_role(self, obj) -> str | None:
        from apps.coaching.assignment_manual.assignment_template_roles import get_template_odev_role
        return get_template_odev_role(obj)


class MessageTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    body = serializers.CharField(required=False, allow_blank=True, default='')
    category = serializers.CharField(required=False, default='ozel')
    audience_scope = serializers.CharField(required=False, default='genel')
    variables_json = serializers.JSONField(required=False, default=list)
    attachment_ids_json = serializers.JSONField(required=False, default=list)
    is_active = serializers.BooleanField(required=False, default=True)
    odev_pdf_role = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CampaignAttachmentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    original_name = serializers.CharField()
    mime_type = serializers.CharField()
    file_size = serializers.IntegerField()
    created_at = serializers.DateTimeField()
