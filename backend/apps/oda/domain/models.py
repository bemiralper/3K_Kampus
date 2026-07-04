"""
Oda Domain Models
Fiziksel Mekan Yönetimi - Yıldan Bağımsız

KURALLAR:
- Oda = Fiziksel Mekan (Şube bazında)
- Yıldan bağımsız, kalıcı varlık
- İçinde sınıf tutulmaz (Sınıf, Oda'ya FK ile bağlanır)
"""
from django.db import models


class OdaTuru(models.TextChoices):
    """Oda türleri - Opsiyonel alan için"""
    DERSLIK = 'derslik', 'Derslik'
    LABORATUVAR = 'laboratuvar', 'Laboratuvar'
    TOPLANTI = 'toplanti', 'Toplantı Salonu'
    KUTUPHANE = 'kutuphane', 'Kütüphane'
    SPOR = 'spor', 'Spor Salonu'
    YEMEKHANE = 'yemekhane', 'Yemekhane'
    OFIS = 'ofis', 'Ofis'
    DIGER = 'diger', 'Diğer'


class Oda(models.Model):
    """
    Room (Physical Space - Year-Independent)
    
    FİZİKSEL MEKAN - Yıldan bağımsız, kalıcı
    
    KURALLAR:
    - Şube bazında tanımlanır
    - Yıldan bağımsızdır (FK yok)
    - İçinde sınıf tutulmaz (Sınıf bu modele FK ile bağlanır)
    - Kapasite fiziksel kişi sayısıdır
    """
    
    # Tenant isolation (ZORUNLU)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='odalar',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='odalar',
        verbose_name='Şube'
    )
    
    # Oda bilgileri
    ad = models.CharField(
        'Oda Adı',
        max_length=100,
        help_text='Örn: A-101, Laboratuvar 1, Toplantı Odası'
    )
    
    # Kapasite (fiziksel kişi sayısı)
    kapasite = models.PositiveIntegerField(
        'Kapasite (Kişi)',
        default=30,
        help_text='Odanın maksimum kişi kapasitesi'
    )
    
    # Oda türü (opsiyonel)
    oda_turu = models.CharField(
        'Oda Türü',
        max_length=20,
        choices=OdaTuru.choices,
        default=OdaTuru.DERSLIK,
        blank=True
    )
    
    # Açıklama (opsiyonel)
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        help_text='Oda hakkında ek bilgiler'
    )
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'oda'
        verbose_name = 'Oda'
        verbose_name_plural = 'Odalar'
        ordering = ['sube', 'ad']
        constraints = [
            # Aynı şubede aynı oda adı olmaz
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'ad'],
                name='unique_oda_per_sube'
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'aktif_mi']),
            models.Index(fields=['oda_turu']),
        ]
    
    def __str__(self):
        return f"{self.ad} ({self.sube.ad})"
    
    @property
    def oda_turu_display(self):
        """Oda türü gösterimi"""
        return self.get_oda_turu_display() if self.oda_turu else '-'
