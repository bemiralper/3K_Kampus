"""
Gelir Kaydı Domain Model
Kuruma ait gelir (fatura, hizmet bedeli vb.) kayıtları.
"""
from decimal import Decimal
from django.db import models
from django.utils import timezone

from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import KdvOrani


class GelirKaydiManager(models.Manager):
    """Silinmemiş kayıtları filtreler."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)


class GelirKaydi(models.Model):
    """
    Gelir Kaydı — kuruma ait gelir/satış faturası.
    CariHesap üzerinden müşteri bakiyesi takip edilir.
    """

    # ─── İlişkiler ─────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='gelir_kayitlari',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.PROTECT,
        related_name='gelir_kayitlari',
        verbose_name='Şube',
    )
    cari_hesap = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.PROTECT,
        related_name='gelir_kayitlari',
        verbose_name='Cari Hesap (Müşteri)',
    )
    gelir_kategorisi = models.ForeignKey(
        'finans.GelirKategorisi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Gelir Kategorisi',
    )
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Mali Hesap',
    )
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Ödeme Yöntemi',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Eğitim Yılı',
    )

    # ─── Finansman Tanımları (v2, opsiyonel) ───
    gelir_kaynagi = models.ForeignKey(
        'finans.GelirKaynagi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Gelir Kaynağı',
    )
    proje = models.ForeignKey(
        'finans.Proje',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Proje',
    )
    etiketler = models.ManyToManyField(
        'finans.CariEtiket',
        blank=True,
        related_name='gelir_kayitlari',
        verbose_name='Etiketler',
    )

    # ─── Fatura Bilgileri ──────────────────────
    fatura_no = models.CharField('Fatura No', max_length=50, blank=True, default='')
    fatura_tarihi = models.DateField('Fatura Tarihi')
    vade_tarihi = models.DateField('Vade Tarihi')
    aciklama = models.TextField('Açıklama', blank=True, default='')

    # ─── Tutar Bilgileri ───────────────────────
    brut_tutar = models.DecimalField('Brüt Tutar', max_digits=15, decimal_places=2)
    kdv_orani = models.IntegerField(
        'KDV Oranı (%)',
        choices=KdvOrani.CHOICES,
        default=KdvOrani.YIRMI,
    )
    kdv_mod = models.CharField(
        'KDV Modu',
        max_length=10,
        default='haric',
        help_text='haric | dahil | muaf — brüt/net hesaplama modu',
    )
    kdv_tutar = models.DecimalField('KDV Tutar', max_digits=15, decimal_places=2, default=0)
    net_tutar = models.DecimalField('Net Tutar (KDV dahil)', max_digits=15, decimal_places=2, default=0)
    tahsil_edilen = models.DecimalField('Tahsil Edilen', max_digits=15, decimal_places=2, default=0)

    # ─── Durum ─────────────────────────────────
    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=GelirDurum.CHOICES,
        default=GelirDurum.TASLAK,
    )

    # ─── Belge ─────────────────────────────────
    belge = models.FileField(
        'Belge',
        upload_to='finans/gelir_belgeleri/%Y/%m/',
        blank=True,
        null=True,
    )

    # ─── Audit ─────────────────────────────────
    olusturan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='olusturulan_gelirler',
        verbose_name='Oluşturan',
    )
    silindi_mi = models.BooleanField(default=False)
    silinme_tarihi = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ─── Manager ───────────────────────────────
    objects = GelirKaydiManager()
    tum_kayitlar = models.Manager()

    class Meta:
        app_label = 'finans'
        db_table = 'finans_gelir_kaydi'
        verbose_name = 'Gelir Kaydı'
        verbose_name_plural = 'Gelir Kayıtları'
        ordering = ['-fatura_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['kurum', '-fatura_tarihi']),
            models.Index(fields=['cari_hesap']),
            models.Index(fields=['durum']),
        ]

    def __str__(self):
        return f"{self.cari_hesap} — {self.fatura_no or 'Belgesiz'} ({self.net_tutar} ₺)"

    # ─── Properties ────────────────────────────

    @property
    def kalan_tutar(self):
        return self.net_tutar - self.tahsil_edilen

    @property
    def tahsilat_yuzdesi(self):
        if self.net_tutar <= 0:
            return Decimal('100.00')
        return (self.tahsil_edilen / self.net_tutar * 100).quantize(Decimal('0.01'))

    @property
    def duzenlenebilir_mi(self):
        if self.durum == GelirDurum.TASLAK:
            return True
        if self.durum == GelirDurum.ONAYLANDI and self.tahsil_edilen == Decimal('0'):
            return True
        return False

    @property
    def tahsil_edilebilir_mi(self):
        """Bu gelirden tahsilat yapılabilir mi?"""
        return self.durum in GelirDurum.TAHSIL_EDILEBILIR and self.kalan_tutar > Decimal('0')

    @property
    def iptal_edilebilir_mi(self):
        return self.durum not in [GelirDurum.IPTAL, GelirDurum.TAHSIL_EDILDI]

    @staticmethod
    def kdv_hesapla(brut_tutar, kdv_orani):
        kdv = (brut_tutar * Decimal(kdv_orani) / Decimal('100')).quantize(Decimal('0.01'))
        return kdv, brut_tutar + kdv
