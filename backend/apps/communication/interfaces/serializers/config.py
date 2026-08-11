from rest_framework import serializers

from apps.communication.application.conversation_display import (
    resolve_conversation_display_name,
)
from apps.communication.application.token_crypto import encrypt_access_token
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    Conversation,
    ConversationNote,
    ConversationTag,
    Message,
    MessageAttachment,
    MessageReaction,
)


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'id', 'channel', 'name', 'phone_number_id', 'waba_id', 'app_id',
            'webhook_verify_token', 'display_phone', 'is_active',
            'is_default', 'scope_type', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'channel', 'created_at', 'updated_at']


class WhatsAppConfigWriteSerializer(serializers.ModelSerializer):
    access_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'name', 'phone_number_id', 'waba_id', 'app_id', 'access_token',
            'webhook_verify_token', 'display_phone', 'is_active',
            'is_default', 'scope_type',
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


class WhatsAppAccountSerializer(serializers.ModelSerializer):
    role_ids = serializers.SerializerMethodField()
    sube_ids = serializers.SerializerMethodField()
    role_names = serializers.SerializerMethodField()
    sube_names = serializers.SerializerMethodField()

    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'id', 'channel', 'name', 'phone_number_id', 'waba_id', 'app_id',
            'webhook_verify_token', 'display_phone', 'is_active', 'is_default',
            'scope_type', 'department', 'quota_json', 'last_synced_at',
            'role_ids', 'sube_ids', 'role_names', 'sube_names',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_role_ids(self, obj):
        return list(obj.allowed_roles.values_list('id', flat=True))

    def get_sube_ids(self, obj):
        return list(obj.allowed_subes.values_list('id', flat=True))

    def get_role_names(self, obj):
        return list(obj.allowed_roles.values_list('name', flat=True))

    def get_sube_names(self, obj):
        return list(obj.allowed_subes.values_list('ad', flat=True))


class WhatsAppAccountWriteSerializer(serializers.ModelSerializer):
    access_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    app_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )
    sube_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = CommunicationChannelConfig
        fields = [
            'name', 'phone_number_id', 'waba_id', 'app_id', 'access_token', 'app_secret',
            'webhook_verify_token', 'display_phone', 'is_active', 'is_default',
            'scope_type', 'department', 'quota_json', 'role_ids', 'sube_ids',
        ]


class ConversationListSerializer(serializers.ModelSerializer):
    contact_name = serializers.SerializerMethodField()
    veli_ad = serializers.SerializerMethodField()
    ogrenci_ad = serializers.SerializerMethodField()
    ogrenci_adlari = serializers.SerializerMethodField()
    kurum_ad = serializers.SerializerMethodField()
    sube = serializers.SerializerMethodField()

    channel_config_id = serializers.UUIDField(read_only=True, allow_null=True)
    channel_config_name = serializers.SerializerMethodField()
    assigned_coach_name = serializers.SerializerMethodField()
    claimed_by_name = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    sla = serializers.SerializerMethodField()
    session = serializers.SerializerMethodField()
    can_claim = serializers.SerializerMethodField()
    profil_foto = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'channel', 'channel_config_id', 'channel_config_name',
            'contact_phone', 'contact_type', 'contact_name',
            'veli_ad', 'ogrenci_ad', 'ogrenci_adlari', 'kurum_ad', 'sube', 'profil_foto',
            'status', 'subject', 'department',
            'last_message_at', 'last_message_preview',
            'unread_count_coach', 'ogrenci_id', 'veli_id',
            'assigned_coach_id', 'assigned_coach_name',
            'claimed_by_user_id', 'claimed_by_name', 'claim_version',
            'first_unanswered_at', 'last_customer_message_at', 'last_reply_at',
            'needs_support_at', 'archived_at',
            'tags', 'sla', 'session', 'can_claim',
            'created_at',
        ]

    def get_channel_config_name(self, obj) -> str:
        cfg = getattr(obj, 'channel_config', None)
        if cfg:
            return cfg.name or cfg.display_phone or ''
        return ''

    def get_contact_name(self, obj) -> str:
        # Request-scoped cache: canlı telefon eşlemesi (kayıtsız numaralar için)
        # sohbet listesinde satır başına değil, kurum başına tek seferlik
        # oluşturulur — bkz. ContactResolver.build_kurum_lookup_maps.
        cache = self.context.setdefault('_contact_lookup_cache', {})
        return resolve_conversation_display_name(obj, allow_live_lookup=True, lookup_cache=cache)

    def get_assigned_coach_name(self, obj) -> str:
        coach = getattr(obj, 'assigned_coach', None)
        if not coach:
            return ''
        teacher = getattr(coach, 'teacher', None)
        if teacher:
            return f'{teacher.ad} {teacher.soyad}'.strip()
        return str(coach.id)

    def get_claimed_by_name(self, obj) -> str:
        u = getattr(obj, 'claimed_by_user', None)
        if not u:
            return ''
        full = (getattr(u, 'get_full_name', lambda: '')() or '').strip()
        return full or getattr(u, 'username', '') or str(u.id)

    def get_tags(self, obj) -> list:
        try:
            return [
                {'id': str(t.id), 'slug': t.slug, 'name': t.name, 'color': t.color}
                for t in obj.tags.all()
            ]
        except Exception:
            return []

    def get_sla(self, obj) -> dict:
        from django.utils import timezone
        now = timezone.now()
        first = obj.first_unanswered_at
        last_cust = obj.last_customer_message_at
        waiting_sec = None
        if first:
            waiting_sec = max(0, int((now - first).total_seconds()))
        elif last_cust and obj.status not in ('REPLIED', 'ARCHIVED', 'CLOSED'):
            waiting_sec = max(0, int((now - last_cust).total_seconds()))
        return {
            'first_unanswered_at': first.isoformat() if first else None,
            'last_customer_message_at': last_cust.isoformat() if last_cust else None,
            'last_reply_at': obj.last_reply_at.isoformat() if obj.last_reply_at else None,
            'waiting_seconds': waiting_sec,
            'breached': obj.status == 'NEEDS_SUPPORT' or bool(obj.needs_support_at),
        }

    def get_session(self, obj) -> dict:
        """24 saatlik serbest mesaj penceresi — sohbet ekranındaki rozet."""
        from apps.communication.application.session_window import window_for_conversation

        return window_for_conversation(obj).as_dict()

    def get_can_claim(self, obj) -> bool:
        request = self.context.get('request')
        if not request or not getattr(request, 'user', None):
            return False
        user = request.user
        if obj.claimed_by_user_id and obj.claimed_by_user_id != user.id:
            return False
        if obj.status == 'ARCHIVED':
            return False
        # Kuyruk veya destek veya henüz claim yok
        return not obj.claimed_by_user_id

    def get_profil_foto(self, obj) -> str | None:
        if obj.ogrenci_id and obj.ogrenci:
            foto = getattr(obj.ogrenci, 'profil_foto', None)
            if foto and hasattr(foto, 'url'):
                try:
                    return foto.url
                except Exception:
                    return None
            if isinstance(foto, str) and foto:
                return foto
        return None

    def get_veli_ad(self, obj) -> str:
        if obj.veli_id and obj.veli:
            return obj.veli.tam_ad
        return ''

    def get_ogrenci_adlari(self, obj) -> list:
        from apps.communication.application.conversation_display import (
            linked_student_names_for_conversation,
        )
        return linked_student_names_for_conversation(obj)

    def get_ogrenci_ad(self, obj) -> str:
        names = self.get_ogrenci_adlari(obj)
        if names:
            return ', '.join(names)
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
    personel_count = serializers.IntegerField(required=False, default=0)
    estimated_messages = serializers.IntegerField()
    invalid_phones = serializers.IntegerField()
    attachment_count = serializers.IntegerField(required=False, default=0)
    estimated_cost_usd = serializers.CharField(required=False, allow_blank=True)
    ai_used = serializers.BooleanField(required=False, default=False)
    note = serializers.CharField(required=False, allow_blank=True)
