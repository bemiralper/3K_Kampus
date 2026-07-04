"""
TimeSlot (Ders Saati) Model

Bu model bir zaman şablonuna bağlı ders saatlerini tanımlar.
Her slot bir ders saati veya mola olabilir.

GELECEK ENTEGRASYON NOTLARI:
# Ders Program Motoru slot_type kullanarak ders yerleştirecek
# BREAK türlerine ders atanamayacak
# Sınav planlama LESSON slotlarını referans alacak
# Yoklama slot bazlı çalışacak
# Etüt planlama slotları kullanacak
# Koçluk planlama slotları kullanacak
# Oda planlama slotları kullanacak

TODO: CUSTOM_BREAK manuel ekleme wizard
TODO: cuma namaz arası preset
TODO: farklı ders süreleri (blok ders)
TODO: yarım gün program
TODO: preset kütüphanesi (MEB Lise, Mezun, Hafta Sonu)
TODO: excel import
TODO: AI slot öneri motoru
TODO: drag-drop order edit
TODO: A/B hafta varyantı
TODO: resmi tatil motoru entegrasyonu
"""

from django.db import models
from django.core.exceptions import ValidationError


class SlotType(models.TextChoices):
    """
    Slot Türleri
    
    Ders programı, sınav ve yoklama motorları bu türleri kullanacak.
    BREAK türlerine ders atanamayacak.
    """
    LESSON = 'LESSON', 'Ders'
    SHORT_BREAK = 'SHORT_BREAK', 'Kısa Teneffüs'
    LUNCH_BREAK = 'LUNCH_BREAK', 'Öğle Arası'
    EVENING_BREAK = 'EVENING_BREAK', 'Akşam Arası'
    CUSTOM_BREAK = 'CUSTOM_BREAK', 'Özel Mola'


class TimeSlot(models.Model):
    """
    Ders Saati modeli
    
    Zaman şablonuna bağlı ders saatleri ve molalar.
    Örn: 1. Ders 08:30-09:15, Teneffüs 09:15-09:30
    
    slot_type alanı hangi tür slot olduğunu belirler:
    - LESSON: Ders atanabilir
    - SHORT_BREAK, LUNCH_BREAK, EVENING_BREAK, CUSTOM_BREAK: Ders atanamaz
    """
    
    # İlişkiler
    schedule_template = models.ForeignKey(
        'academic.ScheduleTemplate',
        on_delete=models.CASCADE,
        related_name='time_slots',
        verbose_name='Zaman Şablonu'
    )
    
    # Slot Türü
    slot_type = models.CharField(
        'Slot Türü',
        max_length=20,
        choices=SlotType.choices,
        default=SlotType.LESSON,
        help_text='Ders veya mola türünü belirler'
    )
    
    # Temel bilgiler
    name = models.CharField(
        'Slot Adı',
        max_length=50,
        help_text='Örn: 1. Ders, Teneffüs, Öğle Arası'
    )
    
    # Zaman bilgileri
    start_time = models.TimeField(
        'Başlangıç Saati',
        help_text='Format: HH:MM'
    )
    end_time = models.TimeField(
        'Bitiş Saati',
        help_text='Format: HH:MM'
    )
    
    # Sıralama
    order = models.PositiveIntegerField(
        'Sıra No',
        help_text='Günlük sıralama için'
    )
    
    # Durum
    is_active = models.BooleanField(
        'Aktif',
        default=True
    )
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'timeslot'
        verbose_name = 'Ders Saati'
        verbose_name_plural = 'Ders Saatleri'
        ordering = ['schedule_template', 'order']
        constraints = [
            # Aynı template içinde order tekrar edemez (aktif slotlar için)
            models.UniqueConstraint(
                fields=['schedule_template', 'order'],
                condition=models.Q(is_active=True),
                name='unique_order_per_template_active'
            ),
        ]
    
    @property
    def is_break(self):
        """
        Türetilmiş alan: slot_type != LESSON ise mola
        
        Bu alan artık DB'de tutulmuyor, slot_type'dan türetiliyor.
        Geriye dönük uyumluluk için property olarak korunuyor.
        """
        return self.slot_type != SlotType.LESSON
    
    def __str__(self):
        return f"{self.name} ({self.start_time.strftime('%H:%M')}-{self.end_time.strftime('%H:%M')})"
    
    def clean(self):
        """
        Model validasyonları
        
        1. start_time < end_time zorunlu
        2. Aynı template içinde zaman çakışması kontrolü
        """
        super().clean()
        
        # Zaman mantık kontrolü
        if self.start_time and self.end_time:
            if self.start_time >= self.end_time:
                raise ValidationError({
                    'end_time': 'Bitiş saati başlangıç saatinden sonra olmalıdır.'
                })
        
        # Çakışma kontrolü - sadece aktif slotlar için
        if self.schedule_template_id and self.start_time and self.end_time:
            overlapping = TimeSlot.objects.filter(
                schedule_template_id=self.schedule_template_id,
                is_active=True
            ).exclude(pk=self.pk)
            
            for slot in overlapping:
                # Çakışma durumları:
                # 1. Yeni slot mevcut slotun içinde başlıyor
                # 2. Yeni slot mevcut slotun içinde bitiyor
                # 3. Yeni slot mevcut slotu kapsıyor
                if (
                    (self.start_time >= slot.start_time and self.start_time < slot.end_time) or
                    (self.end_time > slot.start_time and self.end_time <= slot.end_time) or
                    (self.start_time <= slot.start_time and self.end_time >= slot.end_time)
                ):
                    raise ValidationError({
                        'start_time': f'Bu zaman aralığı "{slot.name}" ile çakışıyor ({slot.start_time.strftime("%H:%M")}-{slot.end_time.strftime("%H:%M")})'
                    })
    
    def save(self, *args, **kwargs):
        """Kaydetmeden önce validasyon çalıştır"""
        self.full_clean()
        super().save(*args, **kwargs)
    
    def soft_delete(self):
        """
        Soft delete - slotu pasifleştirir
        
        DELETE → is_active = false
        """
        self.is_active = False
        self.save(update_fields=['is_active', 'updated_at'])
    
    @property
    def duration(self):
        """Süre (dakika cinsinden)"""
        if self.start_time and self.end_time:
            start_mins = self.start_time.hour * 60 + self.start_time.minute
            end_mins = self.end_time.hour * 60 + self.end_time.minute
            return end_mins - start_mins
        return 0
    
    @property
    def duration_minutes(self):
        """Süre (dakika cinsinden) - alias"""
        return self.duration
    
    @property
    def duration_display(self):
        """Süre görüntüleme formatı (örn: 45 dk)"""
        mins = self.duration
        if mins >= 60:
            hours = mins // 60
            remaining = mins % 60
            if remaining:
                return f"{hours} sa {remaining} dk"
            return f"{hours} sa"
        return f"{mins} dk"
    
    @property
    def slot_type_display(self):
        """Slot türü görüntüleme metni"""
        return self.get_slot_type_display()
