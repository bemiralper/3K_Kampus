"""
Finansman Tanımları — Ortak Parametrik Veri (Master Data)

Bu modeller tüm finans alt modülleri (Gelir, Gider, Cari) tarafından ORTAK
kullanılmak üzere tasarlanmıştır. Amaç, her modülde tekrar eden kategori/tanım
yapıları oluşturmak yerine tek bir tanım havuzu sunmaktır.

İçerik:
- GelirKaynagi        → Gelir kayıtlarının kaynağı (ör. Öğrenci Ücreti, Kira Geliri)
- MaliyetMerkezi      → Gider/Maliyet merkezi (tip ile ayrıştırılır)
- Proje               → Proje bazlı finans takibi
- AciklamaSablonu     → Hazır açıklama şablonları (gelir/gider/genel)

Not: Etiketler için ayrı bir model üretilmez; mevcut `CariEtiket` havuzu tüm
finans modüllerinde ortak etiket havuzu olarak kullanılır (bkz. cari_etiket.py).

Tüm tanımlar eğitim yılından bağımsız, kalıcı parametrik veridir ve soft-delete
mantığıyla yönetilir.
"""
from decimal import Decimal

from django.db import models
from django.utils import timezone


class FinansTanimManager(models.Manager):
    """Soft delete filtresi uygulayan ortak manager."""

    def get_queryset(self):
        return super().get_queryset().filter(silindi_mi=False)

    def tumu(self):
        return super().get_queryset()

    def silinenler(self):
        return super().get_queryset().filter(silindi_mi=True)


class FinansTanimBase(models.Model):
    """
    Finansman tanımları için ortak soyut taban.

    - `sube = NULL` → kurum geneli (tüm şubelerde paylaşılan) tanım.
    - `sube != NULL` → yalnızca ilgili şubeye ait tanım.
    """

    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='%(class)s_set',
        verbose_name='Kurum',
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='%(class)s_set',
        verbose_name='Şube',
        help_text='Boş bırakılırsa kurum geneli tanım olur.',
    )

    ad = models.CharField('Ad', max_length=150)
    kod = models.CharField('Kod', max_length=40, blank=True, default='')
    aciklama = models.TextField('Açıklama', blank=True, default='')
    siralama = models.PositiveIntegerField('Sıralama', default=0)
    aktif_mi = models.BooleanField('Aktif', default=True)

    silindi_mi = models.BooleanField('Silindi', default=False, db_index=True)
    silinme_tarihi = models.DateTimeField('Silinme Tarihi', null=True, blank=True)
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    objects = FinansTanimManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
        ordering = ['siralama', 'ad']

    def __str__(self):
        return self.ad

    def soft_delete(self):
        self.silindi_mi = True
        self.silinme_tarihi = timezone.now()
        self.save(update_fields=['silindi_mi', 'silinme_tarihi', 'updated_at'])


class GelirKaynagi(FinansTanimBase):
    """
    Gelir Kaynağı — bir gelir kaydının hangi kaynaktan geldiğini belirtir.
    Örn: Öğrenci Ücreti, Kira Geliri, Kitap Satışı, Bağış.
    """

    class Meta(FinansTanimBase.Meta):
        app_label = 'finans'
        db_table = 'finans_gelir_kaynagi'
        verbose_name = 'Gelir Kaynağı'
        verbose_name_plural = 'Gelir Kaynakları'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_gelir_kaynagi_kurum_sube_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'aktif_mi', 'silindi_mi']),
        ]


class MaliyetMerkeziTipi:
    """Maliyet/Gider merkezi ayrımı için tip sabitleri."""

    MALIYET = 'maliyet'
    GIDER = 'gider'

    CHOICES = [
        (MALIYET, 'Maliyet Merkezi'),
        (GIDER, 'Gider Merkezi'),
    ]


class MaliyetMerkezi(FinansTanimBase):
    """
    Maliyet / Gider Merkezi — giderlerin organizasyonel dağılımı.
    `tip` alanı ile hem "Maliyet Merkezi" hem "Gider Merkezi" tek yapıda tutulur
    (tekrar eden yapı oluşturmamak için).
    Örn: İdari, Eğitim, Pazarlama, Bina/Tesis.
    """

    tip = models.CharField(
        'Tip',
        max_length=10,
        choices=MaliyetMerkeziTipi.CHOICES,
        default=MaliyetMerkeziTipi.MALIYET,
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='alt_merkezler',
        verbose_name='Üst Merkez',
    )

    class Meta(FinansTanimBase.Meta):
        app_label = 'finans'
        db_table = 'finans_maliyet_merkezi'
        verbose_name = 'Maliyet/Gider Merkezi'
        verbose_name_plural = 'Maliyet/Gider Merkezleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'tip', 'parent', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_maliyet_merkezi_kurum_sube_tip_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'tip', 'aktif_mi', 'silindi_mi']),
        ]

    @property
    def is_ana_merkez(self):
        return self.parent_id is None


class ProjeDurum:
    """Proje durumu sabitleri."""

    AKTIF = 'aktif'
    TAMAMLANDI = 'tamamlandi'
    BEKLEMEDE = 'beklemede'
    IPTAL = 'iptal'

    CHOICES = [
        (AKTIF, 'Aktif'),
        (TAMAMLANDI, 'Tamamlandı'),
        (BEKLEMEDE, 'Beklemede'),
        (IPTAL, 'İptal'),
    ]


class Proje(FinansTanimBase):
    """
    Proje Bazlı Finans — gelir ve giderlerin proje bazında izlenmesi.
    Bütçe, başlangıç/bitiş ve durum bilgisi tutulur.
    """

    baslangic_tarihi = models.DateField('Başlangıç Tarihi', null=True, blank=True)
    bitis_tarihi = models.DateField('Bitiş Tarihi', null=True, blank=True)
    butce = models.DecimalField(
        'Bütçe',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
    )
    durum = models.CharField(
        'Durum',
        max_length=15,
        choices=ProjeDurum.CHOICES,
        default=ProjeDurum.AKTIF,
    )
    renk = models.CharField('Renk', max_length=20, blank=True, default='#0262a7')

    class Meta(FinansTanimBase.Meta):
        app_label = 'finans'
        db_table = 'finans_proje'
        verbose_name = 'Proje'
        verbose_name_plural = 'Projeler'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_proje_kurum_sube_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'durum', 'aktif_mi', 'silindi_mi']),
        ]


class MasrafTuru(FinansTanimBase):
    """
    Masraf Türü — banka/işlem masraflarının sınıflandırması.
    Örn: EFT Masrafı, Havale Masrafı, FAST Masrafı, POS Komisyonu,
    Banka Komisyonu, Dosya Masrafı, İşlem Ücreti, Diğer.

    `odeme_tipi` boş ise tüm ödeme yöntemlerinde geçerli; dolu ise yalnızca
    ilgili ödeme tipinde (ör. 'eft', 'pos') önerilir. Frontend bu alana göre
    koşullu filtreleme yapar.
    """

    odeme_tipi = models.CharField(
        'İlgili Ödeme Tipi',
        max_length=30,
        blank=True,
        default='',
        help_text="Boşsa tüm yöntemler; dolu ise ör. 'eft', 'havale', 'pos'.",
    )
    kesinti_turu = models.CharField(
        'Muhasebe Kesinti Türü',
        max_length=40,
        blank=True,
        default='diger_banka_masraflari',
        help_text='Banka gider kategorisi eşlemesi için KesintiTuru değeri.',
    )
    varsayilan_tutar = models.DecimalField(
        'Varsayılan Tutar',
        max_digits=15,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text='Önerilen/otomatik dolan masraf tutarı (0 = yok).',
    )

    class Meta(FinansTanimBase.Meta):
        app_label = 'finans'
        db_table = 'finans_masraf_turu'
        verbose_name = 'Masraf Türü'
        verbose_name_plural = 'Masraf Türleri'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_masraf_turu_kurum_sube_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'aktif_mi', 'silindi_mi']),
        ]


class AciklamaSablonuKapsam:
    """Açıklama şablonunun kullanılabileceği modül kapsamı."""

    GENEL = 'genel'
    GELIR = 'gelir'
    GIDER = 'gider'

    CHOICES = [
        (GENEL, 'Genel'),
        (GELIR, 'Gelir'),
        (GIDER, 'Gider'),
    ]


class AciklamaSablonu(FinansTanimBase):
    """
    Açıklama Şablonu — sık kullanılan açıklama metinleri için hazır şablonlar.
    `kapsam` ile gelir/gider/genel olarak sınıflandırılır.
    """

    icerik = models.TextField('Şablon İçeriği', blank=True, default='')
    kapsam = models.CharField(
        'Kapsam',
        max_length=10,
        choices=AciklamaSablonuKapsam.CHOICES,
        default=AciklamaSablonuKapsam.GENEL,
    )

    class Meta(FinansTanimBase.Meta):
        app_label = 'finans'
        db_table = 'finans_aciklama_sablonu'
        verbose_name = 'Açıklama Şablonu'
        verbose_name_plural = 'Açıklama Şablonları'
        constraints = [
            models.UniqueConstraint(
                fields=['kurum', 'sube', 'kapsam', 'ad'],
                condition=models.Q(silindi_mi=False),
                name='uq_aciklama_sablonu_kurum_sube_kapsam_ad',
            ),
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'kapsam', 'aktif_mi', 'silindi_mi']),
        ]
