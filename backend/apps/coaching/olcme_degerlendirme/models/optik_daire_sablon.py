"""Daire dizisi optik şablonu.

Koordinat editörünün OptikForm kayıtlarından ayrıdır. Geometri, yakınlaştırmadan
bağımsız olarak sayfa milimetresiyle ve sürümü belli bir belgede saklanır.
"""
from django.db import models


def bos_daire_belge():
    return {
        'surum': 'daire-dizisi-v1',
        'kalibrasyon': {'ofset_x_mm': 0, 'ofset_y_mm': 0, 'olcek': 1},
        'alanlar': [],
    }


class OptikDaireSablon(models.Model):
    """Yüklenen boş form ve parametrik daire dizileri / metin alanları."""

    SURUM = 'daire-dizisi-v1'

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='optik_daire_sablonlar',
        verbose_name='Kurum',
    )
    ad = models.CharField('Şablon adı', max_length=120)
    kaynak = models.FileField('Kaynak form', upload_to='olcme/optik-daire-sablonlar/')
    kaynak_tur = models.CharField('Kaynak türü', max_length=8)
    sayfa_no = models.PositiveSmallIntegerField('Sayfa', default=1)
    sayfa_sayisi = models.PositiveSmallIntegerField('Sayfa sayısı', default=1)
    sayfa_genislik_mm = models.DecimalField('Genişlik (mm)', max_digits=7, decimal_places=2, default=210)
    sayfa_yukseklik_mm = models.DecimalField('Yükseklik (mm)', max_digits=7, decimal_places=2, default=297)
    belge = models.JSONField('Belge', default=bos_daire_belge)
    yazici_profili = models.ForeignKey(
        'olcme_degerlendirme.OptikYaziciProfili',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sablonlar',
        verbose_name='Yazıcı profili',
    )
    aktif = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Optik daire şablonu'
        verbose_name_plural = 'Optik daire şablonları'
        ordering = ['ad', 'id']
        constraints = [
            models.UniqueConstraint(fields=['kurum', 'ad'], name='unique_optik_daire_sablon_ad'),
        ]

    def __str__(self):
        return self.ad
