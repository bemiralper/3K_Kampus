"""WhatsApp Meta şablon serializers."""
from rest_framework import serializers

from apps.communication.domain.enums import MetaTemplateCategory, MetaTemplateStatus
from apps.communication.domain.models import WhatsAppMetaTemplate


class WhatsAppMetaTemplateSerializer(serializers.ModelSerializer):
    channel_config_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    meta_category_label = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppMetaTemplate
        fields = [
            'id', 'channel_config', 'channel_config_name',
            'name', 'language', 'meta_category', 'meta_category_label',
            'status', 'status_label', 'meta_template_id',
            'body_named', 'header_json', 'footer_text', 'buttons_json',
            'components_json', 'variable_map_json',
            'rejected_reason', 'rejected_detail',
            'last_submitted_at', 'approved_at', 'usage_count',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'meta_template_id', 'components_json', 'variable_map_json',
            'rejected_reason', 'rejected_detail', 'last_submitted_at',
            'approved_at', 'usage_count', 'created_by', 'created_at', 'updated_at',
            'status',
        ]

    def get_channel_config_name(self, obj) -> str:
        cfg = getattr(obj, 'channel_config', None)
        if not cfg:
            return ''
        return cfg.name or cfg.display_phone or str(cfg.id)

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_status_label(self, obj) -> str:
        return dict(MetaTemplateStatus.choices).get(obj.status, obj.status)

    def get_meta_category_label(self, obj) -> str:
        return dict(MetaTemplateCategory.choices).get(obj.meta_category, obj.meta_category)


class WhatsAppMetaTemplateWriteSerializer(serializers.Serializer):
    channel_config_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=512, required=False)
    language = serializers.CharField(max_length=16, required=False, default='tr')
    meta_category = serializers.ChoiceField(
        choices=MetaTemplateCategory.choices,
        required=False,
        default=MetaTemplateCategory.UTILITY,
    )
    body_named = serializers.CharField(required=False, allow_blank=True, default='')
    header_json = serializers.JSONField(required=False, default=dict)
    footer_text = serializers.CharField(required=False, allow_blank=True, default='', max_length=60)
    buttons_json = serializers.JSONField(required=False, default=list)


class WhatsAppMetaTemplateCloneSerializer(serializers.Serializer):
    new_name = serializers.CharField(max_length=512)
