"""
Takvim modülü — Domain modelleri

Tek Event modeli üzerinden tüm etkinlik türleri yönetilir.
Etkinlik türleri EventType ile tanımlanır, her etkinlik bir event_type'a bağlıdır.
"""
import uuid
from django.db import models
from django.utils import timezone

from .enums import (
    EventCategory, EventStatus, RecurrenceType,
    ReminderUnit, ReminderStatus,
    NotificationChannel, NotificationStatus, RecipientType,
)


# ══════════════════════════════════════════════════════════
# ETKİNLİK TÜRÜ
# ══════════════════════════════════════════════════════════

class EventType(models.Model):
    """
    Etkinlik türü tanımı.
    Kurum bazlı — her kurum kendi türlerini tanımlayabilir.
    Varsayılan türler (is_system=True) seed ile oluşturulur.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    ad = models.CharField(max_length=100, verbose_name='Tür Adı')
    kategori = models.CharField(
        max_length=20,
        choices=EventCategory.choices,
        default=EventCategory.DIGER,
        verbose_name='Kategori',
    )
    renk = models.CharField(max_length=7, default='#3B82F6', verbose_name='Renk Kodu')
    ikon = models.CharField(max_length=10, default='📅', verbose_name='İkon')

    varsayilan_sure_dk = models.PositiveIntegerField(
        default=60, verbose_name='Varsayılan Süre (dk)'
    )
    is_system = models.BooleanField(default=False, verbose_name='Sistem Türü')
    is_active = models.BooleanField(default=True, verbose_name='Aktif')
    varsayilan_mi = models.BooleanField(default=False, verbose_name='Varsayılan Tür')

    sira = models.PositiveIntegerField(default=0, verbose_name='Sıralama')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'takvim_etkinlik_turu'
        ordering = ['sira', 'ad']
        verbose_name = 'Etkinlik Türü'
        verbose_name_plural = 'Etkinlik Türleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum_id', 'ad'],
                condition=models.Q(is_deleted=False),
                name='unique_event_type_per_kurum',
            )
        ]

    def __str__(self):
        return f"{self.ikon} {self.ad}"


# ══════════════════════════════════════════════════════════
# ETKİNLİK (EVENT)
# ══════════════════════════════════════════════════════════

class Event(models.Model):
    """
    Merkezi etkinlik modeli.
    Deneme, etüt, görüşme, ders vb. tüm etkinlikler burada tutulur.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    # ── Kurum context (multi-tenant filtreleme) ──
    sube_id = models.IntegerField(null=True, blank=True, verbose_name='Şube ID')
    egitim_yili_id = models.IntegerField(null=True, blank=True, verbose_name='Eğitim Yılı ID')
    donem_id = models.IntegerField(null=True, blank=True, verbose_name='Dönem ID')

    # ── Tür bağlantısı ──
    event_type = models.ForeignKey(
        EventType,
        on_delete=models.PROTECT,
        related_name='events',
        verbose_name='Etkinlik Türü',
    )

    # ── Temel bilgiler ──
    baslik = models.CharField(max_length=255, verbose_name='Başlık')
    aciklama = models.TextField(blank=True, default='', verbose_name='Açıklama')
    durum = models.CharField(
        max_length=20,
        choices=EventStatus.choices,
        default=EventStatus.SCHEDULED,
        verbose_name='Durum',
    )

    # ── Zaman ──
    baslangic = models.DateTimeField(verbose_name='Başlangıç Zamanı')
    bitis = models.DateTimeField(verbose_name='Bitiş Zamanı')
    tum_gun = models.BooleanField(default=False, verbose_name='Tüm Gün')

    # ── Tekrarlama ──
    tekrar_tipi = models.CharField(
        max_length=20,
        choices=RecurrenceType.choices,
        default=RecurrenceType.NONE,
        verbose_name='Tekrar Tipi',
    )
    tekrar_bitis = models.DateField(
        null=True, blank=True,
        verbose_name='Tekrar Bitiş Tarihi',
    )
    parent_event = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='occurrences',
        verbose_name='Ana Etkinlik',
    )

    # ── Konum / Salon ──
    salon_id = models.UUIDField(null=True, blank=True, verbose_name='Salon ID')
    salon_adi = models.CharField(max_length=200, blank=True, default='', verbose_name='Salon Adı')
    konum = models.CharField(max_length=300, blank=True, default='', verbose_name='Konum')

    # ── İlişkiler (opsiyonel — diğer modüllere referans) ──
    sinif_ids = models.JSONField(default=list, blank=True, verbose_name='Sınıf ID listesi')
    ogretmen_id = models.IntegerField(null=True, blank=True, verbose_name='Öğretmen/Koç ID')
    ogrenci_ids = models.JSONField(default=list, blank=True, verbose_name='Öğrenci ID listesi')

    # ── Dış modül referansları (hangi deneme, görüşme vb.) ──
    kaynak_modul = models.CharField(
        max_length=50, blank=True, default='',
        verbose_name='Kaynak Modül',
        help_text='coaching, olcme, etut vb.',
    )
    kaynak_id = models.CharField(
        max_length=100, blank=True, default='',
        verbose_name='Kaynak ID',
    )

    # ── Görünüm ──
    renk = models.CharField(max_length=7, blank=True, default='', verbose_name='Özel Renk')

    # ── Meta ──
    created_by = models.IntegerField(null=True, blank=True, verbose_name='Oluşturan')
    updated_by = models.IntegerField(null=True, blank=True, verbose_name='Güncelleyen')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'takvim_etkinlik'
        ordering = ['baslangic']
        verbose_name = 'Etkinlik'
        verbose_name_plural = 'Etkinlikler'
        indexes = [
            models.Index(fields=['kurum_id', 'baslangic', 'bitis'], name='idx_event_kurum_zaman'),
            models.Index(fields=['kurum_id', 'durum'], name='idx_event_kurum_durum'),
            models.Index(fields=['kurum_id', 'sube_id', 'egitim_yili_id'], name='idx_event_context'),
            models.Index(fields=['salon_id'], name='idx_event_salon'),
            models.Index(fields=['ogretmen_id'], name='idx_event_ogretmen'),
            models.Index(fields=['kaynak_modul', 'kaynak_id'], name='idx_event_kaynak'),
        ]

    def __str__(self):
        return f"{self.baslik} ({self.baslangic:%d.%m.%Y %H:%M})"

    @property
    def sure_dakika(self):
        if self.baslangic and self.bitis:
            return int((self.bitis - self.baslangic).total_seconds() / 60)
        return 0

    @property
    def etkinlik_renk(self):
        """Önce özel renk, yoksa tür rengi"""
        return self.renk or (self.event_type.renk if self.event_type_id else '#3B82F6')


# ══════════════════════════════════════════════════════════
# HATIRLATMA
# ══════════════════════════════════════════════════════════

class Reminder(models.Model):
    """Etkinlik hatırlatması"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='reminders',
        verbose_name='Etkinlik',
    )

    miktar = models.PositiveIntegerField(verbose_name='Miktar')
    birim = models.CharField(
        max_length=10,
        choices=ReminderUnit.choices,
        default=ReminderUnit.MINUTES,
        verbose_name='Birim',
    )
    hatirlatma_zamani = models.DateTimeField(verbose_name='Hatırlatma Zamanı')
    kanal = models.CharField(
        max_length=10,
        choices=NotificationChannel.choices,
        default=NotificationChannel.APP,
        verbose_name='Bildirim Kanalı',
    )
    durum = models.CharField(
        max_length=10,
        choices=ReminderStatus.choices,
        default=ReminderStatus.PENDING,
        verbose_name='Durum',
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'takvim_hatirlatma'
        ordering = ['hatirlatma_zamani']
        verbose_name = 'Hatırlatma'
        verbose_name_plural = 'Hatırlatmalar'

    def __str__(self):
        return f"{self.event.baslik} — {self.miktar} {self.get_birim_display()} önce"


# ══════════════════════════════════════════════════════════
# VARSAYILAN HATIRLATMA AYARI
# ══════════════════════════════════════════════════════════

class ReminderSetting(models.Model):
    """
    Kurum bazlı varsayılan hatırlatma ayarları.
    Yeni etkinlik oluşturulunca bu ayarlara göre otomatik reminder oluşur.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    event_type = models.ForeignKey(
        EventType,
        on_delete=models.CASCADE,
        related_name='reminder_settings',
        verbose_name='Etkinlik Türü',
    )

    miktar = models.PositiveIntegerField(verbose_name='Miktar')
    birim = models.CharField(
        max_length=10,
        choices=ReminderUnit.choices,
        default=ReminderUnit.MINUTES,
        verbose_name='Birim',
    )
    kanallar = models.JSONField(
        default=list, blank=True,
        verbose_name='Bildirim Kanalları',
        help_text='["APP", "SMS", "EMAIL"] — Boşsa sadece APP',
    )
    alici_tipler = models.JSONField(
        default=list, blank=True,
        verbose_name='Alıcı Tipleri',
        help_text='["OGRENCI", "OGRETMEN", "VELI"] — Boşsa tüm ilgililer',
    )
    is_active = models.BooleanField(default=True, verbose_name='Aktif')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'takvim_hatirlatma_ayari'
        ordering = ['event_type', 'miktar']
        verbose_name = 'Hatırlatma Ayarı'
        verbose_name_plural = 'Hatırlatma Ayarları'

    def __str__(self):
        return f"{self.event_type.ad} → {self.miktar} {self.get_birim_display()} önce"

    def get_kanallar(self) -> list:
        """Kanal listesini döndür, boşsa ['APP']"""
        return self.kanallar if self.kanallar else ['APP']

    def get_alici_tipler(self) -> list:
        """Alıcı tip listesini döndür, boşsa tüm ilgililer"""
        return self.alici_tipler if self.alici_tipler else ['OGRENCI', 'OGRETMEN']


# ══════════════════════════════════════════════════════════
# UYGULAMA BİLDİRİMİ (In-App Notification)
# ══════════════════════════════════════════════════════════

class AppNotification(models.Model):
    """
    Uygulama içi bildirim.
    Kullanıcının 🔔 bildirim çanında gördüğü bildirimler.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    # Alıcı
    user_id = models.IntegerField(verbose_name='Alıcı Kullanıcı ID')
    alici_tip = models.CharField(
        max_length=20,
        choices=RecipientType.choices,
        default=RecipientType.OGRENCI,
        verbose_name='Alıcı Tipi',
    )

    # İçerik
    baslik = models.CharField(max_length=255, verbose_name='Başlık')
    mesaj = models.TextField(verbose_name='Mesaj')
    ikon = models.CharField(max_length=10, default='🔔', verbose_name='İkon')
    renk = models.CharField(max_length=7, default='#3B82F6', verbose_name='Renk')
    url = models.CharField(
        max_length=500, blank=True, default='',
        verbose_name='Yönlendirme URL',
        help_text='/admin/takvim/genel gibi',
    )

    # Kaynak bağlantısı
    event = models.ForeignKey(
        Event, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='notifications',
        verbose_name='İlişkili Etkinlik',
    )
    reminder = models.ForeignKey(
        Reminder, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='notifications',
        verbose_name='İlişkili Hatırlatma',
    )

    # Durum
    ekran_mesaji = models.BooleanField(
        default=False,
        verbose_name='Ekran Mesajı',
        help_text='Girişte tam ekran banner olarak gösterilir',
    )
    ekran_gosterildi = models.BooleanField(
        default=False,
        verbose_name='Ekran Gösterildi',
        help_text='Tam ekran banner kullanıcıya gösterildi mi?',
    )
    is_read = models.BooleanField(default=False, verbose_name='Okundu')
    read_at = models.DateTimeField(null=True, blank=True, verbose_name='Okunma Zamanı')

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'takvim_bildirim'
        ordering = ['-created_at']
        verbose_name = 'Uygulama Bildirimi'
        verbose_name_plural = 'Uygulama Bildirimleri'
        indexes = [
            models.Index(fields=['user_id', 'is_read'], name='idx_notif_user_read'),
            models.Index(fields=['kurum_id', 'user_id', '-created_at'], name='idx_notif_kurum_user'),
        ]

    def __str__(self):
        return f"{self.ikon} {self.baslik} → User {self.user_id}"


# ══════════════════════════════════════════════════════════
# BİLDİRİM LOGU
# ══════════════════════════════════════════════════════════

class NotificationLog(models.Model):
    """
    Tüm bildirim gönderimlerinin logu.
    APP/SMS/EMAIL — kime, ne zaman, başarılı mı?
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')

    # Kaynak
    event = models.ForeignKey(
        Event, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='notification_logs',
        verbose_name='Etkinlik',
    )
    reminder = models.ForeignKey(
        Reminder, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='notification_logs',
        verbose_name='Hatırlatma',
    )

    # Alıcı
    user_id = models.IntegerField(verbose_name='Alıcı Kullanıcı ID')
    alici_tip = models.CharField(
        max_length=20,
        choices=RecipientType.choices,
        default=RecipientType.OGRENCI,
        verbose_name='Alıcı Tipi',
    )

    # Kanal & Durum
    kanal = models.CharField(
        max_length=10,
        choices=NotificationChannel.choices,
        verbose_name='Bildirim Kanalı',
    )
    durum = models.CharField(
        max_length=15,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
        verbose_name='Durum',
    )

    # İçerik
    baslik = models.CharField(max_length=255, verbose_name='Başlık')
    mesaj = models.TextField(blank=True, default='', verbose_name='Mesaj')

    # Hata takibi
    hata_mesaji = models.TextField(blank=True, default='', verbose_name='Hata Mesajı')
    deneme_sayisi = models.PositiveIntegerField(default=0, verbose_name='Deneme Sayısı')
    max_deneme = models.PositiveIntegerField(default=3, verbose_name='Maks Deneme')

    sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Gönderim Zamanı')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'takvim_bildirim_log'
        ordering = ['-created_at']
        verbose_name = 'Bildirim Logu'
        verbose_name_plural = 'Bildirim Logları'
        indexes = [
            models.Index(fields=['kanal', 'durum'], name='idx_notiflog_kanal_durum'),
            models.Index(fields=['user_id', '-created_at'], name='idx_notiflog_user'),
            models.Index(fields=['event_id'], name='idx_notiflog_event'),
        ]

    def __str__(self):
        return f"{self.get_kanal_display()} → User {self.user_id} [{self.durum}]"


# ══════════════════════════════════════════════════════════
# KULLANICI BİLDİRİM TERCİHLERİ
# ══════════════════════════════════════════════════════════

class UserNotificationPreference(models.Model):
    """
    Kullanıcı bazlı bildirim tercihleri.
    Her kullanıcı hangi kanaldan hangi tür bildirimleri alacağını seçebilir.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kurum_id = models.IntegerField(verbose_name='Kurum ID')
    user_id = models.IntegerField(verbose_name='Kullanıcı ID')

    # Hangi etkinlik türü için? (null = genel tercih)
    event_type = models.ForeignKey(
        EventType, null=True, blank=True,
        on_delete=models.CASCADE,
        related_name='user_preferences',
        verbose_name='Etkinlik Türü',
    )

    # Kanal tercihleri
    app_enabled = models.BooleanField(default=True, verbose_name='Uygulama Bildirimi')
    sms_enabled = models.BooleanField(default=False, verbose_name='SMS Bildirimi')
    email_enabled = models.BooleanField(default=False, verbose_name='E-posta Bildirimi')

    # Sessiz saatleri
    sessiz_baslangic = models.TimeField(
        null=True, blank=True,
        verbose_name='Sessiz Saat Başlangıç',
        help_text='Bu saatten itibaren bildirim gönderilmez',
    )
    sessiz_bitis = models.TimeField(
        null=True, blank=True,
        verbose_name='Sessiz Saat Bitiş',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'takvim_kullanici_bildirim_tercihi'
        verbose_name = 'Kullanıcı Bildirim Tercihi'
        verbose_name_plural = 'Kullanıcı Bildirim Tercihleri'
        constraints = [
            models.UniqueConstraint(
                fields=['user_id', 'event_type'],
                name='unique_user_notification_pref',
            )
        ]
        indexes = [
            models.Index(fields=['kurum_id', 'user_id'], name='idx_userpref_kurum_user'),
        ]

    def __str__(self):
        tur = self.event_type.ad if self.event_type_id else 'Genel'
        return f"User {self.user_id} → {tur}"
