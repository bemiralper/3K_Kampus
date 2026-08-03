"""
İletişim modülü — Domain enum'ları
"""
from django.db import models


class Channel(models.TextChoices):
    WHATSAPP = 'WHATSAPP', 'WhatsApp'
    SMS = 'SMS', 'SMS'
    EMAIL = 'EMAIL', 'E-posta'
    PUSH = 'PUSH', 'Push Bildirim'


class WhatsAppAccountScope(models.TextChoices):
    ALL_SUBES = 'ALL_SUBES', 'Tüm şubeler'
    SELECTED_SUBES = 'SELECTED_SUBES', 'Seçili şubeler'


class MessageType(models.TextChoices):
    TEXT = 'TEXT', 'Metin'
    IMAGE = 'IMAGE', 'Görsel'
    DOCUMENT = 'DOCUMENT', 'Belge'
    AUDIO = 'AUDIO', 'Ses'
    VIDEO = 'VIDEO', 'Video'
    LOCATION = 'LOCATION', 'Konum'
    LINK = 'LINK', 'Link'
    TEMPLATE = 'TEMPLATE', 'Şablon'


class MessageDirection(models.TextChoices):
    OUTBOUND = 'OUTBOUND', 'Giden'
    INBOUND = 'INBOUND', 'Gelen'


class MessageStatus(models.TextChoices):
    PENDING = 'PENDING', 'Bekliyor'
    SENDING = 'SENDING', 'Gönderiliyor'
    SENT = 'SENT', 'Gönderildi'
    DELIVERED = 'DELIVERED', 'İletildi'
    READ = 'READ', 'Okundu'
    FAILED = 'FAILED', 'Başarısız'
    CANCELLED = 'CANCELLED', 'İptal'


class RecipientType(models.TextChoices):
    OGRENCI = 'OGRENCI', 'Öğrenci'
    VELI = 'VELI', 'Veli'
    PERSONEL = 'PERSONEL', 'Personel'
    RAW_PHONE = 'RAW_PHONE', 'Ham Telefon'


class ConversationStatus(models.TextChoices):
    # Legacy (geriye uyumlu)
    OPEN = 'OPEN', 'Açık'
    AWAITING_REPLY = 'AWAITING_REPLY', 'Cevap Bekliyor'
    ARCHIVED = 'ARCHIVED', 'Arşiv'
    # Ticket / routing
    NEW = 'NEW', 'Yeni'
    READ = 'READ', 'Okundu'
    REPLIED = 'REPLIED', 'Yanıtlandı'
    WAITING = 'WAITING', 'Bekliyor'
    NEEDS_SUPPORT = 'NEEDS_SUPPORT', 'Destek Gerekiyor'
    CLOSED = 'CLOSED', 'Kapalı'


class CommunicationDepartment(models.TextChoices):
    COACHING = 'COACHING', 'Koçluk'
    ACCOUNTING = 'ACCOUNTING', 'Muhasebe'
    SECRETARIAT = 'SECRETARIAT', 'Sekreterya'
    GUIDANCE = 'GUIDANCE', 'Rehberlik'
    ADMISSIONS = 'ADMISSIONS', 'Kayıt Ofisi'
    MANAGEMENT = 'MANAGEMENT', 'Yönetim'


class ConversationEventType(models.TextChoices):
    MESSAGE_IN = 'MESSAGE_IN', 'Gelen mesaj'
    MESSAGE_OUT = 'MESSAGE_OUT', 'Giden mesaj'
    CLAIMED = 'CLAIMED', 'Üstlenildi'
    RELEASED = 'RELEASED', 'Bırakıldı'
    TRANSFERRED = 'TRANSFERRED', 'Devredildi'
    STATUS_CHANGED = 'STATUS_CHANGED', 'Durum değişti'
    SLA_BREACH = 'SLA_BREACH', 'SLA ihlali'
    ASSIGNED_COACH_SYNC = 'ASSIGNED_COACH_SYNC', 'Koç senkron'
    NOTE_ADDED = 'NOTE_ADDED', 'İç not'
    TAG_CHANGED = 'TAG_CHANGED', 'Etiket değişti'
    ARCHIVED = 'ARCHIVED', 'Arşivlendi'
    UNARCHIVED = 'UNARCHIVED', 'Arşivden çıkarıldı'


class CampaignStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Taslak'
    CONFIRMED = 'CONFIRMED', 'Onaylandı'
    QUEUED = 'QUEUED', 'Kuyrukta'
    PROCESSING = 'PROCESSING', 'İşleniyor'
    COMPLETED = 'COMPLETED', 'Tamamlandı'
    PARTIAL = 'PARTIAL', 'Kısmi'
    CANCELLED = 'CANCELLED', 'İptal'


class LogDirection(models.TextChoices):
    INBOUND = 'INBOUND', 'Gelen'
    OUTBOUND = 'OUTBOUND', 'Giden'


class WebhookProcessingStatus(models.TextChoices):
    PENDING = 'PENDING', 'Bekliyor'
    PROCESSED = 'PROCESSED', 'İşlendi'
    FAILED = 'FAILED', 'Başarısız'
    SKIPPED = 'SKIPPED', 'Atlandı'


class TemplateCategory(models.TextChoices):
    DENEME_SONUCU = 'deneme_sonucu', 'Deneme Sonucu'
    HAFTALIK_ODEV = 'haftalik_odev', 'Haftalık Ödev'
    DEVAMSIZLIK = 'devamsizlik', 'Devamsızlık'
    YOKLAMA_GELMEDI = 'yoklama_gelmedi', 'Yoklama — Gelmedi'
    YOKLAMA_GEC = 'yoklama_gec', 'Yoklama — Geç Kalma'
    YOKLAMA_CIKIS = 'yoklama_cikis', 'Yoklama — Çıkış'
    TEBRIK = 'tebrik', 'Tebrik'
    ODEME = 'odeme', 'Ödeme'
    ODEME_GECIKME = 'odeme_gecikme', 'Ödeme Gecikme'
    KARNE = 'karne', 'Karne'
    DUYURU = 'duyuru', 'Duyuru'
    OZEL = 'ozel', 'Özel'


class TemplateAudienceScope(models.TextChoices):
    """Hazır yanıt şablonlarının hangi rol kitlesine ait olduğu."""
    GENEL = 'genel', 'Genel (tüm roller)'
    ADMIN = 'admin', 'Admin / İletişim'
    COACH = 'coach', 'Koç'
    MUHASEBE = 'muhasebe', 'Muhasebe'


class MetaTemplateCategory(models.TextChoices):
    UTILITY = 'UTILITY', 'Utility'
    MARKETING = 'MARKETING', 'Marketing'
    AUTHENTICATION = 'AUTHENTICATION', 'Authentication'


class NotificationSendMode(models.TextChoices):
    """Bir bildirim olayı için gönderim davranışı."""
    AUTO = 'AUTO', 'Otomatik (24 saat kuralına göre seç)'
    META_ONLY = 'META_ONLY', 'Her zaman Meta şablonu'
    FREEFORM_ONLY = 'FREEFORM_ONLY', 'Yalnızca serbest mesaj'
    DISABLED = 'DISABLED', 'Kapalı (gönderme)'


class MetaTemplateUsage(models.TextChoices):
    """Meta şablonunun hangi ekranlarda seçilebileceği."""
    ALL = 'ALL', 'Her yerde'
    SYSTEM = 'SYSTEM', 'Otomatik bildirimler'
    PERSONAL = 'PERSONAL', 'Sohbet — kişisel mesaj'
    CAMPAIGN = 'CAMPAIGN', 'Toplu duyuru'


class MetaTemplateStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Taslak'
    SUBMITTED = 'SUBMITTED', 'Meta\'ya Gönderildi'
    PENDING = 'PENDING', 'İnceleniyor'
    APPROVED = 'APPROVED', 'Onaylandı'
    REJECTED = 'REJECTED', 'Reddedildi'
    PAUSED = 'PAUSED', 'Duraklatıldı'
    DISABLED = 'DISABLED', 'Devre Dışı'
