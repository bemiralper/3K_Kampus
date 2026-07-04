"""
Gelir Kategorisi Domain Model
İki seviyeli kategori yapısı: Ana Kategori + Alt Kategori.
"""
from django.db import models
from django.utils import timezone


class GelirKategorisiManager(models.Manager):
    """Soft delete filtresi uygulayan custom manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        return super().get_queryset()

    def silinenler(self):
        return super().get_queryset().filter(silindi_mi=True)


class GelirKategorisi(models.Model):
    """
    Gelir Kategorisi (Income Category)
    İki seviyeli hiyerarşi: parent=None → Ana Kategori, parent!=None → Alt Kategori.
    """

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='gelir_kategorileri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='gelir_kategorileri',
        verbose_name='Şube',
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='alt_kategoriler',
        verbose_name='Üst Kategori',
    )

    ad = models.CharField('Kategori Adı', max_length=150)
    ikon = models.CharField('İkon', max_length=10, blank=True, default='')
    renk = models.CharField('Renk', max_length=7, blank=True, default='')
    aciklama = models.TextField('Açıklama', blank=True, default='')
    siralama = models.PositiveIntegerField('Sıralama', default=0)
    aktif_mi = models.BooleanField('Aktif', default=True)

    silindi_mi = models.BooleanField('Silindi', default=False, db_index=True)
    silinme_tarihi = models.DateTimeField('Silinme Tarihi', null=True, blank=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    objects = GelirKategorisiManager()
    all_objects = models.Manager()

    class Meta:
        app_label = 'finans'
        db_table = 'finans_gelir_kategorisi'
        verbose_name = 'Gelir Kategorisi'
        verbose_name_plural = 'Gelir Kategorileri'
        ordering = ['siralama', 'ad']
        constraints = [
            models.UniqueConstraint(
                fields=['sube', 'parent', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='unique_sube_gelir_kategori_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'parent', 'aktif_mi', 'silindi_mi']),
        ]

    def __str__(self):
        if self.parent:
            return f"{self.parent.ad} → {self.ad}"
        return self.ad

    @property
    def is_ana_kategori(self):
        return self.parent_id is None

    def soft_delete(self):
        now = timezone.now()
        if self.is_ana_kategori:
            GelirKategorisi.objects.filter(parent=self).update(
                silindi_mi=True,
                silinme_tarihi=now,
            )
        self.silindi_mi = True
        self.silinme_tarihi = now
        self.save(update_fields=['silindi_mi', 'silinme_tarihi'])
