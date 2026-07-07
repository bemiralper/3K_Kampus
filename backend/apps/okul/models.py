"""Okul referans verisi — şube bazlı master data."""
from django.db import models
from django.db.models.functions import Lower


class _SubeScopedModel(models.Model):
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        verbose_name='Kurum',
        related_name='%(class)s_set',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        verbose_name='Şube',
        related_name='%(class)s_set',
    )

    class Meta:
        abstract = True


class Okul(_SubeScopedModel):
    """Şube kapsamlı okul tanımı."""

    ad = models.CharField('Okul Adı', max_length=200)
    okul_turu = models.CharField('Okul Türü', max_length=100, blank=True)
    il = models.CharField('İl', max_length=100, blank=True)
    ilce = models.CharField('İlçe', max_length=100, blank=True)
    not_metni = models.TextField('Not', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'okul'
        verbose_name = 'Okul'
        verbose_name_plural = 'Okullar'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(
                Lower('ad'),
                'sube',
                name='unique_okul_ad_sube_ci',
            ),
        ]
        indexes = [
            models.Index(fields=['sube', 'aktif_mi'], name='okul_sube_aktif_idx'),
            models.Index(fields=['sube', 'ad'], name='okul_sube_ad_idx'),
            models.Index(fields=['sube', 'okul_turu'], name='okul_sube_tur_idx'),
            models.Index(fields=['sube', 'il', 'ilce'], name='okul_sube_il_ilce_idx'),
        ]

    def __str__(self):
        return self.ad
