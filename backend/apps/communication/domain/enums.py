"""
İletişim modülü — Domain enum'ları
"""
from django.db import models


class Channel(models.TextChoices):
    WHATSAPP = 'WHATSAPP', 'WhatsApp'
    SMS = 'SMS', 'SMS'
    EMAIL = 'EMAIL', 'E-posta'
    PUSH = 'PUSH', 'Push Bildirim'


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
    OPEN = 'OPEN', 'Açık'
    AWAITING_REPLY = 'AWAITING_REPLY', 'Cevap Bekliyor'
    ARCHIVED = 'ARCHIVED', 'Arşiv'


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
