"""
Cari Hesap Domain Model
Müşteri, tedarikçi veya karma (hem müşteri hem tedarikçi) cari hesapları.
"""
from django.db import models
from django.utils import timezone

from apps.finans.constants.cari_types import CariHesapTuru


class CariHesapManager(models.Manager):
    """Silinmemiş kayıtları filtreler."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)


class CariHesap(models.Model):
    """
    Cari Hesap — Tedarikçi/Müşteri/Karma cari defteri.
    Borç/alacak bakiyelerini atomik olarak takip eder.
    """

    # ─── İlişkiler ─────────────────────────────
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='cari_hesaplar',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='cari_hesaplar',
        verbose_name='Şube',
    )

    # ─── Temel Bilgiler ────────────────────────
    unvan = models.CharField('Ünvan / Ad Soyad', max_length=300)
    kisa_ad = models.CharField('Kısa Ad', max_length=100, blank=True, default='')
    hesap_turu = models.CharField(
        'Hesap Türü',
        max_length=20,
        choices=CariHesapTuru.CHOICES,
        default=CariHesapTuru.TEDARIKCI,
    )
    hesap_kodu = models.CharField(
        'Hesap Kodu',
        max_length=50,
        blank=True,
        default='',
        help_text='Muhasebe entegrasyonu için (opsiyonel)',
    )

    # ─── Gider / Gelir Kategorileri (M2M) ──────
    gider_kategorileri = models.ManyToManyField(
        'finans.GiderKategorisi',
        blank=True,
        related_name='cari_hesaplar',
        verbose_name='İlişkili Gider Kategorileri',
    )
    gelir_kategorileri = models.ManyToManyField(
        'finans.GelirKategorisi',
        blank=True,
        related_name='cari_hesaplar',
        verbose_name='İlişkili Gelir Kategorileri',
    )

    # ─── Vergi Bilgileri ───────────────────────
    vergi_no = models.CharField('Vergi No / TC', max_length=20, blank=True, default='')
    vergi_dairesi = models.CharField('Vergi Dairesi', max_length=100, blank=True, default='')

    # ─── İletişim ──────────────────────────────
    telefon = models.CharField('Telefon', max_length=20, blank=True, default='')
    email = models.EmailField('E-posta', blank=True, default='')
    adres = models.TextField('Adres', blank=True, default='')
    il = models.CharField('İl', max_length=50, blank=True, default='')
    ilce = models.CharField('İlçe', max_length=50, blank=True, default='')
    yetkili_kisi = models.CharField('Yetkili Kişi', max_length=200, blank=True, default='')
    yetkili_telefon = models.CharField('Yetkili Telefon', max_length=20, blank=True, default='')

    # ─── Banka Bilgileri ───────────────────────
    banka_adi = models.CharField('Banka Adı', max_length=100, blank=True, default='')
    iban = models.CharField('IBAN', max_length=34, blank=True, default='')
    hesap_sahibi = models.CharField('Hesap Sahibi', max_length=200, blank=True, default='')

    # ─── Sınıflandırma & Risk (v2) ─────────────
    kategori = models.CharField('Kategori', max_length=100, blank=True, default='')
    risk_limiti = models.DecimalField(
        'Risk Limiti',
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text='0 = limit yok. Açık bakiye bu limiti aşarsa risk uyarısı verilir.',
    )
    varsayilan_vade_gun = models.PositiveIntegerField(
        'Varsayılan Vade (gün)',
        default=0,
        help_text='İşlemler için varsayılan vade süresi (gün).',
    )
    para_birimi = models.CharField('Para Birimi', max_length=3, default='TRY')
    etiketler = models.ManyToManyField(
        'finans.CariEtiket',
        blank=True,
        related_name='cari_hesaplar',
        verbose_name='Etiketler',
    )

    # ─── Cari Bakiye ───────────────────────────
    toplam_borc = models.DecimalField(
        'Toplam Borç',
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text='Karşı tarafın bize toplam borcu',
    )
    toplam_alacak = models.DecimalField(
        'Toplam Alacak',
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text='Bizim karşı tarafa toplam borcumuz',
    )

    # ─── Notlar ────────────────────────────────
    notlar = models.TextField('Notlar', blank=True, default='')

    # ─── Durum & Audit ─────────────────────────
    aktif_mi = models.BooleanField('Aktif', default=True)
    silindi_mi = models.BooleanField(default=False)
    silinme_tarihi = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ─── Manager ───────────────────────────────
    objects = CariHesapManager()
    tum_kayitlar = models.Manager()

    class Meta:
        app_label = 'finans'
        db_table = 'finans_cari_hesap'
        verbose_name = 'Cari Hesap'
        verbose_name_plural = 'Cari Hesaplar'
        ordering = ['unvan']
        indexes = [
            models.Index(fields=['kurum', 'sube', 'hesap_turu']),
            models.Index(fields=['kurum', 'sube', 'aktif_mi']),
            models.Index(fields=['sube', 'vergi_no']),
        ]

    def __str__(self):
        return self.gorunen_ad

    # ─── Properties ────────────────────────────

    @property
    def gorunen_ad(self):
        """Kısa ad varsa onu, yoksa ünvanı döner."""
        return self.kisa_ad or self.unvan

    @property
    def bakiye(self):
        """
        Net bakiye.
        Pozitif = karşı tarafın bize borcu var (alacaklıyız).
        Negatif = bizim karşı tarafa borcumuz var (borçluyuz).
        """
        return self.toplam_borc - self.toplam_alacak

    @property
    def bakiye_durumu(self):
        """Bakiye durum metni."""
        b = self.bakiye
        if b > 0:
            return 'alacakli'  # bize borçlu
        elif b < 0:
            return 'borclu'   # biz borçluyuz
        return 'dengede'

    @property
    def hesap_turu_display(self):
        return dict(CariHesapTuru.CHOICES).get(self.hesap_turu, self.hesap_turu)

    @property
    def yetenekler(self):
        """Türe göre alım/satım yetenekleri."""
        return CariHesapTuru.yetenek(self.hesap_turu)

    @property
    def acik_borc(self):
        """Ödenecek açık tutar (net bakiye negatifse mutlak değeri)."""
        b = self.bakiye
        return -b if b < 0 else 0

    @property
    def acik_alacak(self):
        """Tahsil edilecek açık tutar (net bakiye pozitifse)."""
        b = self.bakiye
        return b if b > 0 else 0
