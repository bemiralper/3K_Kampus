"""
EgitimYili Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class EgitimYili(models.Model):
    """
    Education Year (Global - NOT tenant specific)
    
    Kalıcı varlık - Tüm kurumlar için ortak eğitim yılı tanımı
    Örnek: 2024-2025, 2025-2026
    
    NOT: Bu tablo kurum/şube bağımsızdır!
    """
    baslangic_yil = models.IntegerField(
        'Başlangıç Yılı',
        validators=[
            MinValueValidator(2000),
            MaxValueValidator(2100)
        ]
    )
    bitis_yil = models.IntegerField(
        'Bitiş Yılı',
        validators=[
            MinValueValidator(2000),
            MaxValueValidator(2100)
        ]
    )
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'egitim_yili'
        verbose_name = 'Eğitim Yılı'
        verbose_name_plural = 'Eğitim Yılları'
        ordering = ['-baslangic_yil']
        constraints = [
            models.UniqueConstraint(
                fields=['baslangic_yil', 'bitis_yil'],
                name='unique_egitim_yili'
            ),
            models.CheckConstraint(
                check=models.Q(bitis_yil=models.F('baslangic_yil') + 1),
                name='bitis_yil_check'
            )
        ]
        indexes = [
            models.Index(fields=['aktif_mi']),
        ]
    
    def __str__(self):
        return f"{self.baslangic_yil}-{self.bitis_yil}"
    
    @property
    def yil_str(self):
        """2024-2025 formatında string"""
        return f"{self.baslangic_yil}-{self.bitis_yil}"

