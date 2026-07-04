"""
ClassLessonTeacherAssignment Domain Model (Sınıf Ders Çoklu Öğretmen Ataması)

Bir sınıf ders planına birden fazla öğretmen atanmasını sağlar.
- ClassLessonPlan'daki tek ogretmen alanı yerine, bu model ile çoklu atama yapılır
- Roller: PRIMARY (asıl), SECONDARY (yardımcı), ASSISTANT (asistan), CO_TEACHER (ortak), SUBSTITUTE (vekil)
- priority ile öncelik sırası belirlenir
- max_hours_for_class ile öğretmenin bu sınıf için haftalık maksimum saati belirlenir

Kullanım Senaryoları:
1. Bir sınıfın Matematik dersine 2 öğretmen atanır (1 PRIMARY + 1 CO_TEACHER)
2. Yedek öğretmen SUBSTITUTE rolüyle eklenir
3. Stajyer öğretmen ASSISTANT olarak eklenir
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class TeacherRole(models.TextChoices):
    """Öğretmen Rol Seçenekleri"""
    PRIMARY = 'PRIMARY', 'Asıl Öğretmen'
    SECONDARY = 'SECONDARY', 'Yardımcı Öğretmen'
    ASSISTANT = 'ASSISTANT', 'Asistan Öğretmen'
    CO_TEACHER = 'CO_TEACHER', 'Ortak Öğretmen'
    SUBSTITUTE = 'SUBSTITUTE', 'Vekil Öğretmen'


class ClassLessonTeacherAssignment(models.Model):
    """
    Sınıf Ders Çoklu Öğretmen Ataması
    
    Bir sınıf ders planına birden fazla öğretmen atanmasını sağlar.
    Her atama için rol ve öncelik belirlenir.
    """
    
    # ==================== İLİŞKİLER ====================
    
    # Akademik Yıl - Backend otomatik atar (aktif yıl)
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='class_lesson_teacher_assignments',
        verbose_name='Eğitim Yılı',
        help_text='Aktif eğitim yılı otomatik atanır'
    )
    
    # Sınıf Ders Planı
    class_lesson_plan = models.ForeignKey(
        'academic.ClassLessonPlan',
        on_delete=models.CASCADE,
        related_name='teacher_assignments',
        verbose_name='Sınıf Ders Planı',
        help_text='Öğretmenin atandığı sınıf ders planı'
    )
    
    # Öğretmen
    ogretmen = models.ForeignKey(
        'personel.Personel',
        on_delete=models.CASCADE,
        related_name='class_lesson_assignments',
        verbose_name='Öğretmen',
        help_text='Atanan öğretmen'
    )
    
    # ==================== ATAMA BİLGİLERİ ====================
    
    # Rol
    role = models.CharField(
        'Rol',
        max_length=20,
        choices=TeacherRole.choices,
        default=TeacherRole.PRIMARY,
        help_text='Öğretmenin bu ders için rolü'
    )
    
    # Öncelik (1 = en yüksek)
    priority = models.PositiveIntegerField(
        'Öncelik',
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text='Öncelik sırası (1 = en yüksek)'
    )
    
    # Bu sınıf için maksimum saat
    max_hours_for_class = models.PositiveIntegerField(
        'Maksimum Saat',
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(40)],
        help_text='Bu sınıf için öğretmenin maksimum ders saati'
    )
    
    # Notlar
    notes = models.TextField(
        'Notlar',
        blank=True,
        null=True,
        help_text='Atama hakkında notlar'
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
        db_table = 'class_lesson_teacher_assignment'
        verbose_name = 'Sınıf Ders Öğretmen Ataması'
        verbose_name_plural = 'Sınıf Ders Öğretmen Atamaları'
        ordering = ['class_lesson_plan', 'priority', 'role']
        
        # UNIQUE CONSTRAINT: Aynı yıl+plan+öğretmen kombinasyonu tekrar edemez
        constraints = [
            models.UniqueConstraint(
                fields=['egitim_yili', 'class_lesson_plan', 'ogretmen'],
                condition=models.Q(is_active=True),
                name='unique_class_lesson_teacher_active'
            )
        ]
        
        # İNDEKSLER: Sık sorgulanan alanlar
        indexes = [
            models.Index(fields=['class_lesson_plan', 'is_active'], name='idx_clta_plan'),
            models.Index(fields=['ogretmen', 'is_active'], name='idx_clta_ogretmen'),
            models.Index(fields=['role', 'is_active'], name='idx_clta_role'),
            models.Index(fields=['egitim_yili', 'class_lesson_plan'], name='idx_clta_yil_plan'),
            models.Index(fields=['priority'], name='idx_clta_priority'),
        ]
    
    def __str__(self):
        role_display = dict(TeacherRole.choices).get(self.role, self.role)
        return f"{self.class_lesson_plan.sinif.ad} | {self.class_lesson_plan.ders.ad} - {self.ogretmen.ad} {self.ogretmen.soyad} [{role_display}]"
    
    def clean(self):
        """Model validasyonları"""
        from django.core.exceptions import ValidationError
        
        # PRIMARY rol kontrolü: Her plan için sadece bir PRIMARY olabilir
        if self.role == TeacherRole.PRIMARY:
            existing_primary = ClassLessonTeacherAssignment.objects.filter(
                egitim_yili=self.egitim_yili,
                class_lesson_plan=self.class_lesson_plan,
                role=TeacherRole.PRIMARY,
                is_active=True
            ).exclude(pk=self.pk)
            
            if existing_primary.exists():
                raise ValidationError({
                    'role': 'Bu sınıf ders planı için zaten bir asıl öğretmen tanımlı.'
                })
        
        # max_hours_for_class validasyonu
        if self.max_hours_for_class and self.class_lesson_plan:
            if self.max_hours_for_class > self.class_lesson_plan.weekly_hours:
                raise ValidationError({
                    'max_hours_for_class': f'Maksimum saat, ders planının haftalık saatinden ({self.class_lesson_plan.weekly_hours}) fazla olamaz.'
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
    def role_display(self):
        """Rol gösterimi"""
        return dict(TeacherRole.choices).get(self.role, self.role)
    
    @property
    def class_name(self):
        """Sınıf adı"""
        return self.class_lesson_plan.sinif.ad
    
    @property
    def lesson_name(self):
        """Ders adı"""
        return self.class_lesson_plan.ders.ad
    
    @classmethod
    def get_assignments_for_plan(cls, class_lesson_plan):
        """Bir ders planı için tüm öğretmen atamalarını döndür"""
        return cls.objects.filter(
            class_lesson_plan=class_lesson_plan,
            is_active=True
        ).select_related('ogretmen').order_by('priority', 'role')
    
    @classmethod
    def get_primary_teacher(cls, class_lesson_plan):
        """Bir ders planı için asıl öğretmeni döndür"""
        assignment = cls.objects.filter(
            class_lesson_plan=class_lesson_plan,
            role=TeacherRole.PRIMARY,
            is_active=True
        ).select_related('ogretmen').first()
        return assignment.ogretmen if assignment else None
    
    @classmethod
    def get_teacher_assignments(cls, egitim_yili, ogretmen):
        """Bir öğretmenin tüm sınıf atamalarını döndür"""
        return cls.objects.filter(
            egitim_yili=egitim_yili,
            ogretmen=ogretmen,
            is_active=True
        ).select_related('class_lesson_plan__sinif', 'class_lesson_plan__ders')
