"""
Kurum bazlı puan katsayısı ayarları.
"""
from django.db import models


MANAGED_PUAN_YILLARI = (2024, 2025, 2026)
DEFAULT_PUAN_YILI = 2025


class OlcmePuanAyar(models.Model):
    """Kurum başına varsayılan puan yılı."""

    kurum = models.OneToOneField(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='olcme_puan_ayar',
        verbose_name='Kurum',
    )
    default_puan_yili = models.PositiveSmallIntegerField(
        'Varsayılan Puan Yılı',
        default=DEFAULT_PUAN_YILI,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Ölçme Puan Ayarı'
        verbose_name_plural = 'Ölçme Puan Ayarları'

    def __str__(self):
        return f'{self.kurum_id} → {self.default_puan_yili}'


class OlcmeKatsayiSeti(models.Model):
    """Kurum + yıl + tür için düzenlenebilir katsayı tablosu."""

    class Kind(models.TextChoices):
        TYT = 'TYT', 'TYT'
        AYT_SAY = 'AYT_SAY', 'AYT Sayısal'
        AYT_EA = 'AYT_EA', 'AYT Eşit Ağırlık'
        AYT_SOZ = 'AYT_SOZ', 'AYT Sözel'

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='olcme_katsayi_setleri',
        verbose_name='Kurum',
    )
    year = models.PositiveSmallIntegerField('Yıl')
    kind = models.CharField('Tür', max_length=12, choices=Kind.choices)
    coefficients = models.JSONField('Katsayılar', default=dict)
    is_published = models.BooleanField(
        'Resmi (ÖSYM açıklandı)',
        default=True,
        help_text='2026 gibi henüz açıklanmamış yıllar False kalır.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Ölçme Katsayı Seti'
        verbose_name_plural = 'Ölçme Katsayı Setleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'year', 'kind'],
                name='unique_olcme_katsayi_kurum_year_kind',
            ),
        ]

    def __str__(self):
        return f'{self.kurum_id} {self.year} {self.kind}'
