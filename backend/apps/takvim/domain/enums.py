"""
Takvim modülü — Enum tanımları
"""
from django.db import models


class EventCategory(models.TextChoices):
    """Ana etkinlik kategorileri"""
    DENEME = 'DENEME', 'Deneme Sınavı'
    ETUT = 'ETUT', 'Etüt'
    GORUSME = 'GORUSME', 'Koç Görüşmesi'
    DERS = 'DERS', 'Ders'
    TOPLANTI = 'TOPLANTI', 'Toplantı'
    ETKINLIK = 'ETKINLIK', 'Kurum Etkinliği'
    TATIL = 'TATIL', 'Tatil / İzin'
    ODEV = 'ODEV', 'Ödev'
    CALISMA = 'CALISMA', 'Çalışma Programı'
    GOREV = 'GOREV', 'Görev'
    DIGER = 'DIGER', 'Diğer'


class EventStatus(models.TextChoices):
    """Etkinlik durumu"""
    DRAFT = 'DRAFT', 'Taslak'
    SCHEDULED = 'SCHEDULED', 'Planlandı'
    IN_PROGRESS = 'IN_PROGRESS', 'Devam Ediyor'
    COMPLETED = 'COMPLETED', 'Tamamlandı'
    CANCELLED = 'CANCELLED', 'İptal Edildi'


class RecurrenceType(models.TextChoices):
    """Tekrarlama tipi"""
    NONE = 'NONE', 'Tekrar Yok'
    DAILY = 'DAILY', 'Her Gün'
    WEEKLY = 'WEEKLY', 'Her Hafta'
    BIWEEKLY = 'BIWEEKLY', 'İki Haftada Bir'
    MONTHLY = 'MONTHLY', 'Her Ay'


class ReminderUnit(models.TextChoices):
    """Hatırlatma zaman birimi"""
    MINUTES = 'MINUTES', 'Dakika'
    HOURS = 'HOURS', 'Saat'
    DAYS = 'DAYS', 'Gün'


class ReminderStatus(models.TextChoices):
    """Hatırlatma durumu"""
    PENDING = 'PENDING', 'Bekliyor'
    SENT = 'SENT', 'Gönderildi'
    FAILED = 'FAILED', 'Başarısız'


class NotificationChannel(models.TextChoices):
    """Bildirim kanalları"""
    APP = 'APP', 'Uygulama Bildirimi'
    SMS = 'SMS', 'SMS'
    EMAIL = 'EMAIL', 'E-posta'
    WHATSAPP = 'WHATSAPP', 'WhatsApp'


class NotificationStatus(models.TextChoices):
    """Bildirim gönderim durumu"""
    PENDING = 'PENDING', 'Bekliyor'
    SENT = 'SENT', 'Gönderildi'
    DELIVERED = 'DELIVERED', 'İletildi'
    READ = 'READ', 'Okundu'
    FAILED = 'FAILED', 'Başarısız'


class RecipientType(models.TextChoices):
    """Bildirim alıcı tipi"""
    OGRENCI = 'OGRENCI', 'Öğrenci'
    OGRETMEN = 'OGRETMEN', 'Öğretmen / Koç'
    VELI = 'VELI', 'Veli'
    PERSONEL = 'PERSONEL', 'Personel'
