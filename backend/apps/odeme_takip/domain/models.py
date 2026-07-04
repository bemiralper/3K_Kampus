"""
Ödeme Takip Domain Models
Enterprise DDD Pattern — 8 Entity

Akış: Paket → Fiyat → KDV → İndirim → Net Tutar → Ödeme Planı → Tahsilat Takibi

FİYAT MİMARİSİ (Integer-Only):
- Tüm parasal alanlar IntegerField (TL bazlı, kuruş YOK)
- Decimal KULLANILMAZ
- KDV dahil brüt fiyat girilir, net ve kdv otomatik hesaplanır
- Formül: net = round((brut / (1 + kdv_orani/100)) / 100) * 100; kdv = brut - net

KRİTİK KURALLAR:
- KDV oranı sözleşme anında sabitlenir, sonra DEĞİŞTİRİLEMEZ
- İndirimler asla manuel toplamdan düşülmez, ayrı entity'de tutulur
- Her taksit ayrı borç kalemi olarak yaşar
- Tahsilat silmek YOK, sadece iptal (statü değişikliği) var
- Tüm değişiklikler SozlesmeGecmisi'nde loglanır
"""
from django.db import models
from django.db.models import Exists, OuterRef
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

from apps.odeme_takip.domain.enums import (
    SozlesmeDurum, OdemeTuru, TaksitPeriyodu, TaksitDurum,
    TahsilatTuru, TahsilatDurum, OnayDurum, PaketTuru,
    KalemTuru, GecmisIslemTuru, FesihNedeni, EgitimTuru,
)


# ═══════════════════════════════════════
# 1. OdemeSekli — KALDIRILDI
# ═══════════════════════════════════════
class OdemeSekli(models.Model):
    """DEPRECATED — Artık finans.OdemeYontemi kullanılıyor."""
    ad = models.CharField('Ödeme Şekli Adı', max_length=100)
    kod = models.CharField('Kod', max_length=30, unique=True)
    sira = models.PositiveIntegerField('Sıra', default=0)
    aktif_mi = models.BooleanField('Aktif', default=True)
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='odeme_sekilleri', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey('sube.Sube', on_delete=models.CASCADE, related_name='odeme_sekilleri', verbose_name='Şube', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'odeme_sekli'
        verbose_name = 'Ödeme Şekli'
        verbose_name_plural = 'Ödeme Şekilleri'
        ordering = ['sira', 'ad']

    def __str__(self):
        return self.ad


# ═══════════════════════════════════════
# 2. IndirimTuru — Parametrik
# ═══════════════════════════════════════
class IndirimTuru(models.Model):
    """
    Erken kayıt, kardeş indirimi, personel indirimi vb.
    Her türün max oranı ve onay eşiği tanımlanır.
    """
    ad = models.CharField('İndirim Türü Adı', max_length=100)
    kod = models.CharField('Kod', max_length=30, unique=True)
    max_oran = models.IntegerField(
        'Maksimum Oran (%)', default=50,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Bu indirim türü için izin verilen maksimum yüzde'
    )
    onay_gerektiren_oran = models.IntegerField(
        'Onay Gerektiren Oran (%)', default=15,
        help_text='Bu yüzdenin üstündeki indirimler üst onay gerektirir'
    )
    sira = models.PositiveIntegerField('Sıra', default=0)
    aktif_mi = models.BooleanField('Aktif', default=True)
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='indirim_turleri', verbose_name='Kurum', null=True, blank=True)
    sube = models.ForeignKey('sube.Sube', on_delete=models.CASCADE, related_name='indirim_turleri', verbose_name='Şube', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'indirim_turu'
        verbose_name = 'İndirim Türü'
        verbose_name_plural = 'İndirim Türleri'
        ordering = ['sira', 'ad']

    def __str__(self):
        return f"{self.ad} (max %{self.max_oran})"


# ═══════════════════════════════════════
# 3. Sozlesme — Merkez Entity
# ═══════════════════════════════════════
class Sozlesme(models.Model):
    """
    Sözleşme — Sistemin kalbi.
    Öğrenci ile kurum arasındaki mali anlaşma.

    FİYAT YAPISI (Integer-Only):
    brut_tutar     : KDV dahil toplam fiyat (TL, tam sayı)
    kdv_orani      : KDV yüzdesi (0, 10, 20)
    kdv_tutari     : KDV tutarı = brut_tutar - net (otomatik hesaplanır)
    toplam_indirim : İndirim toplamı (TL)
    net_tutar      : brut_tutar - toplam_indirim (öğrencinin ödemesi gereken)
    """
    sozlesme_no = models.CharField('Sözleşme No', max_length=20, unique=True, db_index=True)

    # İlişkiler
    ogrenci = models.ForeignKey('ogrenci.Ogrenci', on_delete=models.PROTECT, related_name='sozlesmeler', verbose_name='Öğrenci')
    ogrenci_kayit = models.ForeignKey('ogrenci.OgrenciKayit', on_delete=models.PROTECT, related_name='sozlesmeler', verbose_name='Öğrenci Kaydı', null=True, blank=True, help_text='Hangi eğitim yılı kaydına ait')
    egitim_yili = models.ForeignKey('egitim_yili.EgitimYili', on_delete=models.PROTECT, related_name='sozlesmeler', verbose_name='Eğitim Yılı')
    kurum = models.ForeignKey('kurum.Kurum', on_delete=models.CASCADE, related_name='sozlesmeler', verbose_name='Kurum')
    sube = models.ForeignKey('sube.Sube', on_delete=models.CASCADE, related_name='sozlesmeler', verbose_name='Şube')
    veli = models.ForeignKey('ogrenci.OgrenciVeli', on_delete=models.SET_NULL, related_name='sozlesmeler', verbose_name='Veli (İmza Sahibi)', null=True, blank=True, help_text='Sözleşmeyi imzalayan veli')
    odeme_yontemi = models.ForeignKey('finans.OdemeYontemi', on_delete=models.SET_NULL, related_name='sozlesmeler', verbose_name='Ödeme Yöntemi', null=True, blank=True, help_text='Finans tanımlarındaki ödeme yöntemi')
    mali_hesap = models.ForeignKey('finans.MaliHesap', on_delete=models.SET_NULL, related_name='sozlesmeler', verbose_name='Mali Hesap', null=True, blank=True, help_text='Tahsilatın yatırılacağı mali hesap')

    # Tarihler
    kayit_tarihi = models.DateField('Kayıt Tarihi', auto_now_add=True)
    baslangic_tarihi = models.DateField('Başlangıç Tarihi')
    bitis_tarihi = models.DateField('Bitiş Tarihi')

    # Paket bilgileri — sözleşme anında sabitlenir (sadece ek hizmet sözleşmelerinde null olabilir)
    paket_turu = models.CharField('Paket Türü', max_length=20, choices=PaketTuru.CHOICES, blank=True, default='')
    paket_id = models.IntegerField('Paket ID', null=True, blank=True)
    paket_adi = models.CharField('Paket Adı', max_length=200, blank=True, default='')

    # ═══ FİYAT YAPISI — Integer-Only ═══
    brut_tutar = models.IntegerField('Brüt Tutar (KDV Dahil)', default=0, validators=[MinValueValidator(0)])
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10, help_text='Sözleşme anında sabitlenir, değiştirilemez')
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0)
    kdv_dahil_tutar = models.IntegerField('KDV Dahil Tutar', default=0, help_text='brut_tutar ile aynı (geriye uyumluluk)')
    toplam_indirim_tutari = models.IntegerField('Toplam İndirim Tutarı', default=0)
    net_tutar = models.IntegerField('Net Tutar (Sözleşme Borcu)', default=0, help_text='Öğrencinin ödemesi gereken toplam tutar')

    # ═══ ÖDEME YAPILANMASI ═══
    odeme_turu = models.CharField('Ödeme Türü', max_length=20, choices=OdemeTuru.CHOICES, default=OdemeTuru.TAKSITLI)
    taksit_sayisi = models.PositiveIntegerField('Taksit Sayısı', default=1)
    ilk_odeme_tarihi = models.DateField('İlk Ödeme Tarihi', null=True, blank=True)
    taksit_periyodu = models.CharField('Taksit Periyodu', max_length=10, choices=TaksitPeriyodu.CHOICES, default=TaksitPeriyodu.AYLIK)

    # ═══ STATÜ ═══
    durum = models.CharField('Durum', max_length=20, choices=SozlesmeDurum.CHOICES, default=SozlesmeDurum.TASLAK, db_index=True)

    # Notlar
    notlar = models.TextField('Notlar', blank=True)

    # ═══ EK DETAYLAR ═══
    muacceliyet_durumu = models.BooleanField('Muacceliyet Durumu', default=False, help_text='Tüm borç vadesi gelmeden muaccel olabilir mi?')
    cayma_suresi = models.PositiveIntegerField('Cayma Süresi (Gün)', default=14, help_text='Cayma hakkı gün sayısı (7 veya 14)')
    egitim_turu = models.CharField('Eğitim Türü', max_length=20, choices=EgitimTuru.CHOICES, default=EgitimTuru.DIGER, blank=True)

    # ═══ VERSİYON TAKİBİ ═══
    versiyon = models.PositiveIntegerField('Versiyon', default=1)
    revizyon_tarihi = models.DateTimeField('Revizyon Tarihi', null=True, blank=True, help_text='Son revizyon tarihi')
    yetkili_personel = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='yetkili_sozlesmeler', verbose_name='Yetkili Personel', help_text='Sözleşmeyi onaylayan yetkili personel')
    olusturan = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='olusturdugu_sozlesmeler', verbose_name='Oluşturan')
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)

    class Meta:
        db_table = 'sozlesme'
        verbose_name = 'Sözleşme'
        verbose_name_plural = 'Sözleşmeler'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili', 'durum']),
            models.Index(fields=['ogrenci', 'egitim_yili']),
            models.Index(fields=['durum', 'created_at']),
        ]

    def __str__(self):
        return f"{self.sozlesme_no} — {self.ogrenci}"

    def hesapla_tutarlar(self):
        """Brüt tutardan KDV ve net tutar hesapla (Integer-Only)"""
        from apps.egitim_paketleri.models import hesapla_kdv
        net, kdv = hesapla_kdv(self.brut_tutar, self.kdv_orani)
        self.kdv_tutari = kdv
        self.kdv_dahil_tutar = self.brut_tutar  # brut zaten KDV dahil
        self.net_tutar = self.brut_tutar - self.toplam_indirim_tutari

    @property
    def toplam_odenen(self):
        """Tüm aktif tahsilatların toplamı"""
        return self.tahsilatlar.filter(
            durum=TahsilatDurum.AKTIF
        ).exclude(
            tahsilat_turu=TahsilatTuru.IADE
        ).aggregate(
            toplam=models.Sum('tutar')
        )['toplam'] or 0

    @property
    def kalan_borc(self):
        """Net tutar - toplam ödenen"""
        return self.net_tutar - self.toplam_odenen

    @property
    def odeme_yuzdesi(self):
        """Ödeme tamamlanma yüzdesi"""
        if self.net_tutar <= 0:
            return 100
        return round(self.toplam_odenen * 100 / self.net_tutar, 1)


# ═══════════════════════════════════════
# 4. SozlesmeKalemi — Paket + Ek Hizmetler
# ═══════════════════════════════════════
class SozlesmeKalemi(models.Model):
    """
    Sözleşmenin alt kalemleri.
    Bir sözleşmede hem ana paket hem ek hizmetler ayrı kalem olarak tutulur.
    Tüm tutarlar Integer (TL).
    """
    sozlesme = models.ForeignKey(Sozlesme, on_delete=models.CASCADE, related_name='kalemler', verbose_name='Sözleşme')
    kalem_turu = models.CharField('Kalem Türü', max_length=20, choices=KalemTuru.CHOICES)
    kalem_id = models.IntegerField('Kalem ID', help_text='İlgili paket veya ek hizmet ID')
    kalem_adi = models.CharField('Kalem Adı', max_length=200)

    brut_tutar = models.IntegerField('Brüt Tutar (KDV Dahil)', default=0)
    kdv_orani = models.IntegerField('KDV Oranı (%)', default=10)
    kdv_tutari = models.IntegerField('KDV Tutarı', default=0)
    kdv_dahil_tutar = models.IntegerField('KDV Dahil Tutar', default=0, help_text='brut_tutar ile aynı (geriye uyumluluk)')

    indirim_orani = models.IntegerField('İndirim Oranı (%)', default=0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    indirim_tutari = models.IntegerField('İndirim Tutarı', default=0)
    net_tutar = models.IntegerField('Net Tutar', default=0, help_text='brut_tutar - indirim')

    aciklama = models.TextField('Açıklama', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sozlesme_kalemi'
        verbose_name = 'Sözleşme Kalemi'
        verbose_name_plural = 'Sözleşme Kalemleri'
        ordering = ['kalem_turu', 'id']

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — {self.kalem_adi}"

    def hesapla(self):
        """Brüt tutardan KDV ve indirim hesapla — kayıtlı tutar öncelikli."""
        from apps.odeme_takip.application.services.fiyat_utils import hesapla_kalem_fiyat
        indirim_kwargs = {}
        if self.indirim_tutari > 0:
            indirim_kwargs['indirim_tutari'] = self.indirim_tutari
        elif self.net_tutar and self.net_tutar < self.brut_tutar:
            indirim_kwargs['net_tutar'] = self.net_tutar
        else:
            indirim_kwargs['indirim_orani'] = self.indirim_orani
        fiyat = hesapla_kalem_fiyat(self.brut_tutar, self.kdv_orani, **indirim_kwargs)
        self.kdv_tutari = fiyat['kdv_tutari']
        self.kdv_dahil_tutar = self.brut_tutar
        self.indirim_orani = fiyat['indirim_orani']
        self.indirim_tutari = fiyat['indirim_tutari']
        self.net_tutar = fiyat['net_tutar']


# ═══════════════════════════════════════
# 5. SozlesmeIndirimi — İndirim Detay
# ═══════════════════════════════════════
class SozlesmeIndirimi(models.Model):
    """
    Sözleşmeye uygulanan indirimler.
    Her indirim ayrı kaydedilir — audit trail + onay mekanizması.
    """
    sozlesme = models.ForeignKey(Sozlesme, on_delete=models.CASCADE, related_name='indirimler', verbose_name='Sözleşme')
    indirim_turu = models.ForeignKey(IndirimTuru, on_delete=models.PROTECT, related_name='sozlesme_indirimleri', verbose_name='İndirim Türü')
    indirim_orani = models.IntegerField('İndirim Oranı (%)', validators=[MinValueValidator(0), MaxValueValidator(100)])
    indirim_tutari = models.IntegerField('İndirim Tutarı', validators=[MinValueValidator(0)])

    onay_durumu = models.CharField('Onay Durumu', max_length=20, choices=OnayDurum.CHOICES, default=OnayDurum.ONAYLANDI, help_text='Eşik üstü indirimlerde "beklemede" olarak başlar')
    onaylayan = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='onayladigi_indirimler', verbose_name='Onaylayan')
    onay_tarihi = models.DateTimeField('Onay Tarihi', null=True, blank=True)
    aciklama = models.TextField('Açıklama', blank=True)
    olusturan = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='olusturdugu_indirimler', verbose_name='Oluşturan')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sozlesme_indirimi'
        verbose_name = 'Sözleşme İndirimi'
        verbose_name_plural = 'Sözleşme İndirimleri'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — {self.indirim_turu.ad} %{self.indirim_orani}"


# ═══════════════════════════════════════
# 6. Taksit — Her biri ayrı borç kalemi
# ═══════════════════════════════════════
class Taksit(models.Model):
    """
    Taksit planı kalemi.
    Her taksit AYRI bir borç kalemidir.
    Tüm tutarlar Integer (TL).
    """
    sozlesme = models.ForeignKey(Sozlesme, on_delete=models.CASCADE, related_name='taksitler', verbose_name='Sözleşme')
    taksit_no = models.PositiveIntegerField('Taksit No')
    vade_tarihi = models.DateField('Vade Tarihi')
    tutar = models.IntegerField('Taksit Tutarı', validators=[MinValueValidator(0)])
    odenen_tutar = models.IntegerField('Ödenen Tutar', default=0)
    kalan_tutar = models.IntegerField('Kalan Tutar', default=0)
    durum = models.CharField('Durum', max_length=20, choices=TaksitDurum.CHOICES, default=TaksitDurum.BEKLEMEDE)
    odeme_yontemi = models.ForeignKey(
        'finans.OdemeYontemi',
        on_delete=models.SET_NULL,
        related_name='taksitler',
        verbose_name='Ödeme Yöntemi',
        null=True,
        blank=True,
        help_text='Planlanan ödeme yöntemi (çek/senet için portföy kaydı tetikler)',
    )
    odeme_tarihi = models.DateField('Ödeme Tarihi', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'taksit'
        verbose_name = 'Taksit'
        verbose_name_plural = 'Taksitler'
        ordering = ['sozlesme', 'taksit_no']
        constraints = [
            models.UniqueConstraint(fields=['sozlesme', 'taksit_no'], name='unique_sozlesme_taksit_no')
        ]
        indexes = [
            models.Index(fields=['vade_tarihi', 'durum']),
            models.Index(fields=['sozlesme', 'durum']),
        ]

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — Taksit {self.taksit_no} ({self.get_durum_display()})"

    def bakiye_guncelle(self):
        """Tahsilat dağıtımlarından ödenen tutarı yeniden hesapla"""
        from apps.odeme_takip.domain.models import TahsilatDagitim
        # TahsilatDagitim üzerinden hesapla
        dagitim_toplam = TahsilatDagitim.objects.filter(
            taksit=self,
            tahsilat__durum=TahsilatDurum.AKTIF,
        ).exclude(
            tahsilat__tahsilat_turu=TahsilatTuru.IADE,
        ).aggregate(
            toplam=models.Sum('tutar')
        )['toplam'] or 0

        # Eski sistem uyumu — dağıtım kaydı olan tahsilatlar çift sayılmaz
        has_dagitim = TahsilatDagitim.objects.filter(tahsilat_id=OuterRef('pk'))
        eski_toplam = self.tahsilatlar.filter(
            durum=TahsilatDurum.AKTIF,
        ).exclude(
            tahsilat_turu=TahsilatTuru.IADE,
        ).annotate(
            _has_dagitim=Exists(has_dagitim),
        ).filter(
            _has_dagitim=False,
        ).aggregate(
            toplam=models.Sum('tutar')
        )['toplam'] or 0

        toplam = int(dagitim_toplam) + int(eski_toplam)

        self.odenen_tutar = int(toplam)
        self.kalan_tutar = int(self.tutar) - self.odenen_tutar

        if self.kalan_tutar <= 1 and self.odenen_tutar > 0:
            self.kalan_tutar = 0
            self.durum = TaksitDurum.ODENDI
            from django.utils import timezone
            self.odeme_tarihi = timezone.now().date()
        elif self.kalan_tutar <= 0:
            self.kalan_tutar = 0
            self.durum = TaksitDurum.ODENDI
            from django.utils import timezone
            self.odeme_tarihi = timezone.now().date()
        elif self.odenen_tutar > 0:
            self.durum = TaksitDurum.KISMI_ODENDI
        else:
            self.durum = TaksitDurum.BEKLEMEDE


# ═══════════════════════════════════════
# 7. Tahsilat — Para hareketi
# ═══════════════════════════════════════
class Tahsilat(models.Model):
    """
    Tahsilat kaydı — her ödeme ayrı kayıt.
    Tüm tutarlar Integer (TL).
    """
    sozlesme = models.ForeignKey(Sozlesme, on_delete=models.PROTECT, related_name='tahsilatlar', verbose_name='Sözleşme')
    taksit = models.ForeignKey(Taksit, on_delete=models.PROTECT, related_name='tahsilatlar', verbose_name='Taksit', null=True, blank=True, help_text='Emanet/fazla ödeme durumunda null olabilir')
    odeme_yontemi = models.ForeignKey('finans.OdemeYontemi', on_delete=models.PROTECT, related_name='tahsilatlar', verbose_name='Ödeme Yöntemi', null=True, blank=True)
    mali_hesap = models.ForeignKey(
        'finans.MaliHesap', on_delete=models.SET_NULL, related_name='tahsilatlar',
        verbose_name='Mali Hesap', null=True, blank=True,
        help_text='Paranın girdiği kasa/banka hesabı — kasa bakiyesi bu alan üzerinden güncellenir',
    )
    bakiye_hareketi_id = models.PositiveBigIntegerField(
        'Bakiye Hareketi ID', null=True, blank=True,
        help_text='İlgili BakiyeHareketi kaydının ID\'si (referans amaçlı)',
    )
    tutar = models.IntegerField('Tutar', validators=[MinValueValidator(1)])
    tahsilat_tarihi = models.DateField('Tahsilat Tarihi')
    referans_no = models.CharField('Referans No', max_length=100, blank=True, help_text='POS slip no, dekont no vb.')
    tahsilat_turu = models.CharField('Tahsilat Türü', max_length=20, choices=TahsilatTuru.CHOICES, default=TahsilatTuru.NORMAL)
    mahsup_kaynagi = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='mahsup_hedefleri', verbose_name='Mahsup Kaynağı', help_text='Bu tahsilat bir emanetten mahsup edildiyse kaynak tahsilat')
    durum = models.CharField('Durum', max_length=20, choices=TahsilatDurum.CHOICES, default=TahsilatDurum.AKTIF)
    iptal_nedeni = models.TextField('İptal Nedeni', blank=True)
    iptal_tarihi = models.DateTimeField('İptal Tarihi', null=True, blank=True)
    iptal_eden = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='iptal_ettigi_tahsilatlar', verbose_name='İptal Eden')
    islem_yapan = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='yaptigi_tahsilatlar', verbose_name='İşlemi Yapan')
    toplam_odeme = models.IntegerField('Toplam Ödeme Tutarı', null=True, blank=True, help_text='Tek seferde yapılan toplam ödeme tutarı.')
    aciklama = models.TextField('Açıklama', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tahsilat'
        verbose_name = 'Tahsilat'
        verbose_name_plural = 'Tahsilatlar'
        ordering = ['-tahsilat_tarihi', '-created_at']
        indexes = [
            models.Index(fields=['sozlesme', 'durum']),
            models.Index(fields=['tahsilat_tarihi']),
            models.Index(fields=['durum', 'tahsilat_turu']),
        ]

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — {self.tutar} TL ({self.get_durum_display()})"


# ═══════════════════════════════════════
# 7b. TahsilatDagitim — Taksit Dağıtım Detayı
# ═══════════════════════════════════════
class TahsilatDagitim(models.Model):
    """
    Bir tahsilatın taksitlere dağıtım detayı.
    Tüm tutarlar Integer (TL).
    """
    tahsilat = models.ForeignKey(Tahsilat, on_delete=models.CASCADE, related_name='dagitimlar', verbose_name='Tahsilat')
    taksit = models.ForeignKey(Taksit, on_delete=models.PROTECT, related_name='tahsilat_dagitimlari', verbose_name='Taksit')
    tutar = models.IntegerField('Dağıtılan Tutar', validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tahsilat_dagitim'
        verbose_name = 'Tahsilat Dağıtımı'
        verbose_name_plural = 'Tahsilat Dağıtımları'
        ordering = ['tahsilat', 'taksit__taksit_no']
        indexes = [
            models.Index(fields=['tahsilat']),
            models.Index(fields=['taksit']),
        ]

    def __str__(self):
        return f"Tahsilat #{self.tahsilat_id} → Taksit {self.taksit.taksit_no}: {self.tutar} TL"


# ═══════════════════════════════════════
# 8. SozlesmeGecmisi — Audit Trail
# ═══════════════════════════════════════
class SozlesmeGecmisi(models.Model):
    """Denetim izi — her değişiklik kaydı."""
    sozlesme = models.ForeignKey(Sozlesme, on_delete=models.CASCADE, related_name='gecmis', verbose_name='Sözleşme')
    islem_turu = models.CharField('İşlem Türü', max_length=30, choices=GecmisIslemTuru.CHOICES)
    eski_deger = models.JSONField('Eski Değer', null=True, blank=True)
    yeni_deger = models.JSONField('Yeni Değer', null=True, blank=True)
    aciklama = models.TextField('Açıklama', blank=True)
    islem_yapan = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='sozlesme_islemleri', verbose_name='İşlemi Yapan')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sozlesme_gecmisi'
        verbose_name = 'Sözleşme Geçmişi'
        verbose_name_plural = 'Sözleşme Geçmişleri'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['sozlesme', 'islem_turu']),
        ]

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — {self.get_islem_turu_display()} ({self.created_at})"


# ═══════════════════════════════════════
# 9. SozlesmeFesih — Fesih Detayları
# ═══════════════════════════════════════
class SozlesmeFesih(models.Model):
    """
    Sözleşme fesih kaydı — detaylı hesaplama.
    Tüm tutarlar Integer (TL).

    HESAPLAMA:
    iade_tutari = toplam_odenen - kullanilan_tutar - kesinti_tutari - ceza_tutari
    """
    sozlesme = models.OneToOneField(Sozlesme, on_delete=models.CASCADE, related_name='fesih', verbose_name='Sözleşme')
    fesih_tarihi = models.DateField('Fesih Tarihi')
    fesih_nedeni = models.CharField('Fesih Nedeni', max_length=30, choices=FesihNedeni.CHOICES, default=FesihNedeni.VELI_TALEBI)
    fesih_aciklama = models.TextField('Fesih Açıklama', blank=True)

    # Hesaplama alanları — Integer
    sozlesme_net_tutar = models.IntegerField('Sözleşme Net Tutar', default=0)
    toplam_odenen = models.IntegerField('Toplam Ödenen', default=0, help_text='Fesih anına kadar yapılan aktif tahsilatlar toplamı')
    kullanilan_gun = models.PositiveIntegerField('Kullanılan Gün', default=0)
    toplam_gun = models.PositiveIntegerField('Toplam Gün', default=0)
    kullanilan_tutar = models.IntegerField('Kullanılan Tutar', default=0, help_text='Eğitim başlangıcından fesih tarihine kadar orantılı bedel')
    kesintiler = models.JSONField('Kesinti Kalemleri', default=list, blank=True, help_text='[{"ad": "Kitap bedeli", "tutar": 500}, ...]')
    kesinti_tutari = models.IntegerField('Toplam Kesinti Tutarı', default=0)
    ceza_orani = models.IntegerField('Ceza Oranı (%)', default=0, help_text='Sözleşme bedelinin yüzdesi olarak ceza')
    ceza_tutari = models.IntegerField('Ceza Tutarı', default=0)
    iade_tutari = models.IntegerField('İade Tutarı', default=0, help_text='Pozitif: kurum öğrenciye iade edecek. Negatif: öğrenci borçlu.')
    iade_yapildi_mi = models.BooleanField('İade Yapıldı', default=False)
    iade_tarihi = models.DateField('İade Tarihi', null=True, blank=True)
    iptal_edilen_taksit_sayisi = models.PositiveIntegerField('İptal Edilen Taksit Sayısı', default=0)
    fesih_eden = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='fesih_ettigi_sozlesmeler', verbose_name='Fesih Eden')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sozlesme_fesih'
        verbose_name = 'Sözleşme Fesih'
        verbose_name_plural = 'Sözleşme Fesihleri'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sozlesme.sozlesme_no} — Fesih ({self.fesih_tarihi})"

    def hesapla(self):
        """Tüm fesih hesaplamalarını çalıştır (Integer-Only)"""
        self.kesinti_tutari = sum(int(k.get('tutar', 0)) for k in (self.kesintiler or []))
        self.ceza_tutari = round(self.sozlesme_net_tutar * self.ceza_orani / 100)
        self.iade_tutari = self.toplam_odenen - self.kullanilan_tutar - self.kesinti_tutari - self.ceza_tutari


# Çek/Senet detay — ayrı modülde tanımlı, migration keşfi için re-export
from apps.odeme_takip.domain.cek_senet import CekSenetDetay, CekSenetDurum  # noqa: E402, F401
