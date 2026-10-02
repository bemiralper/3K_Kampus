"""Tahsilata bağlı e-fatura / e-arşiv taslağı."""
import uuid

from django.conf import settings
from django.db import models


class EBelgeDurum:
    UYUMSOFT_TASLAK = 'uyumsoft_taslak'
    HATA = 'hata'

    CHOICES = [
        (UYUMSOFT_TASLAK, 'Uyumsoft taslağı'),
        (HATA, 'Hata'),
    ]


class EBelgeTipi:
    EFATURA = 'efatura'
    EARSIV = 'earsiv'

    CHOICES = [
        (EFATURA, 'e-Fatura'),
        (EARSIV, 'e-Arşiv'),
    ]


class EBelge(models.Model):
    tahsilat = models.OneToOneField(
        'odeme_takip.Tahsilat',
        on_delete=models.PROTECT,
        related_name='e_belge',
        verbose_name='Tahsilat',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='e_belgeler',
        verbose_name='Kurum',
    )
    ettn = models.UUIDField('ETTN', default=uuid.uuid4, unique=True)
    belge_tipi = models.CharField('Belge tipi', max_length=20, choices=EBelgeTipi.CHOICES)
    durum = models.CharField('Durum', max_length=30, choices=EBelgeDurum.CHOICES, default=EBelgeDurum.HATA)
    yerel_no = models.CharField('Yerel belge no', max_length=20, blank=True, default='')
    uyumsoft_no = models.CharField('Uyumsoft belge no', max_length=32, blank=True, default='')
    alici_unvan = models.CharField('Alıcı', max_length=200, blank=True, default='')
    alici_vkn = models.CharField('Alıcı VKN/TCKN', max_length=11, blank=True, default='')
    alici_alias = models.CharField('Alıcı etiketi', max_length=200, blank=True, default='')
    satirlar = models.JSONField('Satırlar', default=list, blank=True)
    matrah = models.DecimalField('Matrah', max_digits=12, decimal_places=2, default=0)
    kdv_tutari = models.DecimalField('KDV', max_digits=12, decimal_places=2, default=0)
    odenecek = models.DecimalField('Ödenecek', max_digits=12, decimal_places=2, default=0)
    hata_mesaji = models.TextField('Hata', blank=True, default='')
    gonderen = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gonderdigi_e_belgeler',
        verbose_name='Gönderen',
    )
    gonderim_tarihi = models.DateTimeField('Gönderim', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finans_e_belge'
        verbose_name = 'E-Belge'
        verbose_name_plural = 'E-Belgeler'

    def __str__(self):
        return f'{self.tahsilat_id} — {self.belge_tipi}'
