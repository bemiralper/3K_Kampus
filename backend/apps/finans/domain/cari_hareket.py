"""
Cari Hareket Domain Model
Her finansal işlem (gider, gelir, ödeme, tahsilat) bir cari hareket kaydı oluşturur.
Borç/Alacak tabanlı çift taraflı muhasebe mantığı.
"""
from django.db import models

from apps.finans.constants.cari_types import CariHareketTuru, CariHareketYonu


class CariHareket(models.Model):
    """
    Cari Hareket — Borç/Alacak kayıt defteri.
    İmmutable: oluşturulduktan sonra güncellenemez, sadece ters kayıt yapılır.
    """

    # ─── İlişkiler ─────────────────────────────
    cari_hesap = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.CASCADE,
        related_name='hareketler',
        verbose_name='Cari Hesap',
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='cari_hareketler',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cari_hareketler',
        verbose_name='Şube',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cari_hareketler',
        verbose_name='Eğitim Yılı',
    )

    # ─── Hareket Bilgileri ─────────────────────
    islem_turu = models.CharField(
        'İşlem Türü',
        max_length=20,
        choices=CariHareketTuru.CHOICES,
    )
    yon = models.CharField(
        'Yön',
        max_length=10,
        choices=CariHareketYonu.CHOICES,
    )
    tutar = models.DecimalField('Tutar', max_digits=15, decimal_places=2)

    # ─── Bakiye Takibi ─────────────────────────
    borc_oncesi = models.DecimalField(
        'Borç Öncesi', max_digits=15, decimal_places=2, default=0
    )
    alacak_oncesi = models.DecimalField(
        'Alacak Öncesi', max_digits=15, decimal_places=2, default=0
    )
    borc_sonrasi = models.DecimalField(
        'Borç Sonrası', max_digits=15, decimal_places=2, default=0
    )
    alacak_sonrasi = models.DecimalField(
        'Alacak Sonrası', max_digits=15, decimal_places=2, default=0
    )

    # ─── Kaynak (Polimorfik Referans) ──────────
    kaynak_tip = models.CharField(
        'Kaynak Tipi',
        max_length=50,
        blank=True,
        default='',
        help_text='GiderKaydi, GelirKaydi, GiderOdeme, vb.',
    )
    kaynak_id = models.PositiveIntegerField(
        'Kaynak ID',
        null=True,
        blank=True,
    )

    # ─── Detaylar ──────────────────────────────
    aciklama = models.TextField('Açıklama', blank=True, default='')
    belge_no = models.CharField('Belge No', max_length=50, blank=True, default='')
    islem_tarihi = models.DateField('İşlem Tarihi')

    # ─── Audit ─────────────────────────────────
    islem_yapan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cari_hareketleri',
        verbose_name='İşlem Yapan',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'finans'
        db_table = 'finans_cari_hareket'
        verbose_name = 'Cari Hareket'
        verbose_name_plural = 'Cari Hareketler'
        ordering = ['-islem_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['cari_hesap', '-islem_tarihi']),
            models.Index(fields=['kurum', '-islem_tarihi']),
            models.Index(fields=['islem_turu']),
            models.Index(fields=['kaynak_tip', 'kaynak_id']),
        ]

    def __str__(self):
        yon_str = 'Borç' if self.yon == CariHareketYonu.BORC else 'Alacak'
        return f"{self.cari_hesap} | {yon_str} {self.tutar} ₺ | {self.islem_tarihi}"

    @property
    def bakiye_oncesi(self):
        """Net bakiye (borç - alacak) önceki."""
        return self.borc_oncesi - self.alacak_oncesi

    @property
    def bakiye_sonrasi(self):
        """Net bakiye (borç - alacak) sonraki."""
        return self.borc_sonrasi - self.alacak_sonrasi
