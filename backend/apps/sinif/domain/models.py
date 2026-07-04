"""
Sinif Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models


class Sinif(models.Model):
    """
    Class (Year-Dependent Entity)
    
    YILLIK VARLIK - Her eğitim yılında sıfırdan oluşturulur
    
    KURALLAR:
    - Her eğitim yılı için ayrı sınıflar tanımlanır
    - Aynı sınıf adı farklı yıllarda olabilir
    - Tenant isolation: kurum + sube + egitim_yili
    - Odaya atanabilir (fiziksel mekan ilişkisi)
    """
    
    # Tenant isolation (ZORUNLU)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='siniflar',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='siniflar',
        verbose_name='Şube'
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='siniflar',
        verbose_name='Eğitim Yılı'
    )
    
    # Sınıf bilgileri
    ad = models.CharField('Sınıf Adı', max_length=100, help_text='Örn: 9-A, 10-B')
    kod = models.CharField('Sınıf Kodu', max_length=50, blank=True)
    
    # Oda ilişkisi - Fiziksel mekan ataması (opsiyonel)
    oda = models.ForeignKey(
        'oda.Oda',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='siniflar',
        verbose_name='Atanan Oda',
        help_text='Sınıfın kullandığı fiziksel oda'
    )
    
    # Seviye bilgisi (opsiyonel - varsa egitim_tanimlari uygulamasından)
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='siniflar',
        verbose_name='Sınıf Seviyesi'
    )
    
    # Alan bilgisi (opsiyonel - varsa egitim_tanimlari uygulamasından)
    alan = models.ForeignKey(
        'egitim_tanimlari.Alan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='siniflar',
        verbose_name='Alan'
    )
    
    # Kapasite
    kapasite = models.IntegerField('Kapasite', default=30)
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'sinif'
        verbose_name = 'Sınıf'
        verbose_name_plural = 'Sınıflar'
        ordering = ['egitim_yili', 'ad']
        constraints = [
            # Aynı kurum+sube+yıl için aynı sınıf adı olmaz
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'egitim_yili', 'ad'],
                name='unique_sinif_per_year'
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili', 'aktif_mi']),
        ]
    
    def __str__(self):
        return f"{self.ad} ({self.egitim_yili.yil_str})"
    
    @property
    def mevcutluk(self):
        """Şu anki öğrenci sayısı"""
        return self.kayitlar.filter(aktif_mi=True).count()
    
    @property
    def doluluk_orani(self):
        """Doluluk yüzdesi"""
        if self.kapasite == 0:
            return 0
        return (self.mevcutluk / self.kapasite) * 100
