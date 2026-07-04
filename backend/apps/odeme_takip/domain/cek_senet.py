"""
Çek / Senet portföy kaydı — taksit veya tahsilat ile ilişkili.
"""
from django.db import models
from django.utils import timezone


class CekSenetYon:
    ALINAN = 'alinan'
    VERILEN = 'verilen'

    CHOICES = [
        (ALINAN, 'Alınan'),
        (VERILEN, 'Verilen'),
    ]


class CekSenetAracTipi:
    CEK = 'cek'
    SENET = 'senet'

    CHOICES = [
        (CEK, 'Çek'),
        (SENET, 'Senet'),
    ]


class CekSenetDurum:
    """Durum kodları — alınan ve verilen için ortak depo."""

    # Yeni V2 durumları
    BEKLIYOR = 'bekliyor'
    PORTFOYDE = 'portfoyde'
    TAHSILDE = 'tahsilde'
    TAHSIL_EDILDI = 'tahsil_edildi'
    IADE = 'iade'
    KARSILIKSIZ = 'karsiliksiz'
    IPTAL = 'iptal'
    HAZIRLANDI = 'hazirlandi'
    VERILDI = 'verildi'
    ODENDI = 'odendi'

    # Legacy (geriye dönük)
    TAHSIL = 'tahsil'

    CHOICES = [
        (BEKLIYOR, 'Bekleniyor'),
        (PORTFOYDE, 'Portföyde'),
        (TAHSILDE, 'Tahsilde'),
        (TAHSIL_EDILDI, 'Tahsil Edildi'),
        (IADE, 'İade'),
        (KARSILIKSIZ, 'Karşılıksız'),
        (IPTAL, 'İptal'),
        (HAZIRLANDI, 'Hazırlandı'),
        (VERILDI, 'Verildi'),
        (ODENDI, 'Ödendi'),
        (TAHSIL, 'Tahsil Edildi (eski)'),
    ]

    ALINAN_TRANSITIONS = {
        BEKLIYOR: {PORTFOYDE, IPTAL},
        # Portföyden doğrudan tahsil (nakde/bankaya geçiş) veya önce tahsilde adımı
        PORTFOYDE: {TAHSILDE, TAHSIL_EDILDI, IADE, IPTAL},
        TAHSILDE: {TAHSIL_EDILDI, KARSILIKSIZ, IPTAL},
        TAHSIL_EDILDI: set(),
        IADE: set(),
        KARSILIKSIZ: set(),
        IPTAL: set(),
        TAHSIL: set(),
    }

    VERILEN_TRANSITIONS = {
        BEKLIYOR: {HAZIRLANDI, IPTAL},
        HAZIRLANDI: {VERILDI, IPTAL},
        VERILDI: {ODENDI, IPTAL},
        ODENDI: set(),
        IPTAL: set(),
    }

    @classmethod
    def get_label(cls, value: str) -> str:
        return dict(cls.CHOICES).get(value, value)

    @classmethod
    def normalize(cls, value: str) -> str:
        if value == cls.TAHSIL:
            return cls.TAHSIL_EDILDI
        return value

    @classmethod
    def can_transition(cls, yon: str, current: str, target: str) -> bool:
        current = cls.normalize(current)
        target = cls.normalize(target)
        if current == target:
            return True
        graph = cls.ALINAN_TRANSITIONS if yon == CekSenetYon.ALINAN else cls.VERILEN_TRANSITIONS
        allowed = graph.get(current, set())
        return target in allowed


class CekSenetDetay(models.Model):
    """Çek veya senet ödeme aracına ait portföy kaydı."""

    yon = models.CharField(
        'Yön',
        max_length=10,
        choices=CekSenetYon.CHOICES,
        default=CekSenetYon.ALINAN,
    )
    arac_tipi = models.CharField(
        'Araç Tipi',
        max_length=10,
        choices=CekSenetAracTipi.CHOICES,
        default=CekSenetAracTipi.CEK,
    )
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='cek_senet_kayitlari',
        null=True,
        blank=True,
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.SET_NULL,
        related_name='cek_senet_kayitlari',
        null=True,
        blank=True,
    )
    cari_hesap = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.SET_NULL,
        related_name='cek_senet_kayitlari',
        null=True,
        blank=True,
    )
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.SET_NULL,
        related_name='cek_senet_kayitlari',
        null=True,
        blank=True,
    )
    tutar = models.IntegerField('Tutar (TL)', default=0)
    aciklama = models.TextField('Açıklama', blank=True, default='')
    olusturma_tarihi = models.DateField('Oluşturulma Tarihi', default=timezone.localdate)

    taksit = models.OneToOneField(
        'odeme_takip.Taksit',
        on_delete=models.CASCADE,
        related_name='cek_senet_detay',
        null=True,
        blank=True,
    )
    gider_taksit = models.OneToOneField(
        'finans.GiderTaksit',
        on_delete=models.CASCADE,
        related_name='cek_senet_detay',
        null=True,
        blank=True,
    )
    tahsilat = models.OneToOneField(
        'odeme_takip.Tahsilat',
        on_delete=models.SET_NULL,
        related_name='cek_senet_detay',
        null=True,
        blank=True,
    )
    tahsilat_mali_hesap = models.ForeignKey(
        'finans.MaliHesap',
        on_delete=models.SET_NULL,
        related_name='cek_senet_tahsilatlari',
        null=True,
        blank=True,
        verbose_name='Tahsil/Ödeme Mali Hesabı',
    )

    cek_senet_no = models.CharField('Çek/Senet No', max_length=50, blank=True, default='')
    banka_adi = models.CharField('Banka Adı', max_length=100, blank=True, default='')
    sube_adi = models.CharField('Şube', max_length=100, blank=True, default='')
    hesap_no = models.CharField('Hesap No', max_length=50, blank=True, default='')
    keside_eden = models.CharField('Keşide Eden', max_length=150, blank=True, default='')
    keside_tarihi = models.DateField('Keşide Tarihi', null=True, blank=True)
    vade_tarihi = models.DateField('Vade Tarihi')
    belge_gorsel = models.FileField('Belge Görseli', upload_to='cek_senet/', null=True, blank=True)

    durum = models.CharField(
        'Durum',
        max_length=20,
        choices=CekSenetDurum.CHOICES,
        default=CekSenetDurum.BEKLIYOR,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'cek_senet_detay'
        verbose_name = 'Çek/Senet Detay'
        verbose_name_plural = 'Çek/Senet Detayları'
        indexes = [
            models.Index(fields=['kurum', 'durum', 'vade_tarihi']),
            models.Index(fields=['yon', 'durum']),
        ]

    def __str__(self):
        no = self.cek_senet_no or f'#{self.pk}'
        return f'{no} ({self.get_durum_display()})'
