"""
Cari Etiket Domain Model
Cari hesapları serbestçe gruplamak/filtrelemek için kurum+şube kapsamlı etiketler.
"""
from django.db import models


class CariEtiketManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)


class CariEtiket(models.Model):
    """Cari hesaplara atanabilen renkli etiket."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='cari_etiketleri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='cari_etiketleri',
        null=True,
        blank=True,
        verbose_name='Şube',
    )
    ad = models.CharField('Etiket Adı', max_length=60)
    renk = models.CharField('Renk', max_length=20, blank=True, default='#0262a7')

    silindi_mi = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CariEtiketManager()
    tum_kayitlar = models.Manager()

    class Meta:
        app_label = 'finans'
        db_table = 'finans_cari_etiket'
        verbose_name = 'Cari Etiket'
        verbose_name_plural = 'Cari Etiketler'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_cari_etiket_kurum_sube_ad',
            ),
        ]

    def __str__(self):
        return self.ad
