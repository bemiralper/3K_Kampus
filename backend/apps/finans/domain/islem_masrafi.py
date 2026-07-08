"""
İşlem Masrafı — ödeme/tahsilat sırasında girilen banka kesintileri.

Ana işlem (tahsilat, gelir tahsilat, gider ödeme) ile ilişkilidir;
otomatik oluşturulan gider kaydı + bakiye hareketi üzerinden muhasebeleşir.
"""
from decimal import Decimal

from django.db import models

from apps.finans.constants.kesinti_types import KesintiTuru


class IslemMasrafiKaynakTipi:
    TAHSILAT = 'tahsilat'
    GELIR_TAHSILAT = 'gelir_tahsilat'
    GIDER_ODEME = 'gider_odeme'
    CARI_ODEME = 'cari_odeme'
    HESAP_TRANSFERI = 'hesap_transferi'

    CHOICES = [
        (TAHSILAT, 'Sözleşme Tahsilatı'),
        (GELIR_TAHSILAT, 'Gelir Tahsilatı'),
        (GIDER_ODEME, 'Gider Ödemesi'),
        (CARI_ODEME, 'Serbest Cari Ödeme'),
        (HESAP_TRANSFERI, 'Hesap Transferi'),
    ]


class IslemMasrafiDurum:
    AKTIF = 'aktif'
    IPTAL = 'iptal'

    CHOICES = [
        (AKTIF, 'Aktif'),
        (IPTAL, 'İptal'),
    ]


class IslemMasrafi(models.Model):
    """Banka/POS işlem masrafı — ana finans hareketine bağlı kesinti."""

    kaynak_tip = models.CharField(
        'Kaynak Tipi',
        max_length=30,
        choices=IslemMasrafiKaynakTipi.CHOICES,
    )
    kaynak_id = models.PositiveIntegerField('Kaynak Kayıt ID')

    kesinti_turu = models.CharField(
        'Kesinti Türü',
        max_length=40,
        choices=KesintiTuru.CHOICES,
    )
    masraf_turu = models.ForeignKey(
        'finans.MasrafTuru',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='islem_masraflari',
        verbose_name='Masraf Türü',
    )
    kesinti_tutar = models.DecimalField(
        'Kesinti Tutarı',
        max_digits=15,
        decimal_places=2,
    )
    kesinti_aciklama = models.CharField(
        'Kesinti Açıklaması',
        max_length=500,
        blank=True,
        default='',
    )

    gider_kaydi = models.ForeignKey(
        'finans.GiderKaydi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='islem_masraflari',
        verbose_name='Gider Kaydı',
    )
    gider_odeme = models.ForeignKey(
        'finans.GiderOdeme',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='islem_masrafi',
        verbose_name='Gider Ödeme',
    )
    bakiye_hareketi = models.ForeignKey(
        'finans.BakiyeHareketi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='islem_masraflari',
        verbose_name='Bakiye Hareketi',
    )

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='islem_masraflari',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='islem_masraflari',
    )

    durum = models.CharField(
        'Durum',
        max_length=10,
        choices=IslemMasrafiDurum.CHOICES,
        default=IslemMasrafiDurum.AKTIF,
    )

    islem_yapan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='islem_masraflari',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finans_islem_masrafi'
        verbose_name = 'İşlem Masrafı'
        verbose_name_plural = 'İşlem Masrafları'
        indexes = [
            models.Index(fields=['kaynak_tip', 'kaynak_id']),
            models.Index(fields=['kurum', 'durum']),
        ]

    def __str__(self):
        return f'{self.get_kesinti_turu_display()} — {self.kesinti_tutar} ₺'

    @property
    def bakiye_tutar(self) -> int:
        """BakiyeHareketi için tamsayı TL tutarı."""
        return int(self.kesinti_tutar.to_integral_value())
