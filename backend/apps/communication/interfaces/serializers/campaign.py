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

    class Meta:
        model = OutboundCampaign
        fields = [
            'id', 'title', 'channel', 'status', 'total_recipients',
            'sent_count', 'delivered_count', 'read_count', 'failed_count',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class CampaignDetailSerializer(CampaignListSerializer):
    class Meta(CampaignListSerializer.Meta):
        fields = CampaignListSerializer.Meta.fields + [
            'body_template', 'recipient_filter_json', 'preview_stats_json',
            'scheduled_at', 'estimated_cost_usd', 'send_options_json',
        ]
