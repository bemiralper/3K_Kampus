"""
Egitim Tanimlari Domain Models
Enterprise DDD Pattern — şube bazlı katalog
"""
from django.db import models


class _SubeScopedModel(models.Model):
    """Kurum + şube kapsamlı tanım tabanı."""

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


class SinifSeviyesi(_SubeScopedModel):
    """
    Grade Level Model (Anaokulu, 1. Sınıf, 2. Sınıf, etc.)
    """
    ad = models.CharField('Sınıf Seviyesi', max_length=100)
    kod = models.CharField('Kod', max_length=20)
    sira = models.IntegerField('Sıra', default=0)
    ogrenci_no_prefix = models.CharField('Öğrenci No Prefix', max_length=2, blank=True)
    alanlar = models.ManyToManyField('Alan', verbose_name='Alanlar', blank=True, related_name='sinif_seviyeleri')
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'sinif_seviyesi'
        verbose_name = 'Sınıf Seviyesi'
        verbose_name_plural = 'Sınıf Seviyeleri'
        ordering = ['sira', 'ad']
        constraints = [
            models.UniqueConstraint(fields=['sube', 'kod'], name='unique_sinif_seviyesi_kod_sube'),
        ]

    def __str__(self):
        return self.ad


class Alan(_SubeScopedModel):
    """
    Study Field Model (Sayısal, Sözel, Eşit Ağırlık, etc.)
    """
    ad = models.CharField('Alan Adı', max_length=100)
    kod = models.CharField('Kod', max_length=20)
    sira = models.IntegerField('Sıra', default=0)
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'alan'
        verbose_name = 'Alan'
        verbose_name_plural = 'Alanlar'
        ordering = ['sira', 'ad']
        constraints = [
            models.UniqueConstraint(fields=['sube', 'kod'], name='unique_alan_kod_sube'),
        ]

    def __str__(self):
        return self.ad


class Ders(_SubeScopedModel):
    """
    Course/Subject Model (Matematik, Türkçe, İngilizce, etc.)
    """
    ad = models.CharField('Ders Adı', max_length=100)
    kod = models.CharField('Kod', max_length=20)

    sinif_seviyeleri = models.ManyToManyField(
        SinifSeviyesi,
        related_name='dersler',
        verbose_name='Sınıf Seviyeleri',
        blank=True,
        help_text='Bu ders hangi sınıf seviyelerinde okutulur?',
    )
    alanlar = models.ManyToManyField(
        Alan,
        related_name='dersler',
        verbose_name='Alanlar',
        blank=True,
        help_text='Bu ders hangi alanlara aittir?',
    )

    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'ders'
        verbose_name = 'Ders'
        verbose_name_plural = 'Dersler'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['sube', 'kod'], name='unique_ders_kod_sube'),
        ]

    def __str__(self):
        return self.ad


class Brans(_SubeScopedModel):
    """
    Branch/Department Model — öğretmen uzmanlık alanları
    """
    ad = models.CharField('Branş Adı', max_length=100)
    kod = models.CharField('Kod', max_length=20)
    aciklama = models.TextField('Açıklama', blank=True)
    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'brans'
        verbose_name = 'Branş'
        verbose_name_plural = 'Branşlar'
        ordering = ['ad']
        constraints = [
            models.UniqueConstraint(fields=['sube', 'kod'], name='unique_brans_kod_sube'),
        ]

    def __str__(self):
        return self.ad
