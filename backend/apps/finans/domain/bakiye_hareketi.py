"""
Bakiye Hareketi Domain Model
Mali hesaplardaki her para giriş/çıkışının logu.

İş Kuralları:
- Her tahsilat, iade, gider ve devir işlemi otomatik hareket oluşturur
- Hareketler ASLA silinmez veya güncellenmez (immutable audit trail)
- Her hareket bir mali hesaba ve eğitim yılına bağlıdır
- Tutar her zaman pozitif Integer (TL), yön HareketYonu ile belirlenir
- kaynak_tip + kaynak_id ile orijinal işleme referans tutulur
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator

from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class BakiyeHareketi(models.Model):
    """
    Bakiye Hareketi — Mali hesaplardaki para akışının değişmez kaydı.

    Her tahsilat → GİRİŞ hareketi oluşturur.
    Her gider    → ÇIKIŞ hareketi oluşturur.
    Her devir    → Eski dönemde ÇIKIŞ, yeni dönemde GİRİŞ oluşturur.

    Örnek:
      Tahsilat #1234 → Merkez Kasa'ya 5.000 TL GİRİŞ
      Kira faturası  → Merkez Kasa'dan 8.000 TL ÇIKIŞ
    """

    # ─── İlişkiler ───────────────────────────────
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        related_name='hareketler',
        verbose_name='Mali Hesap',
        help_text='Hareketin gerçekleştiği kasa/banka hesabı',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='bakiye_hareketleri',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='bakiye_hareketleri',
        verbose_name='Şube',
        null=True, blank=True,
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.PROTECT,
        related_name='bakiye_hareketleri',
        verbose_name='Eğitim Yılı',
        null=True, blank=True,
    )

    # ─── Hareket Bilgileri ───────────────────────
    yon = models.CharField(
        'Hareket Yönü',
        max_length=10,
        choices=HareketYonu.CHOICES,
        help_text='Giriş (+) veya Çıkış (-)',
    )
    tutar = models.IntegerField(
        'Tutar (TL)',
        validators=[MinValueValidator(1)],
        help_text='Hareket tutarı — her zaman pozitif, yön ayrı alan',
    )
    kaynak = models.CharField(
        'Hareket Kaynağı',
        max_length=20,
        choices=HareketKaynagi.CHOICES,
        help_text='Bu hareketin nedeni (tahsilat, gider, devir vb.)',
    )

    # ─── Kaynak Referans (Generic FK yerine tip+id) ─
    kaynak_tip = models.CharField(
        'Kaynak Tipi',
        max_length=50,
        blank=True,
        default='',
        help_text='Orijinal işlemin model adı (tahsilat, gider_kaydi, donem_bakiye)',
    )
    kaynak_id = models.PositiveIntegerField(
        'Kaynak ID',
        null=True,
        blank=True,
        help_text='Orijinal işlemin PK değeri',
    )

    # ─── Bakiye Snapshot ─────────────────────────
    bakiye_oncesi = models.IntegerField(
        'İşlem Öncesi Bakiye',
        default=0,
        help_text='Bu hareket öncesi hesap bakiyesi',
    )
    bakiye_sonrasi = models.IntegerField(
        'İşlem Sonrası Bakiye',
        default=0,
        help_text='Bu hareket sonrası hesap bakiyesi',
    )

    # ─── Tarih & Açıklama ────────────────────────
    islem_tarihi = models.DateField(
        'İşlem Tarihi',
        help_text='Hareketin gerçekleştiği tarih',
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )
    islem_yapan = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bakiye_hareketleri',
        verbose_name='İşlemi Yapan',
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)

    class Meta:
        db_table = 'finans_bakiye_hareketi'
        verbose_name = 'Bakiye Hareketi'
        verbose_name_plural = 'Bakiye Hareketleri'
        ordering = ['-islem_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['mali_hesap', 'egitim_yili', 'islem_tarihi']),
            models.Index(fields=['kurum', 'sube', 'egitim_yili']),
            models.Index(fields=['kaynak', 'kaynak_tip', 'kaynak_id']),
            models.Index(fields=['islem_tarihi']),
            models.Index(fields=['yon']),
        ]

    def __str__(self):
        sign = '+' if self.yon == HareketYonu.GIRIS else '-'
        return (
            f"{self.mali_hesap.ad} | {sign}{self.tutar:,} TL | "
            f"{HareketKaynagi.get_label(self.kaynak)} | {self.islem_tarihi}"
        )

    @property
    def signed_tutar(self):
        """İşaretli tutar — GİRİŞ pozitif, ÇIKIŞ negatif."""
        return self.tutar if self.yon == HareketYonu.GIRIS else -self.tutar
