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
                name='unique_template_name_per_branch'
            ),
        ]
    
    def __str__(self):
        if self.sube:
            return f"{self.name} ({self.sube.ad})"
        return self.name
    
    def soft_delete(self):
        """
        Soft delete - şablonu pasifleştirir ve bağlı slotları da pasifleştirir
        
        DELETE → is_active = false
        """
        self.is_active = False
        self.save(update_fields=['is_active', 'updated_at'])
        
        # Bağlı tüm slotları da pasifleştir
        self.timeslots.update(is_active=False)
    
    @property
    def slot_count(self):
        """Aktif slot sayısı"""
        return self.timeslots.filter(is_active=True).count()
    
    @property
    def break_count(self):
        """Aktif mola sayısı"""
        return self.timeslots.filter(is_active=True, is_break=True).count()
