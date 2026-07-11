"""
ScheduleTemplate (Zaman Şablonu) Model

Bu model farklı eğitim grupları için zaman şablonları tanımlar.
Örnek kullanım:
- Lise Programı
- Mezun Programı  
- Hafta Sonu Programı
- Akşam Programı

GELECEK ENTEGRASYON NOTLARI:
# Ders Program Motoru template üzerinden slot çekecek
# Sınıf → schedule_template FK eklenecek (ileride)
# Sınav planlama slotları kullanacak
# Yoklama slot bazlı olacak

TODO: template kopyalama
TODO: slot şablon marketplace
"""

from django.db import models


class ScheduleTemplate(models.Model):
    """
    Zaman Şablonu modeli
    
    Farklı eğitim gruplarının aynı gün içinde farklı ders saatlerine 
    sahip olabilmesi için şablon tanımları.
    """
    
    # İlişkiler
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='schedule_templates',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='schedule_templates',
        verbose_name='Şube',
        null=True,
        blank=True,
        help_text='Belirli bir şubeye özel ise seçin, boş bırakılırsa tüm şubelerde kullanılabilir'
    )
    
    # Temel bilgiler
    name = models.CharField(
        'Şablon Adı',
        max_length=100,
        help_text='Örn: Lise Programı, Hafta Sonu Programı'
    )
    description = models.TextField(
        'Açıklama',
        blank=True,
        null=True,
        help_text='Şablon hakkında ek bilgi'
    )
    
    # Durum
    is_active = models.BooleanField(
        'Aktif',
        default=True,
        help_text='Pasif şablonlar seçilemez'
    )
    is_default = models.BooleanField(
        'Varsayılan mı?',
        default=False,
        help_text='Bu şube için varsayılan ders saati şablonu'
    )
    primary_weekly_cycle = models.ForeignKey(
        'academic.WeeklyCycle',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_for_templates',
        verbose_name='Gün Yapısı',
        help_text='Eski bağlantı — yeni kayıtlarda kullanılmaz',
    )
    gun_yapisi_label = models.CharField(
        'Gün Yapısı Etiketi',
        max_length=100,
        blank=True,
        default='',
        help_text='Görüntüleme etiketi — örn. Hafta İçi, Hafta Sonu',
    )
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'schedule_template'
        verbose_name = 'Zaman Şablonu'
        verbose_name_plural = 'Zaman Şablonları'
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'name'],
                condition=models.Q(is_active=True),
                name='unique_active_template_name_per_branch',
            ),
        ]
    
    def __str__(self):
        if self.sube:
            return f"{self.name} ({self.sube.ad})"
        return self.name
    
    def soft_delete(self):
        """
        Soft delete — şablonu pasifleştirir ve bağlı slotları da pasifleştirir.
        """
        self.is_active = False
        self.is_default = False
        self.save(update_fields=['is_active', 'is_default', 'updated_at'])
        self.time_slots.update(is_active=False)

    def hard_delete(self):
        """Kalıcı silme — yalnızca pasif ve kullanılmayan şablonlar için."""
        if self.is_active:
            raise ValueError('Aktif şablon kalıcı silinemez; önce pasif yapın.')
        if self.schedule_versions.exists():
            raise ValueError(
                'Bu şablon programlarda kullanıldığı için kalıcı silinemez.'
            )
        self.delete()

    def reactivate(self):
        """Pasif şablonu tekrar aktifleştirir."""
        self.is_active = True
        self.save(update_fields=['is_active', 'updated_at'])
        self.time_slots.update(is_active=True)
    
    @property
    def slot_count(self):
        """Aktif slot sayısı"""
        return self.time_slots.filter(is_active=True).count()
    
    @property
    def lesson_count(self):
        """Aktif ders (LESSON) slot sayısı"""
        from apps.academic.domain.timeslot import SlotType
        return self.time_slots.filter(is_active=True, slot_type=SlotType.LESSON).count()
    
    @property
    def break_count(self):
        """Aktif mola sayısı"""
        return self.time_slots.filter(is_active=True).exclude(
            slot_type='LESSON'
        ).count()
