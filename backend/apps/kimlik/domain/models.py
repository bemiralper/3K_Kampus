"""
Merkezi kişi (Kisi) modeli — kurum bazında tekil TC / telefon.
"""
from django.core.validators import RegexValidator
from django.db import models


class Kisi(models.Model):
    """
    Kurum içinde tekil kişi kaydı.
    Personel, Öğrenci ve Veli rolleri bu kayda referans verir.
    """

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='kisiler',
        verbose_name='Kurum',
    )

    tc_kimlik_no = models.CharField(
        'TC Kimlik No',
        max_length=11,
        blank=True,
        null=True,
        validators=[
            RegexValidator(
                regex=r'^\d{11}$',
                message='TC Kimlik No 11 haneli olmalıdır',
            )
        ],
    )

    telefon = models.CharField(
        'Telefon',
        max_length=20,
        blank=True,
        default='',
        help_text='Normalize edilmiş cep telefonu (0532...)',
    )

    ad = models.CharField('Ad', max_length=100)
    soyad = models.CharField('Soyad', max_length=100)
    dogum_tarihi = models.DateField('Doğum Tarihi', null=True, blank=True)

    CINSIYET_CHOICES = [
        ('E', 'Erkek'),
        ('K', 'Kadın'),
    ]
    cinsiyet = models.CharField(
        'Cinsiyet',
        max_length=1,
        choices=CINSIYET_CHOICES,
        null=True,
        blank=True,
    )

    email = models.EmailField('E-posta', blank=True, default='')
    adres = models.TextField('Adres', blank=True, default='')
    il = models.CharField('İl', max_length=50, blank=True, default='')
    ilce = models.CharField('İlçe', max_length=50, blank=True, default='')

    aktif_mi = models.BooleanField('Aktif', default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kimlik_kisi'
        verbose_name = 'Kişi'
        verbose_name_plural = 'Kişiler'
        ordering = ['soyad', 'ad']
        indexes = [
            models.Index(fields=['kurum', 'tc_kimlik_no'], name='kimlik_kisi_kurum_tc'),
            models.Index(fields=['kurum', 'telefon'], name='kimlik_kisi_kurum_tel'),
            models.Index(fields=['kurum', 'ad', 'soyad'], name='kimlik_kisi_kurum_ad'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'tc_kimlik_no'],
                name='unique_kurum_kisi_tc',
                condition=models.Q(tc_kimlik_no__isnull=False),
            ),
            models.UniqueConstraint(
                fields=['kurum', 'telefon'],
                name='unique_kurum_kisi_telefon',
                condition=~models.Q(telefon=''),
            ),
        ]

    def __str__(self):
        return f'{self.ad} {self.soyad}'

    @property
    def tam_ad(self):
        return f'{self.ad} {self.soyad}'
