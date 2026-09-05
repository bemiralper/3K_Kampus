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
    template_name = serializers.SerializerMethodField()
    template_language = serializers.SerializerMethodField()
    template_context = serializers.SerializerMethodField()
    resolved_body = serializers.SerializerMethodField()
    queue_status = serializers.SerializerMethodField()

    class Meta(CampaignListSerializer.Meta):
        fields = CampaignListSerializer.Meta.fields + [
            'body_template', 'preview_stats_json',
            'scheduled_at', 'estimated_cost_usd', 'send_options_json', 'analytics',
            'template_name', 'template_language', 'template_context',
            'resolved_body', 'queue_status',
        ]

    def _filter_json(self, obj) -> dict:
        raw = obj.recipient_filter_json
        return raw if isinstance(raw, dict) else {}

    def get_template_name(self, obj) -> str:
        return self._filter_json(obj).get('template_name', '') or ''

    def get_template_language(self, obj) -> str:
        return self._filter_json(obj).get('template_language', '') or ''

    def get_template_context(self, obj) -> dict:
        """Gönderimde kullanılan manuel değişken değerleri ({{mesaj}} vb.)."""
        ctx = self._filter_json(obj).get('template_context')
        if isinstance(ctx, dict) and ctx:
            return ctx
        send_options = obj.send_options_json if isinstance(obj.send_options_json, dict) else {}
        ctx = send_options.get('template_context')
        return ctx if isinstance(ctx, dict) else {}

    def get_resolved_body(self, obj) -> str:
        """
        Alıcıya giden gerçek metin (ilk mesajın çözümlenmiş gövdesi).

        `body_template` ham şablondur ve {{...}} içerir; şablon Meta'da
        numaralıysa ({{1}}) hiçbir şey ifade etmez. Kuyruk üretildiyse ilk
        mesajın gövdesi gönderimin birebir karşılığıdır.
        """
        from apps.communication.domain.enums import MessageDirection
        from apps.communication.domain.models import Message

        body = (
            Message.objects.filter(campaign=obj, direction=MessageDirection.OUTBOUND)
            .exclude(body='')
            .order_by('created_at')
            .values_list('body', flat=True)
            .first()
        )
        if body:
            return body
        return self._resolve_from_template(obj)

    def _resolve_from_template(self, obj) -> str:
        """Kuyruk henüz üretilmediyse şablon gövdesini bilinen değişkenlerle doldur."""
        from apps.communication.application.variable_resolver import resolve_variables

        body = obj.body_template or ''
        template_name = self.get_template_name(obj)
        if not body or body == template_name:
            body = self._meta_template_body(obj, template_name) or body
        ctx = self.get_template_context(obj)
        return resolve_variables(body, ctx) if ctx else body

    def _meta_template_body(self, obj, template_name: str) -> str:
        if not template_name:
            return ''
        from django.db.models import Q

        from apps.communication.domain.models import WhatsAppMetaTemplate

        qs = WhatsAppMetaTemplate.objects.filter(kurum_id=obj.kurum_id, name=template_name)
        language = self.get_template_language(obj)
        if language:
            # tr ↔ tr_TR farkı şablonu kaybettirmesin
            qs = qs.filter(Q(language=language) | Q(language__startswith=language[:2]))
        return qs.exclude(body_named='').values_list('body_named', flat=True).first() or ''

    def get_queue_status(self, obj) -> dict:
        """Kuyrukta bekleyen mesajlar — 'neden hâlâ Bekliyor?' sorusunun cevabı."""
        from django.db.models import Min

        from apps.communication.domain.enums import MessageDirection, MessageStatus
        from apps.communication.domain.models import Message, OutboundQueueItem

        msgs = Message.objects.filter(campaign=obj, direction=MessageDirection.OUTBOUND)
        pending = msgs.filter(status=MessageStatus.PENDING).count()
        sending = msgs.filter(status=MessageStatus.SENDING).count()
        items = OutboundQueueItem.objects.filter(campaign=obj)
        next_attempt = items.aggregate(v=Min('next_attempt_at'))['v']
        last_error = (
            items.exclude(last_error='')
            .order_by('-updated_at')
            .values_list('last_error', flat=True)
            .first()
        )
        return {
            'pending': pending,
            'sending': sending,
            'waiting': pending + sending,
            'queue_items': items.count(),
            'next_attempt_at': next_attempt.isoformat() if next_attempt else None,
            'last_error': last_error or '',
        }

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
