"""
LessonTeacherPool Domain Model (Branş Öğretmen Havuzu)

Her ders için atanabilecek öğretmenlerin havuzunu tutar.
- Bir ders için birden fazla öğretmen havuza eklenebilir
- is_primary ile asıl branş öğretmeni işaretlenir
- max_weekly_load ile öğretmenin bu ders için haftalık maksimum yükü belirlenir
- Ders-öğretmen atamalarında sadece bu havuzdaki öğretmenler seçilebilir

Kullanım Senaryoları:
1. Matematik dersi için 5 öğretmen havuza eklenir
2. Sınıf ders planı oluşturulurken bu havuzdan seçim yapılır
3. Bir öğretmen birden fazla branşta olabilir (örn: Fen Bilimleri + Kimya)
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class LessonTeacherPool(models.Model):
    """
    Branş Öğretmen Havuzu
    
    Bir ders için atanabilecek öğretmenlerin listesini tutar.
    Bu havuz, sınıf ders planlarında öğretmen atamalarında kullanılır.
    """
    
    # ==================== İLİŞKİLER ====================
    
    # Akademik Yıl - Backend otomatik atar (aktif yıl)
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='lesson_teacher_pools',
        verbose_name='Eğitim Yılı',
        help_text='Aktif eğitim yılı otomatik atanır'
    )
    
    # Ders
    ders = models.ForeignKey(
        'egitim_tanimlari.Ders',
        on_delete=models.CASCADE,
        related_name='teacher_pool',
        verbose_name='Ders',
        help_text='Öğretmen havuzunun ait olduğu ders'
    )
    
    # Öğretmen
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.CASCADE,
        related_name='lesson_pools',
        verbose_name='Öğretmen',
        help_text='Havuza eklenen öğretmen'
    )
    
    # ==================== HAVUZ BİLGİLERİ ====================
    
    # Ana branş öğretmeni mi?
    is_primary = models.BooleanField(
        'Asıl Branş',
        default=False,
        help_text='Bu öğretmenin asıl branşı mı? (Her ders için sadece bir asıl branş olabilir)'
    )
    
    # Haftalık maksimum yük (bu ders için)
    max_weekly_load = models.PositiveIntegerField(
        'Maksimum Haftalık Yük',
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(40)],
        help_text='Bu ders için öğretmenin haftalık maksimum ders saati'
    )
    
    # Notlar
    notes = models.TextField(
        'Notlar',
        blank=True,
        null=True,
        help_text='Öğretmen-ders ilişkisi hakkında notlar'
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
        db_table = 'lesson_teacher_pool'
        verbose_name = 'Branş Öğretmen Havuzu'
        verbose_name_plural = 'Branş Öğretmen Havuzları'
        ordering = ['ders__ad', '-is_primary', 'ogretmen__ad']
        
        # UNIQUE CONSTRAINT: Aynı yıl+ders+öğretmen kombinasyonu tekrar edemez
        constraints = [
            models.UniqueConstraint(
                fields=['egitim_yili', 'ders', 'ogretmen'],
                condition=models.Q(is_active=True),
                name='unique_lesson_teacher_pool_active'
            )
        ]
        
        # İNDEKSLER: Sık sorgulanan alanlar
        indexes = [
            models.Index(fields=['ders', 'is_active'], name='idx_ltp_ders'),
            models.Index(fields=['ogretmen', 'is_active'], name='idx_ltp_ogretmen'),
            models.Index(fields=['egitim_yili', 'ders'], name='idx_ltp_yil_ders'),
            models.Index(fields=['is_primary', 'is_active'], name='idx_ltp_primary'),
        ]
    
    def __str__(self):
        primary_tag = " [Asıl Branş]" if self.is_primary else ""
        return f"{self.ders.ad} - {self.ogretmen.ad} {self.ogretmen.soyad}{primary_tag}"
    
    def clean(self):
        """Model validasyonları"""
        from django.core.exceptions import ValidationError
        
        # is_primary = True ise, aynı ders için başka is_primary olamaz
        if self.is_primary:
            existing_primary = LessonTeacherPool.objects.filter(
                egitim_yili=self.egitim_yili,
                ders=self.ders,
                is_primary=True,
                is_active=True
            ).exclude(pk=self.pk)
            
            if existing_primary.exists():
                raise ValidationError({
                    'is_primary': 'Bu ders için zaten bir asıl branş öğretmeni tanımlı.'
                })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    # ==================== YARDIMCI METHODLAR ====================
    
    @property
    def teacher_name(self):
        """Öğretmen tam adı"""
        return f"{self.ogretmen.ad} {self.ogretmen.soyad}"
    
    @property
    def lesson_name(self):
        """Ders adı"""
        return self.ders.ad
    
    @classmethod
    def get_pool_for_lesson(cls, egitim_yili, ders):
        """Bir ders için tüm havuzdaki öğretmenleri döndür"""
        return cls.objects.filter(
            egitim_yili=egitim_yili,
            ders=ders,
            is_active=True
        ).select_related('ogretmen')
    
    @classmethod
    def get_primary_teacher(cls, egitim_yili, ders):
        """Bir ders için asıl branş öğretmenini döndür"""
        return cls.objects.filter(
            egitim_yili=egitim_yili,
            ders=ders,
            is_primary=True,
            is_active=True
        ).select_related('ogretmen').first()
