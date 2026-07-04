"""
Gelir Tahsilat (Revenue Collection) Domain Model
Bir gelir kaydına yapılan tahsilat (ödeme alma) hareketini temsil eder.

İş Kuralları:
- Tahsilat kaydı oluştuğunda BakiyeHareketi üzerinden mali hesap bakiyesi artar
- Tahsilat iptali yapıldığında bakiye geri düşer
- Dekont / makbuz dosyası eklenebilir
"""
from django.db import models

from apps.finans.constants.gider_types import OdemeDurum


class GelirTahsilat(models.Model):
    """
    Gelir Tahsilat (Revenue Collection)
    Müşteriden yapılan her bir tahsilat hareketini kaydeder.

    Service tarafından oluşturulur → BakiyeHareketi → MaliHesap bakiye güncelleme.
    """

    # ─── İlişkiler ───────────────────────────────
    gelir_kaydi = models.ForeignKey(
        'finans.GelirKaydi',
        on_delete=models.PROTECT,
        related_name='tahsilatlar',
        verbose_name='Gelir Kaydı',
    )
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gelir_tahsilatlari',
        verbose_name='Ödeme Yöntemi',
    )
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gelir_tahsilatlari',
        verbose_name='Mali Hesap',
        help_text='Tahsilatın yatırılacağı hesap (kasa/banka)',
    )

    # ─── Tahsilat Bilgileri ──────────────────────
    tutar = models.DecimalField(
        'Tahsilat Tutarı',
        max_digits=15,
        decimal_places=2,
    )
    tahsilat_tarihi = models.DateField(
        'Tahsilat Tarihi',
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )

    # ─── Belge ───────────────────────────────────
    dekont = models.FileField(
        'Dekont / Makbuz',
        upload_to='finans/gelir_dekontlari/%Y/%m/',
        blank=True,
        null=True,
    )

    # ─── BakiyeHareketi Referansı ────────────────
    bakiye_hareketi_id = models.PositiveBigIntegerField(
        'Bakiye Hareketi ID',
        null=True,
        blank=True,
        help_text="İlgili BakiyeHareketi kaydının ID'si (referans amaçlı)",
    )

    # ─── Durum ───────────────────────────────────
    durum = models.CharField(
        'Durum',
        max_length=15,
        choices=OdemeDurum.CHOICES,
        default=OdemeDurum.TAMAMLANDI,
    )

    # ─── İşlem Yapan ─────────────────────────────
    islem_yapan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='yapilan_gelir_tahsilatlari',
        verbose_name='İşlemi Yapan',
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'finans_gelir_tahsilat'
        verbose_name = 'Gelir Tahsilat'
        verbose_name_plural = 'Gelir Tahsilatlar'
        ordering = ['-tahsilat_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['gelir_kaydi', 'durum']),
            models.Index(fields=['tahsilat_tarihi']),
            models.Index(fields=['mali_hesap']),
        ]

    def __str__(self):
        return f"{self.gelir_kaydi.cari_hesap} - {self.tutar} ₺ ({self.tahsilat_tarihi})"

    @property
    def iptal_mi(self):
        return self.durum == OdemeDurum.IPTAL
