"""
Kampanya ve alıcı API serializers.
"""
from rest_framework import serializers

from apps.communication.domain.models import OutboundCampaign


class CampaignPreviewRequestSerializer(serializers.Serializer):
    recipient_filter = serializers.JSONField(required=False, default=dict)
    body = serializers.CharField(required=False, allow_blank=True)
    kurum_id = serializers.IntegerField(required=False)
    attachment_count = serializers.IntegerField(required=False, default=0, min_value=0)
    ai_used = serializers.BooleanField(required=False, default=False)


class CampaignCreateSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True, default='')
    body = serializers.CharField(required=False, allow_blank=True, default='')
    template_name = serializers.CharField(required=False, allow_blank=True, default='')
    template_language = serializers.CharField(required=False, allow_blank=True, default='tr')
    audience_filter = serializers.JSONField(required=False, default=dict)
    kurum_id = serializers.IntegerField(required=False)
    channel_config_id = serializers.UUIDField(required=False, allow_null=True)
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )
    template_id = serializers.UUIDField(required=False, allow_null=True)
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    send_options = serializers.JSONField(required=False, default=dict)
    save_as_template = serializers.BooleanField(required=False, default=False)
    template_category = serializers.CharField(required=False, allow_blank=True, default='')
    draft_only = serializers.BooleanField(required=False, default=False)


class CampaignListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    channel_config_id = serializers.UUIDField(read_only=True, allow_null=True)
    channel_config_name = serializers.SerializerMethodField()
    delivery_rate = serializers.SerializerMethodField()
    read_rate = serializers.SerializerMethodField()

    class Meta:
        model = OutboundCampaign
        fields = [
            'id', 'title', 'channel', 'channel_config_id', 'channel_config_name',
            'status', 'total_recipients',
            'sent_count', 'delivered_count', 'read_count', 'failed_count',
            'replied_count', 'delivery_rate', 'read_rate',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
            'recipient_filter_json',
        ]

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''

    def get_channel_config_name(self, obj) -> str:
        cfg = getattr(obj, 'channel_config', None)
        if cfg:
            return cfg.name or cfg.display_phone or ''
        return ''

    def get_delivery_rate(self, obj) -> float:
        total = obj.sent_count or 0
        if not total:
            return 0.0
        return round(100.0 * (obj.delivered_count or 0) / total, 1)

    def get_read_rate(self, obj) -> float:
        total = obj.sent_count or 0
        if not total:
            return 0.0
        return round(100.0 * (obj.read_count or 0) / total, 1)


class CampaignDetailSerializer(CampaignListSerializer):
    analytics = serializers.SerializerMethodField()

    class Meta(CampaignListSerializer.Meta):
        fields = CampaignListSerializer.Meta.fields + [
            'body_template', 'recipient_filter_json', 'preview_stats_json',
            'scheduled_at', 'estimated_cost_usd', 'send_options_json', 'analytics',
        ]

    def get_analytics(self, obj) -> dict:
        total = obj.total_recipients or 0
        sent = obj.sent_count or 0
        delivered = obj.delivered_count or 0
        read = obj.read_count or 0
        failed = obj.failed_count or 0
        replied = obj.replied_count or 0
        return {
            'total': total,
            'sent': sent,
            'delivered': delivered,
            'read': read,
            'failed': failed,
            'replied': replied,
            'delivery_rate': round(100.0 * delivered / sent, 1) if sent else 0,
            'read_rate': round(100.0 * read / sent, 1) if sent else 0,
            'fail_rate': round(100.0 * failed / total, 1) if total else 0,
            'reply_rate': round(100.0 * replied / sent, 1) if sent else 0,
        }
