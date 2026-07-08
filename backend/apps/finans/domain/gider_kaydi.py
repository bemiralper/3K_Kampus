"""
Gider Kaydı (Expense Record) Domain Model
Bir cari hesaba ait fatura / gider belgesini temsil eder.

İş Kuralları:
- Bir GiderKaydi, N taksit (GiderTaksit) oluşturur (tek seferde = 1 taksit)
- KDV hesaplama: net_tutar = brut_tutar + kdv_tutar
- Durum akışı: taslak → onay_bekliyor → onaylandi → kismi_odendi → odendi
- İptal: sadece taslak/onay_bekliyor/onaylandi durumlarından olabilir
- Dönemsel (tekrarlayan) giderler: tekrar_mi + tekrar_sikligi
"""
from decimal import Decimal
from django.db import models

from apps.finans.constants.gider_types import (
    GiderDurum,
    KdvOrani,
    TekrarSikligi,
)


class GiderKaydiManager(models.Manager):
    """Soft delete filtresi uygulayan custom manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        return super().get_queryset()

    def silinenler(self):
        return super().get_queryset().filter(silindi_mi=True)


class GiderKaydi(models.Model):
    """
    Gider Kaydı (Expense Record)
    Bir cari hesaba ait fatura / gider belgesini temsil eder.

    Ana workflow:
    1. Kayıt oluştur (TASLAK)
    2. Onaya gönder (ONAY_BEKLİYOR)
    3. Onayla → Taksitler otomatik oluşur (ONAYLANDI)
    4. Ödeme yap → (KISMI_ODENDI → ODENDI)
    """

    # ─── İlişkiler ───────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='gider_kayitlari',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Şube',
    )
    cari_hesap = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Cari Hesap',
        help_text='Giderin ait olduğu cari hesap',
    )
    gider_kategorisi = models.ForeignKey(
        'finans.GiderKategorisi',
        on_delete=models.PROTECT,
        related_name='gider_kayitlari',
        verbose_name='Gider Kategorisi',
    )
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Mali Hesap',
        help_text='Varsayılan ödeme hesabı',
    )
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Ödeme Yöntemi',
        help_text='Varsayılan ödeme yöntemi',
    )
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Eğitim Yılı',
        help_text='İlişkili eğitim dönemi',
    )

    # ─── Finansman Tanımları (v2, opsiyonel) ─────
    maliyet_merkezi = models.ForeignKey(
        'finans.MaliyetMerkezi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Maliyet/Gider Merkezi',
    )
    proje = models.ForeignKey(
        'finans.Proje',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Proje',
    )
    etiketler = models.ManyToManyField(
        'finans.CariEtiket',
        blank=True,
        related_name='gider_kayitlari',
        verbose_name='Etiketler',
    )

    # ─── Fatura Bilgileri ────────────────────────
    fatura_no = models.CharField(
        'Fatura / Belge No',
        max_length=50,
        blank=True,
        default='',
    )
    fatura_tarihi = models.DateField(
        'Fatura Tarihi',
    )
    vade_tarihi = models.DateField(
        'Vade Tarihi',
        help_text='Son ödeme tarihi',
    )
    aciklama = models.TextField(
        'Açıklama',
        blank=True,
        default='',
    )

    # ─── Tutar Bilgileri ─────────────────────────
    brut_tutar = models.DecimalField(
        'Brüt Tutar',
        max_digits=15,
        decimal_places=2,
        help_text='KDV hariç tutar',
    )
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
    kdv_tutar = models.DecimalField(
        'KDV Tutarı',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Otomatik hesaplanır',
    )
    net_tutar = models.DecimalField(
        'Net Tutar (KDV Dahil)',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='brut_tutar + kdv_tutar',
    )
    odenen_toplam = models.DecimalField(
        'Ödenen Toplam',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Yapılmış ödemelerin toplamı',
    )

    # ─── Taksit Ayarları ─────────────────────────
    taksit_sayisi = models.PositiveSmallIntegerField(
        'Taksit Sayısı',
        default=1,
        help_text='1 = peşin, N = N taksit',
    )
    taksit_plani_json = models.JSONField(
        'Özel Taksit Planı',
        null=True,
        blank=True,
        default=None,
        help_text='Kullanıcının manuel ayarladığı taksit planı. [{taksit_no, vade_tarihi, tutar}, ...]',
    )

    # ─── Tekrarlayan Gider ───────────────────────
    tekrar_mi = models.BooleanField(
        'Tekrarlayan Gider',
        default=False,
        help_text='Periyodik olarak tekrar eden gider mi?',
    )
    tekrar_sikligi = models.CharField(
        'Tekrar Sıklığı',
        max_length=15,
        choices=TekrarSikligi.CHOICES,
        blank=True,
        default='',
    )
    tekrar_bitis_tarihi = models.DateField(
        'Tekrar Bitiş Tarihi',
        null=True,
        blank=True,
        help_text='Tekrarlayan gider için son tarih',
    )

    # ─── Durum ───────────────────────────────────
    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=GiderDurum.CHOICES,
        default=GiderDurum.TASLAK,
    )

    # ─── Belge ───────────────────────────────────
    belge = models.FileField(
        'Fatura / Belge',
        upload_to='finans/gider_belgeleri/%Y/%m/',
        blank=True,
        null=True,
    )

    # ─── Onay Bilgileri ──────────────────────────
    olusturan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='olusturulan_giderler',
        verbose_name='Oluşturan',
    )
    onaylayan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='onaylanan_giderler',
        verbose_name='Onaylayan',
    )
    onay_tarihi = models.DateTimeField(
        'Onay Tarihi',
        null=True,
        blank=True,
    )

    # ─── Soft Delete ─────────────────────────────
    silindi_mi = models.BooleanField(
        'Silindi',
        default=False,
        db_index=True,
    )
    silinme_tarihi = models.DateTimeField(
        'Silinme Tarihi',
        null=True,
        blank=True,
    )

    # ─── Zaman Damgaları ─────────────────────────
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    # ─── Managers ────────────────────────────────
    objects = GiderKaydiManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'finans_gider_kaydi'
        verbose_name = 'Gider Kaydı'
        verbose_name_plural = 'Gider Kayıtları'
        ordering = ['-fatura_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['kurum', 'durum', 'silindi_mi']),
            models.Index(fields=['cari_hesap', 'durum']),
            models.Index(fields=['fatura_tarihi']),
            models.Index(fields=['vade_tarihi']),
            models.Index(fields=['gider_kategorisi']),
        ]

    def __str__(self):
        return f"{self.cari_hesap} - {self.fatura_no or 'Belgesiz'} ({self.net_tutar} ₺)"

    @property
    def kalan_tutar(self):
        """Kalan borç tutarı."""
        return self.net_tutar - self.odenen_toplam

    @property
    def odeme_yuzdesi(self):
        """Ödeme ilerleme yüzdesi."""
        if self.net_tutar <= 0:
            return Decimal('0')
        return (self.odenen_toplam / self.net_tutar * 100).quantize(Decimal('0.01'))

    @property
    def odenebilir_mi(self):
        """Bu gidere ödeme yapılabilir mi?"""
        return self.durum in GiderDurum.ODENEBILIR

    @property
    def iptal_edilebilir_mi(self):
        """Bu gider iptal edilebilir mi?"""
        return self.durum in GiderDurum.IPTAL_EDILEBILIR

    @property
    def duzenlenebilir_mi(self):
        """Bu gider düzenlenebilir mi?"""
        if self.durum == GiderDurum.TASLAK:
            return True
        if self.durum == GiderDurum.ONAYLANDI and self.odenen_toplam == Decimal('0'):
            return True
        return False

    def kdv_hesapla(self):
        """Brüt tutar ve KDV oranından otomatik hesaplama yapar."""
        self.kdv_tutar = (self.brut_tutar * Decimal(self.kdv_orani) / Decimal('100')).quantize(Decimal('0.01'))
        self.net_tutar = self.brut_tutar + self.kdv_tutar
