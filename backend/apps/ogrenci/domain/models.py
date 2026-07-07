"""
Ogrenci Domain Models
Production-Grade SaaS Multi-Tenant Architecture
"""
from django.db import models
from django.core.validators import RegexValidator


class Ogrenci(models.Model):
    """
    Student (Persistent Entity - Year Independent)
    
    KALICI VARLIK - Eğitim yılından bağımsız
    
    KURALLAR:
    - Öğrenci bir kez tanımlanır
    - Sınıf bilgisi BURADA OLMAZ
    - Eğitim yılı bilgisi BURADA OLMAZ
    - Yıllık ilişkiler OgrenciKayit tablosunda tutulur
    """
    
    # Tenant isolation
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='ogrenciler',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='ogrenciler',
        verbose_name='Şube'
    )

    kisi = models.ForeignKey(
        'kimlik.Kisi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ogrenci_kayitlari_kisi',
        verbose_name='Merkezi Kişi',
    )
    
    # Kimlik bilgileri
    tc_kimlik_no = models.CharField(
        'TC Kimlik No',
        max_length=11,
        validators=[
            RegexValidator(
                regex=r'^\d{11}$',
                message='TC Kimlik No 11 haneli olmalıdır'
            )
        ],
        blank=True,
        null=True
    )
    
    ad = models.CharField('Ad', max_length=100)
    soyad = models.CharField('Soyad', max_length=100)
    dogum_tarihi = models.DateField('Doğum Tarihi', null=True, blank=True)
    
    CINSIYET_CHOICES = [
        ('E', 'Erkek'),
        ('K', 'Kadın'),
    ]
    cinsiyet = models.CharField(
        'Cinsiyet',
        max_length=1,
        choices=CINSIYET_CHOICES,
        null=True,
        blank=True
    )
    
    # Kayıt Türü
    KAYIT_TURU_CHOICES = [
        ('asil', 'Asil'),
        ('misafir', 'Misafir'),
        ('yaz_programi', 'Yaz Programı'),
    ]
    kayit_turu = models.CharField(
        'Kayıt Türü',
        max_length=50,
        default='asil',
        help_text='Kurum Yönetimi > Kayıt Tanımları lookup kodu',
    )
    
    # Profil Fotoğrafı
    profil_foto = models.ImageField(
        'Profil Fotoğrafı',
        upload_to='ogrenci/profil/',
        blank=True,
        null=True
    )
    
    # İletişim
    telefon = models.CharField('Telefon', max_length=20, blank=True)
    email = models.EmailField('E-posta', blank=True)
    adres = models.TextField('Adres', blank=True)
    
    # Veli bilgileri
    YAKINLIK_DERECESI_CHOICES = [
        ('anne', 'Anne'),
        ('baba', 'Baba'),
        ('kardes', 'Kardeş'),
        ('dede', 'Dede'),
        ('nine', 'Nine'),
        ('amca', 'Amca'),
        ('dayi', 'Dayı'),
        ('hala', 'Hala'),
        ('teyze', 'Teyze'),
        ('vasi', 'Vasi'),
        ('diger', 'Diğer'),
    ]
    veli_ad_soyad = models.CharField('Veli Ad Soyad', max_length=200, blank=True)
    veli_telefon = models.CharField('Veli Telefon', max_length=20, blank=True)
    veli_yakinlik = models.CharField('Yakınlık Derecesi', max_length=20, choices=YAKINLIK_DERECESI_CHOICES, blank=True)
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci'
        verbose_name = 'Öğrenci'
        verbose_name_plural = 'Öğrenciler'
        ordering = ['soyad', 'ad']
        constraints = [
            # TC unique per kurum (bazı kurumlar TC kullanmayabilir)
            models.UniqueConstraint(
                fields=['kurum', 'tc_kimlik_no'],
                name='unique_kurum_tc',
                condition=models.Q(tc_kimlik_no__isnull=False)
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'aktif_mi']),
            models.Index(fields=['tc_kimlik_no']),
            models.Index(fields=['ad', 'soyad']),
        ]
    
    def __str__(self):
        return f"{self.ad} {self.soyad}"
    
    @property
    def tam_ad(self):
        return f"{self.ad} {self.soyad}"


class OgrenciKayit(models.Model):
    """
    Student Enrollment (THE MOST CRITICAL TABLE)
    
    YILLIK İLİŞKİ - Öğrenci ile Sınıf/Eğitim Yılı arasındaki bağ
    
    KURALLAR:
    - Aynı öğrenci aynı eğitim yılında SADECE 1 KEZ kayıt olabilir
    - Tenant isolation: kurum + sube + egitim_yili
    - Bu tablo olmadan öğrenci hiçbir sınıfa ait değildir
    
    UNIQUE CONSTRAINT: (ogrenci_id, egitim_yili_id) ZORUNLU
    """
    
    # Öğrenci (KALICI)
    ogrenci = models.ForeignKey(
        'Ogrenci',
        on_delete=models.CASCADE,
        related_name='kayitlar',
        verbose_name='Öğrenci'
    )
    
    # Sınıf (YILLIK — manuel atama, boş bırakılabilir)
    sinif = models.ForeignKey(
        'sinif.Sinif',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='kayitlar',
        verbose_name='Sınıf'
    )

    # Sınıf seviyesi (sinif atanmamış olsa bile kayıt sırasında seçilen seviye)
    sinif_seviyesi = models.ForeignKey(
        'egitim_tanimlari.SinifSeviyesi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ogrenci_kayitlari',
        verbose_name='Sınıf Seviyesi',
    )
    
    # Eğitim Yılı (ZORUNLU - Tenant isolation için)
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.CASCADE,
        related_name='ogrenci_kayitlari',
        verbose_name='Eğitim Yılı'
    )
    
    # Tenant isolation (denormalized for fast queries)
    kurum = models.ForeignKey(
        'kurum.Kurum',
        on_delete=models.CASCADE,
        related_name='ogrenci_kayitlari',
        verbose_name='Kurum'
    )
    sube = models.ForeignKey(
        'sube.Sube',
        on_delete=models.CASCADE,
        related_name='ogrenci_kayitlari',
        verbose_name='Şube'
    )
    
    # Kayıt bilgileri
    kayit_tarihi = models.DateField('Kayıt Tarihi', auto_now_add=True)
    
    # Ek kayıt bilgileri
    okul_no = models.CharField('Okul Numarası', max_length=20, blank=True)
    
    GIRIS_TURU_CHOICES = [
        ('yeni_kayit', 'Yeni Kayıt'),
        ('kayit_yenileme', 'Kayıt Yenileme'),
        ('zorunlu_kayit', 'Zorunlu Kayıt'),
        ('on_kayit', 'Ön Kayıt'),
        ('kayit_gorusmesi', 'Kayıt Görüşmesi'),
    ]
    giris_turu = models.CharField(
        'Giriş Türü',
        max_length=20,
        choices=GIRIS_TURU_CHOICES,
        default='yeni_kayit'
    )
    
    giris_tarihi = models.DateField('Giriş Tarihi', null=True, blank=True)
    geldigi_okul = models.CharField('Geldiği Okul', max_length=200, blank=True)
    referans = models.CharField('Referans Kişi/Kurum', max_length=200, blank=True)
    
    kaydi_alan = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='kaydettiği_ogrenciler',
        verbose_name='Kaydı Alan'
    )
    
    # Durum
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    # Zaman damgaları
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci_kayit'
        verbose_name = 'Öğrenci Kaydı'
        verbose_name_plural = 'Öğrenci Kayıtları'
        ordering = ['-egitim_yili', 'ogrenci__soyad', 'ogrenci__ad']
        constraints = [
            # KRİTİK: Aynı öğrenci aynı yılda sadece 1 kez kayıt
            models.UniqueConstraint(
                fields=['ogrenci', 'egitim_yili'],
                name='unique_ogrenci_per_year'
            )
        ]
        indexes = [
            models.Index(fields=['kurum', 'sube', 'egitim_yili', 'aktif_mi']),
            models.Index(fields=['sinif', 'aktif_mi']),
            models.Index(fields=['ogrenci', 'egitim_yili']),
        ]
    
    def __str__(self):
        return f"{self.ogrenci.tam_ad} - {self.sinif.ad} ({self.egitim_yili.yil_str})"
    
    def save(self, *args, **kwargs):
        # Denormalized tenant fields otomatik doldur
        if not self.kurum_id:
            self.kurum_id = self.ogrenci.kurum_id
        if not self.sube_id:
            self.sube_id = self.ogrenci.sube_id
        super().save(*args, **kwargs)


class OgrenciAdres(models.Model):
    """Öğrenci Adres Bilgileri"""
    
    ogrenci = models.ForeignKey(
        'Ogrenci',
        on_delete=models.CASCADE,
        related_name='adresler',
        verbose_name='Öğrenci'
    )
    
    ADRES_TURU_CHOICES = [
        ('ev', 'Ev'),
        ('is', 'İş'),
        ('diger', 'Diğer'),
    ]
    adres_turu = models.CharField(
        'Adres Türü',
        max_length=10,
        choices=ADRES_TURU_CHOICES,
        default='ev'
    )
    
    adres = models.TextField('Adres')
    il = models.CharField('İl', max_length=50, blank=True)
    ilce = models.CharField('İlçe', max_length=50, blank=True)
    posta_kodu = models.CharField('Posta Kodu', max_length=10, blank=True)
    
    varsayilan = models.BooleanField('Varsayılan', default=False)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci_adres'
        verbose_name = 'Öğrenci Adresi'
        verbose_name_plural = 'Öğrenci Adresleri'
        ordering = ['-varsayilan', '-created_at']
    
    def __str__(self):
        return f"{self.ogrenci.tam_ad} - {self.get_adres_turu_display()}"


class OgrenciVeli(models.Model):
    """Öğrenci Veli Bilgileri"""
    
    ogrenci = models.ForeignKey(
        'Ogrenci',
        on_delete=models.CASCADE,
        related_name='veliler',
        verbose_name='Öğrenci'
    )

    kisi = models.ForeignKey(
        'kimlik.Kisi',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='veli_kayitlari',
        verbose_name='Merkezi Kişi',
    )
    
    VELI_TURU_CHOICES = [
        ('anne', 'Anne'),
        ('baba', 'Baba'),
        ('kiz_kardes', 'Kız Kardeş'),
        ('erkek_kardes', 'Erkek Kardeş'),
        ('dayi_amca', 'Dayı / Amca'),
        ('hala_teyze', 'Hala / Teyze'),
        ('egitim_masraf', 'Eğitim Masraflarını Karşılayan'),
        ('diger', 'Diğer'),
    ]
    veli_turu = models.CharField(
        'Veli Türü',
        max_length=20,
        choices=VELI_TURU_CHOICES
    )
    
    tc_kimlik_no = models.CharField(
        'TC Kimlik No',
        max_length=11,
        blank=True,
        validators=[
            RegexValidator(
                regex=r'^\d{11}$',
                message='TC Kimlik No 11 haneli olmalıdır'
            )
        ]
    )
    
    ad = models.CharField('Ad', max_length=100)
    soyad = models.CharField('Soyad', max_length=100)
    telefon = models.CharField('Telefon', max_length=20, blank=True)
    email = models.EmailField('E-posta', blank=True)
    
    # SMS Bildirimleri (JSON array olarak saklanacak)
    sms_bildirimleri = models.JSONField(
        'SMS Bildirimleri',
        default=list,
        blank=True,
        help_text='Hangi konularda SMS alacak: devamsizlik, odeme, duyuru vs.'
    )
    
    egitim_seviyesi = models.CharField('Eğitim Seviyesi', max_length=100, blank=True)
    meslek = models.CharField('Meslek', max_length=100, blank=True)
    calistigi_kurum = models.CharField('Çalıştığı Kurum', max_length=200, blank=True)
    
    ogrenci_kendi_velisi = models.BooleanField('Öğrenci Kendi Velisi', default=False)
    varsayilan = models.BooleanField('Varsayılan', default=False)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci_veli'
        verbose_name = 'Öğrenci Velisi'
        verbose_name_plural = 'Öğrenci Velileri'
        ordering = ['-varsayilan', 'veli_turu']
    
    def __str__(self):
        return f"{self.ad} {self.soyad} ({self.get_veli_turu_display()})"
    
    @property
    def tam_ad(self):
        return f"{self.ad} {self.soyad}"


class OgrenciEgitimPaketi(models.Model):
    """Öğrencinin kayıtlı olduğu eğitim paketleri"""
    
    ogrenci = models.ForeignKey(
        'Ogrenci',
        on_delete=models.CASCADE,
        related_name='egitim_paketleri_kayit',
        verbose_name='Öğrenci'
    )
    
    # Paket türü ve ID - GenericForeignKey benzeri ama daha basit
    PAKET_TURU_CHOICES = [
        ('grup_dersi', 'Grup Dersi'),
        ('ozel_ders', 'Özel Ders'),
        ('deneme', 'Deneme'),
        ('davranis', 'Davranış'),
    ]
    paket_turu = models.CharField(
        'Paket Türü',
        max_length=20,
        choices=PAKET_TURU_CHOICES
    )
    paket_id = models.IntegerField('Paket ID')
    paket_adi = models.CharField('Paket Adı', max_length=200, blank=True)
    
    kayit_tarihi = models.DateField('Kayıt Tarihi', auto_now_add=True)
    baslangic_tarihi = models.DateField('Başlangıç Tarihi', null=True, blank=True)
    bitis_tarihi = models.DateField('Bitiş Tarihi', null=True, blank=True)
    
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci_egitim_paketi'
        verbose_name = 'Öğrenci Eğitim Paketi'
        verbose_name_plural = 'Öğrenci Eğitim Paketleri'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.ogrenci.tam_ad} - {self.paket_adi or self.get_paket_turu_display()}"


class OgrenciEkHizmet(models.Model):
    """
    Öğrencinin aldığı ek hizmetler — Kütüphane, Koçluk, Deneme vb.
    
    Grup dersine dahil ise: dahil_mi=True, fiyat=0
    Ayrı satın alındıysa: dahil_mi=False, fiyat=satış_fiyatı
    
    Bu tablo öğrencinin hangi hizmetlere erişimi olduğunu belirler:
    - Koçluk: Bu tabloda aktif koçluk kaydı olan öğrenci → koç atamasında listede görünür
    - Kütüphane: Bu tabloda aktif kütüphane kaydı olan öğrenci → kütüphane modülünde görünür
    - Deneme: Bu tabloda aktif deneme kaydı olan öğrenci → deneme sınavlarına erişebilir
    """
    
    ogrenci = models.ForeignKey(
        'Ogrenci',
        on_delete=models.CASCADE,
        related_name='ek_hizmetler',
        verbose_name='Öğrenci'
    )
    
    ek_hizmet = models.ForeignKey(
        'egitim_paketleri.EkHizmet',
        on_delete=models.PROTECT,
        related_name='ogrenci_kayitlari',
        verbose_name='Ek Hizmet'
    )
    
    # Fiyat bilgisi — satış anındaki fiyat sabitlenir
    fiyat = models.DecimalField(
        'Fiyat',
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text='Satış anındaki fiyat. Dahil ise 0.'
    )
    
    # Pakete dahil mi?
    dahil_mi = models.BooleanField(
        'Pakete Dahil',
        default=False,
        help_text='True ise ücretsiz — eğitim paketine (grup dersi) dahildir'
    )
    
    # Hangi paketin dahilinde? (opsiyonel)
    kaynak_paket_turu = models.CharField(
        'Kaynak Paket Türü',
        max_length=20,
        blank=True,
        help_text='Dahil olduğu paket türü: grup_dersi, ozel_ders vb.'
    )
    kaynak_paket_id = models.IntegerField(
        'Kaynak Paket ID',
        null=True,
        blank=True,
        help_text='Dahil olduğu paketin DB ID\'si'
    )
    
    # Eğitim yılı — erişim kontrolü için
    egitim_yili = models.ForeignKey(
        'egitim_yili.EgitimYili',
        on_delete=models.PROTECT,
        related_name='ogrenci_ek_hizmetleri',
        verbose_name='Eğitim Yılı',
        null=True,
        blank=True
    )
    
    aktif_mi = models.BooleanField('Aktif', default=True)
    
    baslangic_tarihi = models.DateField('Başlangıç Tarihi', null=True, blank=True)
    bitis_tarihi = models.DateField('Bitiş Tarihi', null=True, blank=True)
    
    created_at = models.DateTimeField('Oluşturma Tarihi', auto_now_add=True)
    updated_at = models.DateTimeField('Güncelleme Tarihi', auto_now=True)
    
    class Meta:
        db_table = 'ogrenci_ek_hizmet'
        verbose_name = 'Öğrenci Ek Hizmet'
        verbose_name_plural = 'Öğrenci Ek Hizmetleri'
        ordering = ['-created_at']
        constraints = [
            # Aynı öğrenci aynı ek hizmetten sadece 1 aktif kayıt
            models.UniqueConstraint(
                fields=['ogrenci', 'ek_hizmet'],
                condition=models.Q(aktif_mi=True),
                name='unique_ogrenci_ek_hizmet_aktif'
            )
        ]
        indexes = [
            models.Index(fields=['ogrenci', 'aktif_mi']),
            models.Index(fields=['ek_hizmet', 'aktif_mi']),
            models.Index(fields=['egitim_yili', 'aktif_mi']),
        ]
    
    def __str__(self):
        durum = "Dahil" if self.dahil_mi else f"{self.fiyat} TL"
        return f"{self.ogrenci.tam_ad} — {self.ek_hizmet.ad} ({durum})"
    
    @property
    def hizmet_turu(self):
        """Ek hizmetin türünü döndürür — kolay erişim"""
        return self.ek_hizmet.hizmet_turu

