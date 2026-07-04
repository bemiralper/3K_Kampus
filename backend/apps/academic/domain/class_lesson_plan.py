"""
ClassLessonPlan Domain Model

Sınıf Ders Planı - Her sınıf için haftalık ders saatleri, krediler,
öğretmen atamaları ve program motoru için hazırlık verileri.

Bu modül:
- Ders programı üretmez
- Sadece plan verisini saklar
- ProgramGrid Engine için veri kaynağıdır

TODO: seçmeli ders havuzu
TODO: ders grubu
TODO: sınıf alt grup
TODO: öğretmen tercih listesi
TODO: ders gün tercihi
TODO: oda tipi zorunluluğu
TODO: min/max slot aralığı
TODO: paralel ders desteği
TODO: branş öğretmen havuzu
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class ClassLessonPlan(models.Model):
    """
    Sınıf Ders Planı
    
    Her sınıf için derslerin haftalık saatlerini, kredilerini,
    öğretmen atamalarını ve program motoru ayarlarını tutar.
    
    ⚠️ YASAKLAR:
    - TimeSlot bağlama
    - WeeklyDay bağlama
    - ProgramGridCell bağlama
    - JSON program saklama
    - schedule_template bağlama
    """
    
    # ==================== İLİŞKİLER ====================
    
    # Akademik Yıl - Backend otomatik atar (aktif yıl)
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='class_lesson_plans',
        verbose_name='Eğitim Yılı',
        help_text='Aktif eğitim yılı otomatik atanır'
    )
    
    # Dönem
    term = models.ForeignKey(
        'term.Term',
        on_delete=models.CASCADE,
        related_name='class_lesson_plans',
        verbose_name='Dönem'
    )
    
    # Sınıf
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.CASCADE,
        related_name='lesson_plans',
        verbose_name='Sınıf'
    )
    
    # Ders
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.CASCADE,
        related_name='class_lesson_plans',
        verbose_name='Ders'
    )
    
    # Öğretmen (opsiyonel - henüz atanmamış olabilir)
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_lessons',
        verbose_name='Öğretmen',
        help_text='Dersi verecek öğretmen (opsiyonel)'
    )
    
    # ==================== DERS BİLGİLERİ ====================
    
    # Haftalık saat
    weekly_hours = models.PositiveIntegerField(
        'Haftalık Saat',
        validators=[MinValueValidator(1), MaxValueValidator(40)],
        help_text='Haftada kaç saat ders yapılacak'
    )
    
    # Kredi
    credit = models.PositiveIntegerField(
        'Kredi',
        default=0,
        validators=[MaxValueValidator(10)],
        help_text='Dersin kredi değeri'
    )
    
    # Zorunlu/Seçmeli
    is_mandatory = models.BooleanField(
        'Zorunlu Ders',
        default=True,
        help_text='Zorunlu ders mi?'
    )
    
    # ==================== PROGRAM MOTORU AYARLARI ====================
    # Bu alanlar ders program motoruna veri sağlar
    
    # Çift blok ders
    is_double_block = models.BooleanField(
        'Çift Blok',
        default=False,
        help_text='Ders çift blok olarak mı programlanacak? (2 saat arka arkaya)'
    )
    
    # Öncelik (program motorunda hangi derslerin önce yerleştirileceği)
    priority = models.PositiveIntegerField(
        'Öncelik',
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        help_text='Yüksek değer = yüksek öncelik (program motorunda önce yerleştirilir)'
    )
    
    # Tercih edilen oda tipi
    preferred_room_type = models.CharField(
        'Tercih Edilen Oda Tipi',
        max_length=50,
        blank=True,
        null=True,
        help_text='Örn: lab, spor_salonu, muzik_odasi'
    )
    
    # ==================== EK BİLGİLER ====================
    
    notes = models.TextField(
        'Notlar',
        blank=True,
        null=True,
        help_text='Ders planı hakkında ek notlar'
    )
    
    # ==================== DURUM ====================
    
    is_active = models.BooleanField(
        'Aktif',
        default=True,
        help_text='Soft delete için kullanılır'
    )
    
    # ==================== ZAMAN DAMGALARI ====================
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'class_lesson_plan'
        verbose_name = 'Sınıf Ders Planı'
        verbose_name_plural = 'Sınıf Ders Planları'
        ordering = ['sinif', 'ders__ad']
        
        # UNIQUE CONSTRAINT: Aynı yıl+dönem+sınıf+ders kombinasyonu tekrar edemez
        constraints = [
            models.UniqueConstraint(
                fields=['egitim_yili', 'term', 'sinif', 'ders'],
                condition=models.Q(is_active=True),
                name='unique_class_lesson_plan_active'
            )
        ]
        
        # İNDEKSLER: Sık sorgulanan alanlar
        indexes = [
            models.Index(fields=['sinif', 'is_active'], name='idx_clp_sinif'),
            models.Index(fields=['term', 'is_active'], name='idx_clp_term'),
            models.Index(fields=['ogretmen', 'is_active'], name='idx_clp_ogretmen'),
            models.Index(fields=['ders', 'is_active'], name='idx_clp_ders'),
            models.Index(fields=['egitim_yili', 'term', 'sinif'], name='idx_clp_composite'),
        ]
    
    def __str__(self):
        teacher_name = f" - {self.ogretmen.ad} {self.ogretmen.soyad}" if self.ogretmen else ""
        return f"{self.sinif.ad} | {self.ders.ad} ({self.weekly_hours} saat){teacher_name}"
    
    def clean(self):
        """Model validasyonları"""
        from django.core.exceptions import ValidationError
        
        # Çift blok ise en az 2 saat olmalı
        if self.is_double_block and self.weekly_hours < 2:
            raise ValidationError({
                'weekly_hours': 'Çift blok dersler için haftalık saat en az 2 olmalıdır.'
            })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    # ==================== YARDIMCI METHODLAR ====================
    
    @property
    def teacher_name(self):
        """Öğretmen tam adı"""
        if self.ogretmen:
            return f"{self.ogretmen.ad} {self.ogretmen.soyad}"
        return None
    
    @property
    def lesson_type_display(self):
        """Zorunlu/Seçmeli gösterimi"""
        return "Zorunlu" if self.is_mandatory else "Seçmeli"
    
    @property
    def block_type_display(self):
        """Blok tipi gösterimi"""
        return "Çift Blok" if self.is_double_block else "Normal"
