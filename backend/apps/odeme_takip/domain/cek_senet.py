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
    CIRO = 'ciro'
    IADE = 'iade'
    PROTESTO = 'protesto'
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
        (CIRO, 'Ciro Edildi'),
        (IADE, 'İade Edildi'),
        (PROTESTO, 'Protestolu'),
        (KARSILIKSIZ, 'Karşılıksız'),
        (IPTAL, 'İptal'),
        (HAZIRLANDI, 'Hazırlandı'),
        (VERILDI, 'Verildi'),
        (ODENDI, 'Ödendi'),
        (TAHSIL, 'Tahsil Edildi (eski)'),
    ]

    # Portföyde/aktif kabul edilen (henüz sonuçlanmamış) durumlar
    AKTIF_DURUMLAR = {BEKLIYOR, PORTFOYDE, TAHSILDE, HAZIRLANDI, VERILDI}
    # Sonuçlanmış (terminal) durumlar
    TERMINAL_DURUMLAR = {TAHSIL_EDILDI, CIRO, IADE, PROTESTO, KARSILIKSIZ, IPTAL, ODENDI, TAHSIL}

    ALINAN_TRANSITIONS = {
        BEKLIYOR: {PORTFOYDE, IPTAL},
        # Portföyden doğrudan tahsil (nakde/bankaya geçiş), ciro, iade veya önce tahsilde adımı
        PORTFOYDE: {TAHSILDE, TAHSIL_EDILDI, CIRO, IADE, PROTESTO, IPTAL},
        TAHSILDE: {TAHSIL_EDILDI, KARSILIKSIZ, PROTESTO, IADE, IPTAL},
        PROTESTO: {TAHSIL_EDILDI, IADE, IPTAL},
        KARSILIKSIZ: {TAHSIL_EDILDI, IADE, PROTESTO, IPTAL},
        TAHSIL_EDILDI: set(),
        CIRO: set(),
        IADE: set(),
        IPTAL: set(),
        TAHSIL: set(),
    }

    VERILEN_TRANSITIONS = {
        BEKLIYOR: {HAZIRLANDI, IPTAL},
        HAZIRLANDI: {VERILDI, IPTAL},
        VERILDI: {ODENDI, IADE, IPTAL},
        ODENDI: set(),
        IADE: set(),
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
    def is_aktif(cls, value: str) -> bool:
        return cls.normalize(value) in cls.AKTIF_DURUMLAR

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
    cari_hareket = models.OneToOneField(
        'finans.CariHareket',
        on_delete=models.SET_NULL,
        related_name='cek_senet_detay',
        null=True,
        blank=True,
        verbose_name='Bağlı Cari Hareket',
        help_text='Serbest ödeme ile oluşturulan verilen çek/senet için cari hareket bağlantısı',
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
    seri_no = models.CharField('Seri No', max_length=50, blank=True, default='')
    banka_adi = models.CharField('Banka Adı', max_length=100, blank=True, default='')
    sube_adi = models.CharField('Şube', max_length=100, blank=True, default='')
    hesap_no = models.CharField('Hesap No', max_length=50, blank=True, default='')
    keside_eden = models.CharField('Keşide Eden', max_length=150, blank=True, default='')
    keside_tarihi = models.DateField('Keşide Tarihi', null=True, blank=True)
    vade_tarihi = models.DateField('Vade Tarihi')
    belge_gorsel = models.FileField('Belge Görseli', upload_to='cek_senet/', null=True, blank=True)

    # Ciro (devir) bilgileri
    ciro_edilen_cari = models.ForeignKey(
        'finans.CariHesap',
        on_delete=models.SET_NULL,
        related_name='ciro_edilen_cek_senetler',
        null=True,
        blank=True,
        verbose_name='Ciro Edilen Cari',
    )
    ciro_tarihi = models.DateField('Ciro Tarihi', null=True, blank=True)
    # Sonuçlanma tarihleri (protesto / iade)
    protesto_tarihi = models.DateField('Protesto Tarihi', null=True, blank=True)
    iade_tarihi = models.DateField('İade Tarihi', null=True, blank=True)
    tahsil_tarihi = models.DateField('Tahsil/Ödeme Tarihi', null=True, blank=True)
    durum_aciklamasi = models.CharField('Durum Notu', max_length=255, blank=True, default='')

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
            models.Index(fields=['kurum', 'yon', 'arac_tipi']),
        ]

    def __str__(self):
        no = self.cek_senet_no or f'#{self.pk}'
        return f'{no} ({self.get_durum_display()})'

    @property
    def aktif_mi(self) -> bool:
        return CekSenetDurum.is_aktif(self.durum)


class CekSenetLog(models.Model):
    """Çek/senet işlem geçmişi (timeline) — her durum değişikliği ve aksiyon."""

    detay = models.ForeignKey(
        'odeme_takip.CekSenetDetay',
        on_delete=models.CASCADE,
        related_name='loglar',
    )
    eylem = models.CharField('Eylem', max_length=40)
    onceki_durum = models.CharField('Önceki Durum', max_length=20, blank=True, default='')
    yeni_durum = models.CharField('Yeni Durum', max_length=20, blank=True, default='')
    tutar = models.IntegerField('Tutar (TL)', null=True, blank=True)
    aciklama = models.TextField('Açıklama', blank=True, default='')
    kullanici = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cek_senet_loglari',
    )
    kullanici_adi = models.CharField('Kullanıcı Adı', max_length=150, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cek_senet_log'
        verbose_name = 'Çek/Senet Log'
        verbose_name_plural = 'Çek/Senet Logları'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['detay', '-created_at']),
        ]

    def __str__(self):
        return f'{self.detay_id} — {self.eylem}'


class CekSenetDosya(models.Model):
    """Çek/senet kaydına yüklenen belge/ek dosyalar (PDF, görsel, dekont, sözleşme...)."""

    DOSYA_TURLERI = [
        ('gorsel', 'Çek/Senet Görseli'),
        ('dekont', 'Dekont / Makbuz'),
        ('sozlesme', 'Sözleşme'),
        ('tarama', 'Tarama'),
        ('diger', 'Diğer'),
    ]

    detay = models.ForeignKey(
        'odeme_takip.CekSenetDetay',
        on_delete=models.CASCADE,
        related_name='dosyalar',
    )
    kurum_id = models.PositiveIntegerField('Kurum ID', null=True, blank=True)
    dosya = models.FileField('Dosya', upload_to='cek_senet/dosyalar/%Y/%m/')
    dosya_adi = models.CharField('Dosya Adı', max_length=255)
    dosya_turu = models.CharField('Dosya Türü', max_length=20, choices=DOSYA_TURLERI, default='diger')
    aciklama = models.TextField('Açıklama', blank=True, default='')
    dosya_boyutu = models.PositiveIntegerField('Boyut (byte)', default=0)
    yukleyen = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cek_senet_dosyalari',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cek_senet_dosya'
        verbose_name = 'Çek/Senet Dosya'
        verbose_name_plural = 'Çek/Senet Dosyalar'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.dosya_adi} ({self.get_dosya_turu_display()})'

    @property
    def dosya_url(self):
        return self.dosya.url if self.dosya else None

    @property
    def dosya_boyutu_fmt(self):
        b = self.dosya_boyutu or 0
        if b < 1024:
            return f'{b} B'
        if b < 1024 * 1024:
            return f'{b / 1024:.1f} KB'
        return f'{b / (1024 * 1024):.1f} MB'
