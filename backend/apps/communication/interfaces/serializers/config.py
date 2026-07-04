from rest_framework import serializers

from apps.communication.application.token_crypto import encrypt_access_token
from apps.communication.domain.models import CommunicationChannelConfig, Conversation, Message, MessageAttachment, MessageReaction


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'id', 'channel', 'phone_number_id', 'waba_id',
            'webhook_verify_token', 'display_phone', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'channel', 'created_at', 'updated_at']


class WhatsAppConfigWriteSerializer(serializers.ModelSerializer):
    access_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'phone_number_id', 'waba_id', 'access_token',
            'webhook_verify_token', 'display_phone', 'is_active',
        ]

    def update(self, instance, validated_data):
        token = validated_data.pop('access_token', None)
        if token:
            instance.access_token_encrypted = encrypt_access_token(token)
        return super().update(instance, validated_data)

    def create(self, validated_data):
        token = validated_data.pop('access_token', None)
        if token:
            validated_data['access_token_encrypted'] = encrypt_access_token(token)
        return super().create(validated_data)


class ConversationListSerializer(serializers.ModelSerializer):
    contact_name = serializers.SerializerMethodField()
    veli_ad = serializers.SerializerMethodField()
    ogrenci_ad = serializers.SerializerMethodField()
    kurum_ad = serializers.SerializerMethodField()
    sube = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'channel', 'contact_phone', 'contact_type', 'contact_name',
            'veli_ad', 'ogrenci_ad', 'kurum_ad', 'sube',
            'status', 'subject', 'last_message_at', 'last_message_preview',
            'unread_count_coach', 'ogrenci_id', 'veli_id', 'assigned_coach_id',
            'created_at',
        ]

    def get_contact_name(self, obj) -> str:
        if obj.veli_id and obj.veli:
            return obj.veli.tam_ad
        if obj.ogrenci_id and obj.ogrenci:
            return f'{obj.ogrenci.ad} {obj.ogrenci.soyad}'.strip()
        return obj.contact_phone

    def get_veli_ad(self, obj) -> str:
        if obj.veli_id and obj.veli:
            return obj.veli.tam_ad
        return ''

    def get_ogrenci_ad(self, obj) -> str:
        if obj.ogrenci_id and obj.ogrenci:
            return f'{obj.ogrenci.ad} {obj.ogrenci.soyad}'.strip()
        return ''

    def get_kurum_ad(self, obj) -> str:
        kurum = getattr(obj, 'kurum', None)
        if kurum:
            return getattr(kurum, 'ad', '') or ''
        return ''

    def get_sube(self, obj) -> str:
        if obj.ogrenci_id and obj.ogrenci:
            sube = getattr(obj.ogrenci, 'sube', None)
            if sube:
                return getattr(sube, 'ad', '') or ''
        return ''


class ConversationDetailSerializer(ConversationListSerializer):
    messages = serializers.SerializerMethodField()

    class Meta(ConversationListSerializer.Meta):
        fields = ConversationListSerializer.Meta.fields + ['messages']

    def get_messages(self, obj):
        msgs = obj.messages.all().prefetch_related('attachments').order_by('created_at')[:50]
        return MessageSerializer(msgs, many=True).data


class MessageAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = ['id', 'original_name', 'mime_type', 'file_size', 'file_url']

    def get_file_url(self, obj) -> str:
        if not obj.file:
            return ''
        url = obj.file.url
        if url.startswith('http'):
            return url
        if not url.startswith('/'):
            return f'/media/{url.lstrip("/")}'
        return url


class MessageReactionSerializer(serializers.ModelSerializer):
    reacted_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageReaction
        fields = ['id', 'emoji', 'reacted_by', 'reacted_by_name', 'created_at']

    def get_reacted_by_name(self, obj) -> str:
        if obj.reacted_by:
            return obj.reacted_by.get_full_name() or obj.reacted_by.username
        return 'Karşı taraf'


class MessageReplyPreviewSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'direction', 'message_type', 'body', 'created_at', 'attachments']


class MessageSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    reactions = MessageReactionSerializer(many=True, read_only=True)
    reply_to = MessageReplyPreviewSerializer(read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'direction', 'message_type', 'body', 'status',
            'provider_message_id', 'sender_user_id', 'source_module',
            'source_ref_id', 'failed_reason', 'sent_at', 'delivered_at',
            'read_at', 'created_at', 'attachments', 'reactions', 'reply_to',
        ]


class MessageCreateSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True, default='')
    message_type = serializers.CharField(required=False, default='TEXT')
    attachment_id = serializers.UUIDField(required=False, allow_null=True)
    reply_to_message_id = serializers.UUIDField(required=False, allow_null=True)


class CampaignPreviewRequestSerializer(serializers.Serializer):
    recipient_filter = serializers.JSONField(required=False, default=dict)
    body = serializers.CharField(required=False, allow_blank=True)
    kurum_id = serializers.IntegerField(required=False)
    attachment_count = serializers.IntegerField(required=False, default=0, min_value=0)
    ai_used = serializers.BooleanField(required=False, default=False)


class CampaignPreviewResponseSerializer(serializers.Serializer):
    total_recipients = serializers.IntegerField()
    ogrenci_count = serializers.IntegerField()
    veli_count = serializers.IntegerField()
    estimated_messages = serializers.IntegerField()
    invalid_phones = serializers.IntegerField()
    attachment_count = serializers.IntegerField(required=False, default=0)
    estimated_cost_usd = serializers.CharField(required=False, allow_blank=True)
    ai_used = serializers.BooleanField(required=False, default=False)
    note = serializers.CharField(required=False, allow_blank=True)
