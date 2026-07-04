"""
Gider Ödeme (Expense Payment) Domain Model
Bir gider kaydına / taksitine yapılan ödemeyi temsil eder.

İş Kuralları:
- Ödeme kaydı oluştuğunda BakiyeHareketi üzerinden mali hesap bakiyesi düşer
- Ödeme iptali yapıldığında bakiye geri eklenir
- Bir ödeme tek bir taksiti hedefleyebilir veya doğrudan gider kaydını hedefleyebilir
- Dekont / makbuz dosyası eklenebilir
"""
from decimal import Decimal
from django.db import models

from apps.finans.constants.gider_types import OdemeDurum


class GiderOdeme(models.Model):
    """
    Gider Ödeme (Expense Payment)
    Tedarikçiye yapılan her bir ödeme hareketini kaydeder.

    Service tarafından oluşturulur → BakiyeHareketi → MaliHesap bakiye güncelleme.
    """

    # ─── İlişkiler ───────────────────────────────
    gider_kaydi = models.ForeignKey(
        'finans.GiderKaydi',
        on_delete=models.PROTECT,
        related_name='odemeler',
        verbose_name='Gider Kaydı',
    )
    gider_taksit = models.ForeignKey(
        'finans.GiderTaksit',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='odemeler',
        verbose_name='Gider Taksit',
        help_text='Hangi taksit için ödeme yapılıyor (opsiyonel)',
    )
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_odemeleri',
        verbose_name='Ödeme Yöntemi',
    )
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_odemeleri',
        verbose_name='Mali Hesap',
        help_text='Ödemenin çıkacağı hesap (bakiye mahsubunda boş kalabilir)',
    )

    # ─── Ödeme Bilgileri ─────────────────────────
    tutar = models.DecimalField(
        'Ödeme Tutarı',
        max_digits=15,
        decimal_places=2,
    )
    odeme_tarihi = models.DateField(
        'Ödeme Tarihi',
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )

    # ─── Belge ───────────────────────────────────
    dekont = models.FileField(
        'Dekont / Makbuz',
        upload_to='finans/gider_dekontlari/%Y/%m/',
        blank=True,
        null=True,
    )

    # ─── BakiyeHareketi Referansı ────────────────
    bakiye_hareketi_id = models.PositiveBigIntegerField(
        'Bakiye Hareketi ID',
        null=True,
        blank=True,
        help_text='İlgili BakiyeHareketi kaydının ID\'si (referans amaçlı)',
    )

    # ─── Durum ───────────────────────────────────
    durum = models.CharField(
        'Durum',
        max_length=15,
        choices=OdemeDurum.CHOICES,
        default=OdemeDurum.TAMAMLANDI,
    )
    bakiyeden_mahsup = models.BooleanField(
        'Bakiyeden Mahsup',
        default=False,
        help_text='True ise mali hesaptan para çıkmamış, cari bakiyeden düşülmüştür.',
    )

    # ─── İşlem Yapan ─────────────────────────────
    islem_yapan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='yapilan_gider_odemeleri',
        verbose_name='İşlemi Yapan',
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'finans_gider_odeme'
        verbose_name = 'Gider Ödeme'
        verbose_name_plural = 'Gider Ödemeler'
        ordering = ['-odeme_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['gider_kaydi', 'durum']),
            models.Index(fields=['odeme_tarihi']),
            models.Index(fields=['mali_hesap']),
        ]

    def __str__(self):
        return f"{self.gider_kaydi.cari_hesap} - {self.tutar} ₺ ({self.odeme_tarihi})"

    @property
    def iptal_mi(self):
        """Ödeme iptal edilmiş mi?"""
        return self.durum == OdemeDurum.IPTAL
