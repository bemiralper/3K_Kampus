"""
Cari Kayıtlı Görünüm Domain Model
Kullanıcıların kaydettiği filtre + kolon kombinasyonları (saved views).
"""
from django.db import models


class CariKayitliGorunum(models.Model):
    """Kullanıcıya özel kaydedilmiş liste görünümü (filtre + kolon düzeni)."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='cari_gorunumleri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='cari_gorunumleri',
        null=True,
        blank=True,
        verbose_name='Şube',
    )
    kullanici = models.ForeignKey(
        'auth.User',
        on_delete=models.CASCADE,
        related_name='cari_gorunumleri',
        verbose_name='Kullanıcı',
    )
    ad = models.CharField('Görünüm Adı', max_length=100)
    # Serbest JSON: filtreler, kolon sırası/görünürlüğü, sıralama, görünüm modu
    config = models.JSONField('Yapılandırma', default=dict, blank=True)
    varsayilan_mi = models.BooleanField('Varsayılan', default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'finans'
        db_table = 'finans_cari_kayitli_gorunum'
        verbose_name = 'Cari Kayıtlı Görünüm'
        verbose_name_plural = 'Cari Kayıtlı Görünümler'
        ordering = ['ad']
        indexes = [
            models.Index(fields=['kurum', 'kullanici']),
        ]

    def __str__(self):
        return self.ad
