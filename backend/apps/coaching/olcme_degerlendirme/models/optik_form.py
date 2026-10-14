"""Kuruma özel optik form şablonu ve üzerine basılacak alanlar."""
from django.db import models


class OptikForm(models.Model):
    """Boş optik PDF ve sayfa geometrisi. Alanlar milimetre cinsinden, sayfanın üstünden."""

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='optik_formlar',
        verbose_name='Kurum',
    )
    ad = models.CharField('Form adı', max_length=120)
    preset_kod = models.CharField(
        'Hazır yerleşim',
        max_length=40,
        blank=True,
        help_text='Örn. OPTIK-129. Boşsa yerleşim elle girilmiştir.',
    )
    pdf = models.FileField('Boş form PDF', upload_to='olcme/optik-formlar/')
    sayfa_genislik_mm = models.DecimalField('Genişlik (mm)', max_digits=6, decimal_places=2, default=210)
    sayfa_yukseklik_mm = models.DecimalField('Yükseklik (mm)', max_digits=6, decimal_places=2, default=297)
    sol_bas_mm = models.DecimalField('Sol baş (mm)', max_digits=6, decimal_places=2, default=0)
    ust_bas_mm = models.DecimalField('Üst baş (mm)', max_digits=6, decimal_places=2, default=0)
    sol_pay_mm = models.DecimalField('Sol pay (mm)', max_digits=6, decimal_places=2, default=0)
    sag_pay_mm = models.DecimalField('Sağ pay (mm)', max_digits=6, decimal_places=2, default=0)
    ust_pay_mm = models.DecimalField('Üst pay (mm)', max_digits=6, decimal_places=2, default=0)
    alt_pay_mm = models.DecimalField('Alt pay (mm)', max_digits=6, decimal_places=2, default=0)
    balon_cap_mm = models.DecimalField('Balon çapı (mm)', max_digits=5, decimal_places=2, default=0)
    aktif = models.BooleanField('Aktif', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Optik form'
        verbose_name_plural = 'Optik formlar'
        ordering = ['ad', 'id']
        constraints = [
            models.UniqueConstraint(fields=['kurum', 'ad'], name='unique_optik_form_ad'),
        ]

    def __str__(self):
        return self.ad


class OptikFormAlani(models.Model):
    """Form üzerindeki bir yazı kutusu veya balon ızgarası.

    Metinde Y, sayfanın üst kenarından harfin oturduğu çizgiye kadardır.
    Balonda X/Y ilk dairenin merkezidir; genişlik sütun aralığı, yükseklik satır aralığıdır.
    """

    class Tur(models.TextChoices):
        METIN = 'metin', 'Metin'
        BALON = 'balon', 'Balon'

    form = models.ForeignKey(
        OptikForm,
        on_delete=models.CASCADE,
        related_name='alanlar',
        verbose_name='Form',
    )
    kod = models.CharField('Kod', max_length=40)
    etiket = models.CharField('Etiket', max_length=80)
    tur = models.CharField('Tür', max_length=10, choices=Tur.choices, default=Tur.METIN)
    x_mm = models.DecimalField('X (mm)', max_digits=6, decimal_places=2)
    y_mm = models.DecimalField('Y (mm)', max_digits=6, decimal_places=2)
    genislik_mm = models.DecimalField('Genişlik (mm)', max_digits=6, decimal_places=2)
    yukseklik_mm = models.DecimalField('Yükseklik (mm)', max_digits=6, decimal_places=2, default=4)
    punto = models.DecimalField('Punto', max_digits=4, decimal_places=1, default=8)
    sablon = models.CharField(
        'Şablon',
        max_length=200,
        blank=True,
        help_text='Örn. #ad#, #sinif_sube#, #salon#',
    )
    karakter_kumesi = models.CharField(
        'Karakter kümesi',
        max_length=120,
        blank=True,
        help_text='Balonda satır sırası. Rakam 0123456789, harf ABCÇ…, seçenek 9,10,11,12,M.',
    )
    sutun_sayisi = models.PositiveSmallIntegerField(
        'Sütun sayısı',
        default=1,
        help_text='Balon ızgarasında yan yana karakter sayısı. Metin alanında kullanılmaz.',
    )
    aktif = models.BooleanField('Aktif', default=True)
    sira = models.PositiveSmallIntegerField('Sıra', default=0)

    class Meta:
        app_label = 'olcme_degerlendirme'
        verbose_name = 'Optik form alanı'
        verbose_name_plural = 'Optik form alanları'
        ordering = ['sira', 'id']
        constraints = [
            models.UniqueConstraint(fields=['form', 'kod'], name='unique_optik_form_alani_kod'),
        ]

    def __str__(self):
        return f'{self.form_id} {self.kod}'
