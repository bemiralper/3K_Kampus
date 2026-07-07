"""
İletişim modülü — Domain modelleri
"""
import uuid

from django.conf import settings
from django.db import models

from .enums import (
    CampaignStatus,
    Channel,
    ConversationStatus,
    LogDirection,
    MessageDirection,
    MessageStatus,
    MessageType,
    RecipientType,
    TemplateCategory,
    TemplateAudienceScope,
    WebhookProcessingStatus,
)


class CommunicationChannelConfig(models.Model):
    """Kurum bazlı kanal yapılandırması (WhatsApp WABA)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='communication_channel_configs',
        verbose_name='Kurum',
    )
    channel = models.CharField(
        max_length=20,
        choices=Channel.choices,
        default=Channel.WHATSAPP,
        verbose_name='Kanal',
    )
    phone_number_id = models.CharField(max_length=64, blank=True, default='', verbose_name='Phone Number ID')
    waba_id = models.CharField(max_length=64, blank=True, default='', verbose_name='WABA ID')
    access_token_encrypted = models.TextField(blank=True, default='', verbose_name='Access Token (encrypted)')
    webhook_verify_token = models.CharField(max_length=128, blank=True, default='', verbose_name='Webhook Verify Token')
    display_phone = models.CharField(max_length=32, blank=True, default='', verbose_name='Görünen Numara')
    is_active = models.BooleanField(default=False, verbose_name='Aktif')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_channel_config'
        verbose_name = 'Kanal Yapılandırması'
        verbose_name_plural = 'Kanal Yapılandırmaları'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'channel'],
                name='unique_comm_channel_per_kurum',
            ),
        ]

    def __str__(self):
        return f'{self.kurum_id} — {self.get_channel_display()}'


class ContactIdentity(models.Model):
    """Tekilleştirilmiş telefon kimliği — öğrenci/veli/personel eşlemesi."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='contact_identities',
        verbose_name='Kurum',
    )
    e164 = models.CharField(max_length=20, verbose_name='E.164 Telefon')
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contact_identities',
    )
    veli = models.ForeignKey(
        'ogrenci.OgrenciVeli',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contact_identities',
    )
    personel = models.ForeignKey(
        'personel.Personel',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contact_identities',
    )
    kisi = models.ForeignKey(
        'kimlik.Kisi',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contact_identities',
        verbose_name='Merkezi Kişi',
    )
    is_primary = models.BooleanField(default=True, verbose_name='Birincil')
    verified_at = models.DateTimeField(null=True, blank=True, verbose_name='Doğrulama Zamanı')
    label = models.CharField(max_length=120, blank=True, default='', verbose_name='Etiket')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_contact_identity'
        verbose_name = 'İletişim Kimliği'
        verbose_name_plural = 'İletişim Kimlikleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'e164'],
                name='unique_contact_e164_per_kurum',
            ),
        ]

    def __str__(self):
        return f'{self.e164} ({self.kurum_id})'


# Alias — plan dokümantasyonu uyumu
PhoneIdentity = ContactIdentity


class Conversation(models.Model):
    """Konuşma thread'i."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='conversations',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='conversations',
        verbose_name='Şube',
    )
    channel = models.CharField(
        max_length=20,
        choices=Channel.choices,
        default=Channel.WHATSAPP,
        verbose_name='Kanal',
    )
    contact_phone = models.CharField(max_length=20, verbose_name='İletişim Telefonu')
    contact_type = models.CharField(
        max_length=20,
        choices=RecipientType.choices,
        default=RecipientType.RAW_PHONE,
        verbose_name='Alıcı Tipi',
    )
    contact_identity = models.ForeignKey(
        ContactIdentity,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='conversations',
    )
    ogrenci = models.ForeignKey(
        'ogrenci.Ogrenci',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='conversations',
    )
    veli = models.ForeignKey(
        'ogrenci.OgrenciVeli',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='conversations',
    )
    assigned_coach = models.ForeignKey(
        'coaching.CoachProfile',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_conversations',
        verbose_name='Atanan Koç',
    )
    status = models.CharField(
        max_length=20,
        choices=ConversationStatus.choices,
        default=ConversationStatus.OPEN,
        verbose_name='Durum',
    )
    subject = models.CharField(max_length=255, blank=True, default='', verbose_name='Konu')
    last_message_at = models.DateTimeField(null=True, blank=True, verbose_name='Son Mesaj')
    last_message_preview = models.CharField(max_length=255, blank=True, default='')
    unread_count_coach = models.PositiveIntegerField(default=0, verbose_name='Koç Okunmamış')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_conversation'
        verbose_name = 'Konuşma'
        verbose_name_plural = 'Konuşmalar'
        ordering = ['-last_message_at', '-created_at']
        indexes = [
            models.Index(fields=['kurum', 'status']),
            models.Index(fields=['kurum', 'assigned_coach']),
            models.Index(fields=['kurum', 'sube'], name='comm_conv_kurum_sube_idx'),
        ]

    def __str__(self):
        return f'{self.contact_phone} — {self.get_status_display()}'


class MessageTemplateCategory(models.Model):
    """Kurum bazlı özelleştirilebilir şablon kategorileri."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='message_template_categories',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='message_template_categories',
        verbose_name='Şube',
    )
    slug = models.CharField(max_length=32, verbose_name='Slug')
    label = models.CharField(max_length=64, verbose_name='Etiket')
    audience_scope = models.CharField(
        max_length=32,
        choices=TemplateAudienceScope.choices,
        default=TemplateAudienceScope.GENEL,
        verbose_name='Hedef kitle',
        db_index=True,
    )
    sort_order = models.PositiveSmallIntegerField(default=0, verbose_name='Sıra')
    is_active = models.BooleanField(default=True, verbose_name='Aktif')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_message_template_category'
        verbose_name = 'Şablon Kategorisi'
        verbose_name_plural = 'Şablon Kategorileri'
        ordering = ['sort_order', 'label']
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'slug'],
                name='comm_template_category_sube_slug_uniq',
            ),
        ]

    def __str__(self):
        return self.label


class MessageTemplate(models.Model):
    """Kurum mesaj şablonu — toplu gönderim stüdyosu."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='message_templates',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='message_templates',
        verbose_name='Şube',
    )
    category = models.CharField(
        max_length=32,
        default=TemplateCategory.OZEL,
        verbose_name='Kategori',
        db_index=True,
    )
    audience_scope = models.CharField(
        max_length=32,
        choices=TemplateAudienceScope.choices,
        default=TemplateAudienceScope.GENEL,
        verbose_name='Hedef kitle',
        db_index=True,
    )
    name = models.CharField(max_length=200, verbose_name='Şablon Adı')
    body = models.TextField(blank=True, default='', verbose_name='Mesaj Metni')
    variables_json = models.JSONField(default=list, blank=True, verbose_name='Değişkenler')
    attachment_ids_json = models.JSONField(default=list, blank=True, verbose_name='Ek ID Listesi')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='message_templates',
    )
    is_active = models.BooleanField(default=True, verbose_name='Aktif')
    usage_count = models.PositiveIntegerField(default=0, verbose_name='Kullanım Sayısı')
    stats_sent = models.PositiveIntegerField(default=0)
    stats_read = models.PositiveIntegerField(default=0)
    stats_failed = models.PositiveIntegerField(default=0)
    avg_read_seconds = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_message_template'
        verbose_name = 'Mesaj Şablonu'
        verbose_name_plural = 'Mesaj Şablonları'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['kurum', 'sube'], name='comm_tpl_kurum_sube_idx'),
        ]

    def __str__(self):
        return self.name


class CampaignAttachment(models.Model):
    """Kampanya öncesi yüklenen ek dosya."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='campaign_attachments',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='campaign_attachments',
        verbose_name='Şube',
    )
    file = models.FileField(upload_to='communication/campaign_attachments/%Y/%m/', blank=True)
    mime_type = models.CharField(max_length=128, blank=True, default='')
    original_name = models.CharField(max_length=255, blank=True, default='')
    file_size = models.PositiveIntegerField(default=0)
    provider_media_id = models.CharField(
        max_length=128, blank=True, default='', verbose_name='Meta Media ID',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='campaign_attachments',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'comm_campaign_attachment'
        verbose_name = 'Kampanya Eki'
        verbose_name_plural = 'Kampanya Ekleri'
        indexes = [
            models.Index(fields=['kurum', 'sube'], name='comm_att_kurum_sube_idx'),
        ]

    def __str__(self):
        return self.original_name or str(self.id)


class OutboundCampaign(models.Model):
    """Toplu gönderim kampanyası."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='outbound_campaigns',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='outbound_campaigns',
        verbose_name='Şube',
    )
    channel = models.CharField(
        max_length=20,
        choices=Channel.choices,
        default=Channel.WHATSAPP,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='communication_campaigns',
    )
    title = models.CharField(max_length=200, blank=True, default='')
    body_template = models.TextField(blank=True, default='')
    template = models.ForeignKey(
        MessageTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='campaigns',
        verbose_name='Mesaj Şablonu',
    )
    status = models.CharField(
        max_length=20,
        choices=CampaignStatus.choices,
        default=CampaignStatus.DRAFT,
    )
    recipient_filter_json = models.JSONField(default=dict, blank=True)
    preview_stats_json = models.JSONField(default=dict, blank=True)
    send_options_json = models.JSONField(default=dict, blank=True)
    repeat_rule_json = models.JSONField(default=dict, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name='Zamanlanmış Gönderim')
    estimated_cost_usd = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        default=0,
        verbose_name='Tahmini Maliyet (USD)',
    )
    total_recipients = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    delivered_count = models.PositiveIntegerField(default=0)
    read_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    attachments = models.ManyToManyField(
        CampaignAttachment,
        blank=True,
        related_name='campaigns',
        verbose_name='Ekler',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_outbound_campaign'
        verbose_name = 'Giden Kampanya'
        verbose_name_plural = 'Giden Kampanyalar'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['kurum', 'sube'], name='comm_camp_kurum_sube_idx'),
        ]

    def __str__(self):
        return self.title or str(self.id)


class Message(models.Model):
    """Tek mesaj kaydı."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    campaign = models.ForeignKey(
        OutboundCampaign,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='messages',
    )
    direction = models.CharField(max_length=10, choices=MessageDirection.choices)
    message_type = models.CharField(
        max_length=20,
        choices=MessageType.choices,
        default=MessageType.TEXT,
    )
    body = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=MessageStatus.choices,
        default=MessageStatus.PENDING,
    )
    provider_message_id = models.CharField(max_length=128, blank=True, default='', db_index=True)
    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='sent_communication_messages',
    )
    source_module = models.CharField(max_length=50, blank=True, default='')
    source_ref_id = models.CharField(max_length=64, blank=True, default='')
    failed_reason = models.TextField(blank=True, default='')
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    reply_to = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='replies',
        verbose_name='Yanıtlanan mesaj',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_message'
        verbose_name = 'Mesaj'
        verbose_name_plural = 'Mesajlar'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.direction} — {self.status}'


class MessageReaction(models.Model):
    """Mesaja emoji reaksiyonu."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    emoji = models.CharField(max_length=16, verbose_name='Emoji')
    reacted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='message_reactions',
    )
    provider_message_id = models.CharField(max_length=128, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_message_reaction'
        verbose_name = 'Mesaj Reaksiyonu'
        verbose_name_plural = 'Mesaj Reaksiyonları'
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'reacted_by'],
                name='comm_message_reaction_user_uniq',
            ),
        ]

    def __str__(self):
        return f'{self.emoji} on {self.message_id}'


class MessageStatusEvent(models.Model):
    """Mesaj durum geçmişi — webhook idempotency."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='status_events',
    )
    status = models.CharField(max_length=20, choices=MessageStatus.choices)
    provider_event_id = models.CharField(max_length=128, blank=True, default='')
    occurred_at = models.DateTimeField(verbose_name='Olay Zamanı')
    raw_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'comm_message_status_event'
        verbose_name = 'Mesaj Durum Olayı'
        verbose_name_plural = 'Mesaj Durum Olayları'
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'status', 'provider_event_id'],
                name='unique_message_status_event',
            ),
        ]

    def __str__(self):
        return f'{self.message_id} → {self.status}'


class MessageAttachment(models.Model):
    """Mesaj eki."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='attachments',
    )
    file = models.FileField(upload_to='communication/attachments/%Y/%m/', blank=True)
    mime_type = models.CharField(max_length=128, blank=True, default='')
    original_name = models.CharField(max_length=255, blank=True, default='')
    file_size = models.PositiveIntegerField(default=0)
    provider_media_id = models.CharField(max_length=128, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'comm_message_attachment'
        verbose_name = 'Mesaj Eki'
        verbose_name_plural = 'Mesaj Ekleri'

    def __str__(self):
        return self.original_name or str(self.id)


class OutboundQueueItem(models.Model):
    """Giden mesaj kuyruk kaydı."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='communication_queue_items',
    )
    campaign = models.ForeignKey(
        OutboundCampaign,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='queue_items',
    )
    message = models.OneToOneField(
        Message,
        on_delete=models.CASCADE,
        related_name='queue_item',
    )
    priority = models.PositiveSmallIntegerField(default=100)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    next_attempt_at = models.DateTimeField(verbose_name='Sonraki Deneme')
    locked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'comm_outbound_queue_item'
        verbose_name = 'Giden Kuyruk Kaydı'
        verbose_name_plural = 'Giden Kuyruk Kayıtları'
        ordering = ['priority', 'next_attempt_at']
        indexes = [
            models.Index(fields=['next_attempt_at', 'locked_at']),
        ]

    def __str__(self):
        return f'Queue {self.message_id} (attempt {self.attempt_count})'


class CommunicationLog(models.Model):
    """API / webhook audit log."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='communication_logs',
    )
    direction = models.CharField(max_length=10, choices=LogDirection.choices)
    endpoint = models.CharField(max_length=255, blank=True, default='')
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    request_body = models.TextField(blank=True, default='')
    response_body = models.TextField(blank=True, default='')
    error = models.TextField(blank=True, default='')
    duration_ms = models.PositiveIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'comm_log'
        verbose_name = 'İletişim Logu'
        verbose_name_plural = 'İletişim Logları'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.direction} {self.endpoint} ({self.http_status})'


class RawWebhookEvent(models.Model):
    """Ham Meta webhook payload — debug ve replay."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='raw_webhook_events',
    )
    phone_number_id = models.CharField(max_length=64, blank=True, default='')
    event_type = models.CharField(max_length=64, blank=True, default='')
    provider_message_id = models.CharField(max_length=128, blank=True, default='', db_index=True)
    payload = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    processing_status = models.CharField(
        max_length=20,
        choices=WebhookProcessingStatus.choices,
        default=WebhookProcessingStatus.PENDING,
    )
    processing_error = models.TextField(blank=True, default='')
    processed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'comm_raw_webhook_event'
        verbose_name = 'Ham Webhook Olayı'
        verbose_name_plural = 'Ham Webhook Olayları'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.event_type} — {self.processing_status}'
