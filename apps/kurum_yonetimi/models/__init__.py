"""
ÇEKİRDEK MODELLER - PUBLIC SCHEMA
Bu modeller PostgreSQL'in public schema'sında saklanır.
"""

from django.db import models
from django.utils import timezone


class Kurum(models.Model):
    """
    Kurum Modeli (Public Schema)
    
    En üst seviye organizasyon birimi.
    Örnek: XYZ Eğitim Kurumları
    """
    ad = models.CharField(max_length=255, verbose_name="Kurum Adı")
    kod = models.CharField(max_length=50, unique=True, verbose_name="Kurum Kodu")
    aktif_mi = models.BooleanField(default=True, verbose_name="Aktif Mi?")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        db_table = 'kurumlar'
        verbose_name = 'Kurum'
        verbose_name_plural = 'Kurumlar'
        ordering = ['ad']
    
    def __str__(self):
        return self.ad


class Sube(models.Model):
    """
    Şube Modeli (Public Schema)
    
    Kurum altındaki şubeler.
    Örnek: Ankara Şubesi, İstanbul Şubesi
    """
    kurum = models.ForeignKey(
        Kurum, 
        on_delete=models.CASCADE, 
        related_name='subeler',
        verbose_name="Kurum"
    )
    ad = models.CharField(max_length=255, verbose_name="Şube Adı")
    kod = models.CharField(max_length=50, verbose_name="Şube Kodu")
    aktif_mi = models.BooleanField(default=True, verbose_name="Aktif Mi?")
    adres = models.TextField(blank=True, null=True, verbose_name="Adres")
    telefon = models.CharField(max_length=20, blank=True, null=True, verbose_name="Telefon")
    email = models.EmailField(blank=True, null=True, verbose_name="E-posta")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        db_table = 'subeler'
        verbose_name = 'Şube'
        verbose_name_plural = 'Şubeler'
        unique_together = [['kurum', 'kod']]
        ordering = ['kurum', 'ad']
    
    def __str__(self):
        return f"{self.kurum.ad} - {self.ad}"


class EgitimYili(models.Model):
    """
    Eğitim Yılı Modeli (Public Schema)
    
    Her eğitim yılı için ayrı bir PostgreSQL schema oluşturulur.
    Schema adı: kurum_{kurum_id}_{yil}
    
    Örnek: 
    - kurum_1_2024_2025
    - kurum_1_2025_2026
    """
    kurum = models.ForeignKey(
        Kurum,
        on_delete=models.CASCADE,
        related_name='egitim_yillari',
        verbose_name="Kurum"
    )
    sube = models.ForeignKey(
        Sube,
        on_delete=models.CASCADE,
        related_name='egitim_yillari',
        verbose_name="Şube"
    )
    yil = models.CharField(
        max_length=20, 
        verbose_name="Eğitim Yılı",
        help_text="Örnek: 2024-2025"
    )
    schema_adi = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Schema Adı",
        help_text="PostgreSQL schema adı"
    )
    aktif_mi = models.BooleanField(default=False, verbose_name="Aktif Mi?")
    baslangic_tarihi = models.DateField(verbose_name="Başlangıç Tarihi")
    bitis_tarihi = models.DateField(verbose_name="Bitiş Tarihi")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Oluşturma Tarihi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Güncellenme Tarihi")
    
    class Meta:
        db_table = 'egitim_yillari'
        verbose_name = 'Eğitim Yılı'
        verbose_name_plural = 'Eğitim Yılları'
        unique_together = [['kurum', 'sube', 'yil']]
        ordering = ['-yil']
    
    def __str__(self):
        return f"{self.sube} - {self.yil}"
    
    def save(self, *args, **kwargs):
        """Schema adını otomatik oluştur"""
        if not self.schema_adi:
            # Schema adı formatı: kurum_{kurum_id}_{yil}
            yil_temiz = self.yil.replace('-', '_').replace('/', '_')
            self.schema_adi = f"kurum_{self.kurum_id}_{yil_temiz}"
        super().save(*args, **kwargs)
