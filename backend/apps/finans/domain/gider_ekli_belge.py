"""
Gider ekli belge — tedarikçiden alınan gerçek fatura / fiş.
Sistemin oluşturduğu Gider İşlem Belgesi ile karıştırılmamalıdır.
"""
from django.db import models


class GiderEkliBelge(models.Model):
    """Tedarikçi faturası, fiş veya dekont eki."""

    DOSYA_TURLERI = [
        ('fatura_fis', 'Ekli Fatura / Fiş'),
        ('dekont', 'Dekont'),
        ('diger', 'Diğer'),
    ]

    gider_kaydi = models.ForeignKey(
        'finans.GiderKaydi',
        on_delete=models.CASCADE,
        related_name='ekli_belgeler',
        verbose_name='Gider Kaydı',
    )
    dosya = models.FileField(
        'Dosya',
        upload_to='finans/gider_ekleri/%Y/%m/',
    )
    dosya_adi = models.CharField('Dosya Adı', max_length=255)
    dosya_turu = models.CharField(
        'Dosya Türü',
        max_length=20,
        choices=DOSYA_TURLERI,
        default='fatura_fis',
    )
    aciklama = models.CharField('Açıklama', max_length=255, blank=True, default='')
    dosya_boyutu = models.PositiveIntegerField('Boyut (byte)', default=0)
    yukleyen = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name='Yükleyen',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'finans'
        db_table = 'finans_gider_ekli_belge'
        ordering = ['-created_at']
        verbose_name = 'Gider Ekli Belge'
        verbose_name_plural = 'Gider Ekli Belgeler'

    def __str__(self):
        return f'{self.dosya_adi} ({self.get_dosya_turu_display()})'

    @property
    def dosya_url(self):
        if self.dosya:
            return self.dosya.url
        return None

    @property
    def dosya_boyutu_fmt(self):
        b = self.dosya_boyutu
        if b < 1024:
            return f'{b} B'
        if b < 1024 * 1024:
            return f'{b / 1024:.1f} KB'
        return f'{b / (1024 * 1024):.1f} MB'
