"""
Gider Taksit Domain Model
GiderKaydi'na bağlı ödeme planı kalemlerini temsil eder.

İş Kuralları:
- Taksitler GiderKaydi onaylandığında service tarafından otomatik oluşturulur
- Toplam taksit tutarları = GiderKaydi.net_tutar (kuruş farkı son taksitte ayarlanır)
- Her taksit bağımsız vade tarihine sahiptir
- Ödeme yapıldığında odenen_tutar güncellenir, kalan_tutar = tutar - odenen_tutar
"""
from decimal import Decimal
from django.db import models

from apps.finans.constants.gider_types import GiderTaksitDurum


class GiderTaksit(models.Model):
    """
    Gider Taksit (Installment)
    Bir gider kaydının ödeme planı kalemlerini tutar.
    Tek seferlik ödemelerde taksit_sayisi=1 ile tek kayıt oluşur.
    """

    # ─── İlişkiler ───────────────────────────────
    gider_kaydi = models.ForeignKey(
        'finans.GiderKaydi',
        on_delete=models.CASCADE,
        related_name='taksitler',
        verbose_name='Gider Kaydı',
    )

    # ─── Taksit Bilgileri ────────────────────────
    taksit_no = models.PositiveSmallIntegerField(
        'Taksit No',
        help_text='1-based sıra numarası',
    )
    vade_tarihi = models.DateField(
        'Vade Tarihi',
    )
    aciklama = models.CharField(
        'Açıklama',
        max_length=255,
        blank=True,
        default='',
        help_text='Manuel taksit planında satır açıklaması',
    )

    # ─── Tutar Bilgileri ─────────────────────────
    tutar = models.DecimalField(
        'Taksit Tutarı',
        max_digits=15,
        decimal_places=2,
    )
    odenen_tutar = models.DecimalField(
        'Ödenen Tutar',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
    )

    # ─── Durum ───────────────────────────────────
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.SET_NULL,
        related_name='gider_taksitleri',
        null=True,
        blank=True,
        verbose_name='Ödeme Yöntemi',
    )

    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=GiderTaksitDurum.CHOICES,
        default=GiderTaksitDurum.BEKLEMEDE,
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'finans_gider_taksit'
        verbose_name = 'Gider Taksit'
        verbose_name_plural = 'Gider Taksitler'
        ordering = ['gider_kaydi', 'taksit_no']
        constraints = [
            models.UniqueConstraint(
                fields=['gider_kaydi', 'taksit_no'],
                name='unique_gider_taksit_no',
            ),
        ]
        indexes = [
            models.Index(fields=['vade_tarihi', 'durum']),
        ]

    def __str__(self):
        return f"{self.gider_kaydi.cari_hesap} - Taksit {self.taksit_no}/{self.gider_kaydi.taksit_sayisi}"

    @property
    def kalan_tutar(self):
        """Kalan ödenecek tutar."""
        return self.tutar - self.odenen_tutar

    @property
    def odendi_mi(self):
        """Taksit tamamen ödendi mi?"""
        return self.odenen_tutar >= self.tutar
