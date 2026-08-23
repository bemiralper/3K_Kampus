"""WhatsApp Meta şablon serializers."""
from rest_framework import serializers

from apps.communication.domain.enums import (
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
)
from apps.communication.domain.models import WhatsAppMetaTemplate


class WhatsAppMetaTemplateSerializer(serializers.ModelSerializer):
    channel_config_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    meta_category_label = serializers.SerializerMethodField()
    usage_scope_label = serializers.SerializerMethodField()
    template_group_label = serializers.SerializerMethodField()
    variables = serializers.SerializerMethodField()
    app_template_id = serializers.SerializerMethodField()
    app_template_name = serializers.SerializerMethodField()
    system_usages = serializers.SerializerMethodField()
    is_system_active = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppMetaTemplate
        fields = [
            'id', 'channel_config', 'channel_config_name',
            'name', 'language', 'meta_category', 'meta_category_label',
            'status', 'status_label', 'meta_template_id',
            'usage_scope', 'usage_scope_label',
            'template_group', 'template_group_label',
            'body_named', 'header_json', 'footer_text', 'buttons_json',
            'components_json', 'variable_map_json', 'variables',
            'app_template_id', 'app_template_name',
            'system_usages', 'is_system_active',
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

    def get_usage_scope_label(self, obj) -> str:
        return dict(MetaTemplateUsage.choices).get(obj.usage_scope, obj.usage_scope)

    def get_template_group_label(self, obj) -> str:
        from apps.communication.application.notification_events import template_group_label
        return template_group_label(obj.template_group)

    def _first_app_template(self, obj):
        cache = getattr(obj, '_prefetched_objects_cache', {}) or {}
        if 'app_templates' in cache:
            related = cache['app_templates']
            return related[0] if related else None
        return obj.app_templates.order_by('created_at').first()

    def get_app_template_id(self, obj) -> str:
        app = self._first_app_template(obj)
        return str(app.id) if app else ''

    def get_app_template_name(self, obj) -> str:
        app = self._first_app_template(obj)
        return app.name if app else ''

    def get_variables(self, obj) -> list:
        """Gönderim ekranında doldurulacak değişken adları, gövdedeki sırayla."""
        from apps.communication.application.meta_template_mapper import (
            extract_named_variables_in_order,
        )

        header = obj.header_json or {}
        header_text = header.get('text') or '' if (header.get('type') or '') == 'TEXT' else ''
        names = extract_named_variables_in_order(f'{obj.body_named or ""} {header_text}')
        if names:
            return list(names)
        vmap = obj.variable_map_json or {}
        return [vmap[key] for key in sorted(vmap, key=lambda k: int(k) if k.isdigit() else 0)]

    def get_system_usages(self, obj) -> list[dict]:
        from apps.communication.application.notification_binding_service import (
            list_meta_template_binding_usages,
        )
        return list_meta_template_binding_usages(obj)

    def get_is_system_active(self, obj) -> bool:
        return bool(self.get_system_usages(obj))


class WhatsAppMetaTemplateWriteSerializer(serializers.Serializer):
    channel_config_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=512, required=False)
    language = serializers.CharField(max_length=16, required=False, default='tr')
    meta_category = serializers.ChoiceField(
        choices=MetaTemplateCategory.choices,
        required=False,
        default=MetaTemplateCategory.UTILITY,
    )
    usage_scope = serializers.ChoiceField(
        choices=MetaTemplateUsage.choices,
        required=False,
        default=MetaTemplateUsage.ALL,
    )
    template_group = serializers.CharField(
        required=False, allow_blank=True, max_length=64, default='',
    )
    body_named = serializers.CharField(required=False, allow_blank=True, default='')
    header_json = serializers.JSONField(required=False, default=dict)
    footer_text = serializers.CharField(required=False, allow_blank=True, default='', max_length=60)
    buttons_json = serializers.JSONField(required=False, default=list)
    # Oluştururken aynı metinli uygulama şablonu da üret
    also_create_app_template = serializers.BooleanField(required=False, default=False)
    app_template_name = serializers.CharField(
        required=False, allow_blank=True, max_length=200, default='',
    )
    app_template_category = serializers.CharField(
        required=False, allow_blank=True, max_length=64, default='',
    )
    app_template_audience_scope = serializers.CharField(
        required=False, allow_blank=True, max_length=32, default='',
    )


class WhatsAppMetaTemplateCloneSerializer(serializers.Serializer):
    new_name = serializers.CharField(max_length=512)
