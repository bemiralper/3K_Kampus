"""
Cari Hesap Dosya Modeli
Cariye ait sözleşme, fatura, teklif vb. belgeler.
"""
from django.db import models


class CariDosya(models.Model):
    """Cari hesaba ait yüklenen dosyalar."""

    DOSYA_TURLERI = [
        ('sozlesme', 'Sözleşme'),
        ('fatura', 'Fatura'),
        ('teklif', 'Teklif'),
        ('dekont', 'Dekont / Makbuz'),
        ('diger', 'Diğer'),
    ]

    cari_hesap = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.CASCADE,
        related_name='dosyalar',
        verbose_name='Cari Hesap',
    )
    kurum_id = models.PositiveIntegerField('Kurum ID')

    dosya = models.FileField(
        'Dosya',
        upload_to='finans/cari_dosyalar/%Y/%m/',
    )
    dosya_adi = models.CharField('Dosya Adı', max_length=255)
    dosya_turu = models.CharField(
        'Dosya Türü',
        max_length=20,
        choices=DOSYA_TURLERI,
        default='diger',
    )
    aciklama = models.TextField('Açıklama', blank=True, default='')
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
        db_table = 'finans_cari_dosya'
        ordering = ['-created_at']
        verbose_name = 'Cari Dosya'
        verbose_name_plural = 'Cari Dosyalar'

    def __str__(self):
        return f'{self.dosya_adi} ({self.get_dosya_turu_display()})'

    @property
    def dosya_url(self):
        if self.dosya:
            return self.dosya.url
        return None

    @property
    def dosya_boyutu_fmt(self):
        """İnsan okunabilir dosya boyutu."""
        b = self.dosya_boyutu
        if b < 1024:
            return f'{b} B'
        elif b < 1024 * 1024:
            return f'{b / 1024:.1f} KB'
        else:
            return f'{b / (1024 * 1024):.1f} MB'
